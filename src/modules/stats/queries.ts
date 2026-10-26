import "server-only";
import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import { matches, matchPlayers, playerMatchStats, players } from "@/db/schema";
import { dateRangeToInstants, istDate } from "@/lib/dates";
import { mvpPoints } from "./mvp";

export type PeriodFilter = { from?: string; to?: string }; // IST dates, inclusive

export type PlayerStats = {
  playerId: string;
  name: string;
  photo: string | null;
  isMember: boolean;
  matches: number;
  innings: number;
  runs: number;
  balls: number;
  outs: number;
  highest: number;
  highestNotOut: boolean;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  bestWickets: number;
  bestRuns: number; // -1 when the player has not bowled
  catches: number;
  stumpings: number;
  runOuts: number;
  mvp: number;
};

function periodWhere(f: PeriodFilter): SQL[] {
  const where: SQL[] = [eq(matches.status, "past")];
  if (f.from || f.to) {
    const { start, end } = dateRangeToInstants(f.from ?? "2000-01-01", f.to ?? "2100-01-01");
    where.push(gte(matches.startTime, start), lt(matches.startTime, end));
  }
  return where;
}

/** Aggregated batting / bowling / fielding per player for a period. */
export async function getPlayerStats(db: Executor = getDb(), f: PeriodFilter = {}, playerId?: string): Promise<PlayerStats[]> {
  const where = periodWhere(f);
  if (playerId) where.push(eq(players.id, playerId));

  const rows = await db
    .select({
      playerId: players.id,
      name: players.name,
      photoUrl: players.photoUrl,
      chPhotoUrl: players.chPhotoUrl,
      isMember: players.isMember,
      s: playerMatchStats,
    })
    .from(playerMatchStats)
    .innerJoin(matches, eq(matches.id, playerMatchStats.matchId))
    .innerJoin(players, eq(players.id, playerMatchStats.playerId))
    .innerJoin(
      matchPlayers,
      and(eq(matchPlayers.matchId, playerMatchStats.matchId), eq(matchPlayers.playerId, playerMatchStats.playerId)),
    )
    .where(and(...where, eq(matchPlayers.played, true)));

  const map = new Map<string, PlayerStats>();
  for (const r of rows) {
    let p = map.get(r.playerId);
    if (!p) {
      p = {
        playerId: r.playerId,
        name: r.name,
        photo: r.photoUrl ?? r.chPhotoUrl,
        isMember: r.isMember,
        matches: 0,
        innings: 0,
        runs: 0,
        balls: 0,
        outs: 0,
        highest: 0,
        highestNotOut: false,
        fours: 0,
        sixes: 0,
        fifties: 0,
        hundreds: 0,
        ballsBowled: 0,
        runsConceded: 0,
        wickets: 0,
        maidens: 0,
        bestWickets: 0,
        bestRuns: -1, // -1 = has not bowled
        catches: 0,
        stumpings: 0,
        runOuts: 0,
        mvp: 0,
      };
      map.set(r.playerId, p);
    }
    const s = r.s;
    p.matches++;
    if (s.batted) p.innings++;
    p.runs += s.runs;
    p.balls += s.ballsFaced;
    if (s.isOut) p.outs++;
    if (s.runs > p.highest || (s.runs === p.highest && !s.isOut)) {
      p.highest = s.runs;
      p.highestNotOut = s.batted && !s.isOut;
    }
    p.fours += s.fours;
    p.sixes += s.sixes;
    if (s.runs >= 100) p.hundreds++;
    else if (s.runs >= 50) p.fifties++;
    p.ballsBowled += s.ballsBowled;
    p.runsConceded += s.runsConceded;
    p.wickets += s.wickets;
    p.maidens += s.maidens;
    if (s.ballsBowled > 0 && (p.bestRuns < 0 || s.wickets > p.bestWickets || (s.wickets === p.bestWickets && s.runsConceded < p.bestRuns))) {
      p.bestWickets = s.wickets;
      p.bestRuns = s.runsConceded;
    }
    p.catches += s.catches;
    p.stumpings += s.stumpings;
    p.runOuts += s.runOuts;
    p.mvp += mvpPoints({
      runs: s.runs,
      fours: s.fours,
      sixes: s.sixes,
      wickets: s.wickets,
      maidens: s.maidens,
      catches: s.catches,
      stumpings: s.stumpings,
      runOuts: s.runOuts,
    });
  }
  return [...map.values()];
}

export type TeamRecord = { played: number; won: number; lost: number; abandoned: number; other: number };

export async function getTeamRecord(db: Executor = getDb(), f: PeriodFilter = {}): Promise<TeamRecord> {
  const rows = await db
    .select({ outcome: matches.outcome, n: sql<number>`count(*)`.mapWith(Number) })
    .from(matches)
    .where(and(...periodWhere(f)))
    .groupBy(matches.outcome);
  const get = (o: string) => rows.find((r) => r.outcome === o)?.n ?? 0;
  const played = rows.reduce((s, r) => s + r.n, 0);
  const won = get("won");
  const lost = get("lost");
  const abandoned = get("abandoned");
  return { played, won, lost, abandoned, other: played - won - lost - abandoned };
}

export async function getMatches(
  db: Executor = getDb(),
  opts: PeriodFilter & { kind?: string; status?: "past" | "upcoming"; limit?: number } = {},
) {
  const where: SQL[] = [];
  if (opts.status === "past") where.push(eq(matches.status, "past"));
  if (opts.status === "upcoming") {
    // CricHeroes keeps a fixture "upcoming" forever if it is never scored (e.g. called off),
    // so anything dated before today is no longer a coming match.
    where.push(sql`${matches.status} <> 'past'`, gte(matches.startTime, dateRangeToInstants(istDate(new Date()), istDate(new Date())).start));
  }
  if (opts.kind) where.push(eq(matches.kind, opts.kind));
  if (opts.from || opts.to) {
    const { start, end } = dateRangeToInstants(opts.from ?? "2000-01-01", opts.to ?? "2100-01-01");
    where.push(gte(matches.startTime, start), lt(matches.startTime, end));
  }
  const q = db
    .select()
    .from(matches)
    .where(where.length ? and(...where) : undefined)
    .orderBy(opts.status === "upcoming" ? asc(matches.startTime) : desc(matches.startTime));
  return opts.limit ? q.limit(opts.limit) : q;
}

export async function getMatchDetail(db: Executor, matchId: string) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) return null;
  const roster = await db
    .select({
      playerId: players.id,
      name: players.name,
      photoUrl: players.photoUrl,
      chPhotoUrl: players.chPhotoUrl,
      isMember: players.isMember,
      cricheroesPlayerId: players.cricheroesPlayerId,
      played: matchPlayers.played,
      source: matchPlayers.source,
      adminLocked: matchPlayers.adminLocked,
      stats: playerMatchStats,
    })
    .from(matchPlayers)
    .innerJoin(players, eq(players.id, matchPlayers.playerId))
    .leftJoin(
      playerMatchStats,
      and(eq(playerMatchStats.matchId, matchPlayers.matchId), eq(playerMatchStats.playerId, matchPlayers.playerId)),
    )
    .where(eq(matchPlayers.matchId, matchId))
    .orderBy(asc(players.name));
  return {
    match,
    roster: roster.map((r) => ({
      ...r,
      photo: r.photoUrl ?? r.chPhotoUrl,
      mvp: r.stats ? mvpPoints(r.stats) : 0,
    })),
  };
}

export async function getPlayerMatchLog(db: Executor, playerId: string, limit = 20) {
  return db
    .select({
      matchId: matches.id,
      startTime: matches.startTime,
      opponent: matches.opponentName,
      outcome: matches.outcome,
      kind: matches.kind,
      played: matchPlayers.played,
      stats: playerMatchStats,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .leftJoin(
      playerMatchStats,
      and(eq(playerMatchStats.matchId, matchPlayers.matchId), eq(playerMatchStats.playerId, matchPlayers.playerId)),
    )
    .where(and(eq(matchPlayers.playerId, playerId), eq(matchPlayers.played, true)))
    .orderBy(desc(matches.startTime))
    .limit(limit);
}

export type MonthlyTeamTrend = {
  month: string; // YYYY-MM (IST)
  played: number;
  won: number;
  lost: number;
  runs: number;
  wickets: number;
};

/** Team totals per IST month: results, runs scored and wickets taken by our players. */
export async function getMonthlyTeamTrends(db: Executor = getDb(), f: PeriodFilter = {}): Promise<MonthlyTeamTrend[]> {
  const monthExpr = sql<string>`to_char(${matches.startTime} at time zone 'Asia/Kolkata', 'YYYY-MM')`;
  const results = await db
    .select({
      month: monthExpr,
      played: sql<number>`count(*)`.mapWith(Number),
      won: sql<number>`count(*) filter (where ${matches.outcome} = 'won')`.mapWith(Number),
      lost: sql<number>`count(*) filter (where ${matches.outcome} = 'lost')`.mapWith(Number),
    })
    .from(matches)
    .where(and(...periodWhere(f)))
    .groupBy(monthExpr);

  const totals = await db
    .select({
      month: monthExpr,
      runs: sql<number>`coalesce(sum(${playerMatchStats.runs}), 0)`.mapWith(Number),
      wickets: sql<number>`coalesce(sum(${playerMatchStats.wickets}), 0)`.mapWith(Number),
    })
    .from(playerMatchStats)
    .innerJoin(matches, eq(matches.id, playerMatchStats.matchId))
    .where(and(...periodWhere(f)))
    .groupBy(monthExpr);

  return results
    .map((r) => {
      const t = totals.find((x) => x.month === r.month);
      return { ...r, runs: t?.runs ?? 0, wickets: t?.wickets ?? 0 };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}
