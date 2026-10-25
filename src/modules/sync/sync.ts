import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type DB, type Executor } from "@/db";
import { matches, matchPlayers, playerMatchStats, players, syncRuns } from "@/db/schema";
import { istDate } from "@/lib/dates";
import { fetchScorecard, fetchTeamMatches, fetchTeamMembers } from "@/modules/cricheroes/client";
import type { ChMatchSummary, ChMember, ChScorecard } from "@/modules/cricheroes/types";
import { extractTeamPerformance } from "@/modules/cricheroes/team-performance";
import { reconcileMatchCharges } from "@/modules/finance/ledger";
import { defaultMatchKind, isChargeableByDefault, matchOutcome } from "@/modules/finance/rules";
import { cricheroesTeam, getSettings, type Settings } from "@/modules/settings/settings";

export type SyncSource = {
  teamMatches(teamId: number): Promise<ChMatchSummary[]>;
  teamMembers(teamId: number): Promise<ChMember[]>;
  scorecard(matchId: number): Promise<ChScorecard | null>;
};

/** Reads the real CricHeroes site at `origin` (taken from the team link in Settings). */
export function liveSource(origin: string): SyncSource {
  return {
    teamMatches: (teamId) => fetchTeamMatches(origin, teamId),
    teamMembers: (teamId) => fetchTeamMembers(origin, teamId),
    scorecard: (matchId) => fetchScorecard(origin, matchId),
  };
}

export type SyncSummary = {
  matchesSeen: number;
  matchesNew: number;
  matchesUpdated: number;
  scorecardsFetched: number;
  playersNew: number;
  chargesCreated: number;
  chargesRemoved: number;
  warnings: string[];
};

/** Scorecards are re-read for a few days after a match in case the scorer corrects them. */
const SCORECARD_REFRESH_DAYS = 3;

export async function runCricheroesSync(
  trigger: "cron" | "manual",
  sourceOverride?: SyncSource,
  db: DB = getDb(),
): Promise<{ runId: number; summary: SyncSummary }> {
  const [run] = await db.insert(syncRuns).values({ kind: "cricheroes", trigger }).returning();
  const summary: SyncSummary = {
    matchesSeen: 0,
    matchesNew: 0,
    matchesUpdated: 0,
    scorecardsFetched: 0,
    playersNew: 0,
    chargesCreated: 0,
    chargesRemoved: 0,
    warnings: [],
  };

  try {
    const cfg = await getSettings(db);
    const team = cricheroesTeam(cfg);
    const teamId = team.teamId;
    const source = sourceOverride ?? liveSource(team.origin);

    // 1. Squad
    try {
      const members = await source.teamMembers(teamId);
      summary.playersNew += await upsertMembers(db, members);
    } catch (e) {
      summary.warnings.push(`Members page: ${(e as Error).message}`);
    }

    // 2. Matches
    const list = (await source.teamMatches(teamId)).filter((m) => istDate(m.startTime) >= cfg.sync_start_date);
    summary.matchesSeen = list.length;

    for (const m of list) {
      const { id, isNew } = await upsertMatch(db, m, teamId, cfg);
      if (isNew) summary.matchesNew++;
      else summary.matchesUpdated++;

      const [row] = await db.select().from(matches).where(eq(matches.id, id));
      const ageDays = (Date.now() - new Date(m.startTime).getTime()) / 86_400_000;
      const needsScorecard = m.status === "past" && (!row.scorecardSyncedAt || ageDays <= SCORECARD_REFRESH_DAYS);

      if (needsScorecard) {
        try {
          const card = await source.scorecard(m.matchId);
          if (card && card.innings.length > 0) {
            summary.playersNew += await saveScorecard(db, id, card, teamId);
            summary.scorecardsFetched++;
          } else {
            summary.warnings.push(`No scorecard for match ${m.matchId} vs ${opponentOf(m, teamId).name} — add players manually`);
          }
        } catch (e) {
          summary.warnings.push(`Scorecard ${m.matchId}: ${(e as Error).message}`);
        }
      }

      const r = await db.transaction((tx) => reconcileMatchCharges(tx, id));
      summary.chargesCreated += r.created;
      summary.chargesRemoved += r.removed;
    }

    await db
      .update(syncRuns)
      .set({ status: "success", finishedAt: sql`now()`, summary: summary as never })
      .where(eq(syncRuns.id, run.id));
    return { runId: run.id, summary };
  } catch (e) {
    await db
      .update(syncRuns)
      .set({ status: "failed", finishedAt: sql`now()`, summary: summary as never, error: (e as Error).message })
      .where(eq(syncRuns.id, run.id));
    throw e;
  }
}

function opponentOf(m: ChMatchSummary, teamId: number) {
  return m.teamA.id === teamId ? m.teamB : m.teamA;
}
function usOf(m: ChMatchSummary, teamId: number) {
  return m.teamA.id === teamId ? m.teamA : m.teamB;
}

async function upsertMembers(db: Executor, members: ChMember[]): Promise<number> {
  let created = 0;
  for (const m of members) {
    const [existing] = await db.select().from(players).where(eq(players.cricheroesPlayerId, m.playerId));
    if (!existing) {
      await db.insert(players).values({
        cricheroesPlayerId: m.playerId,
        chName: m.name,
        chPhotoUrl: m.photoUrl,
        name: m.name,
        battingStyle: m.battingStyle,
        bowlingStyle: m.bowlingStyle,
        isCaptain: m.isCaptain,
        isMember: true,
      });
      created++;
    } else {
      await db
        .update(players)
        .set({
          chName: m.name,
          chPhotoUrl: m.photoUrl,
          battingStyle: m.battingStyle,
          bowlingStyle: m.bowlingStyle,
          isCaptain: m.isCaptain,
          ...(existing.nameLocked ? {} : { name: m.name }),
          updatedAt: sql`now()`,
        })
        .where(eq(players.id, existing.id));
    }
  }
  return created;
}

async function upsertMatch(db: Executor, m: ChMatchSummary, teamId: number, cfg: Settings) {
  const opp = opponentOf(m, teamId);
  const us = usOf(m, teamId);
  const base = {
    startTime: new Date(m.startTime),
    status: m.status,
    resultType: m.result,
    outcome: matchOutcome(m, teamId),
    resultText: m.summary || (m.winBy ? `won by ${m.winBy}` : null),
    tournamentName: m.tournamentName || null,
    opponentName: opp.name,
    opponentLogo: opp.logo || null,
    ground: m.ground || null,
    city: m.city || null,
    overs: m.overs || null,
    ballType: m.ballType || null,
    ourScore: us.score || null,
    opponentScore: opp.score || null,
    pomCricheroesPlayerId: m.pomPlayerId || null,
  };

  const [existing] = await db.select().from(matches).where(eq(matches.cricheroesMatchId, m.matchId));
  const kind = existing?.financeLocked ? existing.kind : defaultMatchKind(m.tournamentName);
  // The fee is fixed when the match finishes, so changing the default fee later
  // in Settings never rewrites past matches.
  const feeOpen = !existing || existing.status !== "past";
  const finance = existing?.financeLocked
    ? {}
    : {
        kind,
        chargeable: isChargeableByDefault({ status: m.status, kind, startTime: m.startTime }, cfg.finance_start_date),
        ...(feeOpen ? { feePerPlayer: Number(cfg.match_fee) } : {}),
      };

  if (existing) {
    await db
      .update(matches)
      .set({ ...base, ...finance, updatedAt: sql`now()` })
      .where(eq(matches.id, existing.id));
    return { id: existing.id, isNew: false };
  }
  const [row] = await db
    .insert(matches)
    .values({ cricheroesMatchId: m.matchId, ...base, ...finance, kind })
    .returning({ id: matches.id });
  return { id: row.id, isNew: true };
}

/** Saves our XI and their figures. Unknown players are created as guests (not charged). */
async function saveScorecard(db: DB, matchId: string, card: ChScorecard, teamId: number): Promise<number> {
  const xi = extractTeamPerformance(card, teamId);
  let created = 0;

  await db.transaction(async (tx) => {
    const ids = xi.map((p) => p.cricheroesPlayerId);
    const known = ids.length
      ? await tx.select().from(players).where(inArray(players.cricheroesPlayerId, ids))
      : [];
    const byChId = new Map(known.map((p) => [p.cricheroesPlayerId!, p]));

    for (const perf of xi) {
      let player = byChId.get(perf.cricheroesPlayerId);
      if (!player) {
        [player] = await tx
          .insert(players)
          .values({ cricheroesPlayerId: perf.cricheroesPlayerId, chName: perf.name, name: perf.name, isMember: false })
          .returning();
        created++;
      }

      const [link] = await tx
        .select()
        .from(matchPlayers)
        .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, player.id)));
      if (!link) {
        await tx.insert(matchPlayers).values({ matchId, playerId: player.id, source: "cricheroes" });
      }

      const stats = {
        batted: perf.batted,
        runs: perf.runs,
        ballsFaced: perf.ballsFaced,
        fours: perf.fours,
        sixes: perf.sixes,
        isOut: perf.isOut,
        dismissal: perf.dismissal,
        ballsBowled: perf.ballsBowled,
        maidens: perf.maidens,
        runsConceded: perf.runsConceded,
        wickets: perf.wickets,
        dotBalls: perf.dotBalls,
        wides: perf.wides,
        noBalls: perf.noBalls,
        catches: perf.catches,
        stumpings: perf.stumpings,
        runOuts: perf.runOuts,
      };
      await tx
        .insert(playerMatchStats)
        .values({ matchId, playerId: player.id, ...stats })
        .onConflictDoUpdate({ target: [playerMatchStats.matchId, playerMatchStats.playerId], set: stats });
    }

    // Players the scorer removed from the scorecard (unless an admin pinned them)
    const xiPlayerIds = (
      await tx.select({ id: players.id }).from(players).where(inArray(players.cricheroesPlayerId, ids.length ? ids : [-1]))
    ).map((p) => p.id);
    await tx
      .delete(matchPlayers)
      .where(
        and(
          eq(matchPlayers.matchId, matchId),
          eq(matchPlayers.source, "cricheroes"),
          eq(matchPlayers.adminLocked, false),
          xiPlayerIds.length ? sql`${matchPlayers.playerId} not in ${xiPlayerIds}` : sql`true`,
        ),
      );

    await tx.update(matches).set({ scorecardSyncedAt: sql`now()` }).where(eq(matches.id, matchId));
  });

  return created;
}
