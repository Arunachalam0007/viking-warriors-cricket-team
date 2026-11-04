import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import { charges, matches, matchPlayers, players, syncRuns } from "@/db/schema";
import { dateRangeToInstants, formatDate, todayIst } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { getPlayerBalances } from "@/modules/finance/queries";
import { getSettings } from "@/modules/settings/settings";

export type SyncCheck = { id: string; severity: "warn" | "info"; title: string; detail: string; href?: string };

const rowsOf = <T,>(r: unknown) => (Array.isArray(r) ? r : (r as { rows: T[] }).rows) as T[];

/**
 * Things an admin should look at after a sync. Plain rules over the database, so they are exact;
 * the AI only writes the short summary on top (generate.ts).
 */
export async function runSyncChecks(db: Executor = getDb()): Promise<SyncCheck[]> {
  const settings = await getSettings(db);
  const out: SyncCheck[] = [];
  const todayStart = dateRangeToInstants(todayIst(), todayIst()).start;
  const seasonStart = dateRangeToInstants(settings.sync_start_date, settings.sync_start_date).start;

  // 1. Fixtures that were never scored
  const stale = await db
    .select({ id: matches.id, opponent: matches.opponentName, at: matches.startTime })
    .from(matches)
    .where(and(sql`${matches.status} <> 'past'`, sql`${matches.startTime} < ${todayStart}`, sql`${matches.startTime} >= ${seasonStart}`));
  for (const m of stale) {
    out.push({
      id: `stale:${m.id}`,
      severity: "info",
      title: `Match vs ${m.opponent} on ${formatDate(m.at)} was never scored`,
      detail: "It shows as “Not played”. If it was played, score it on CricHeroes; if it was called off, delete it there and the next sync removes it.",
      href: `/matches/${m.id}`,
    });
  }

  // 2. Played matches with no playing XI
  const noXi = await db
    .select({ id: matches.id, opponent: matches.opponentName, at: matches.startTime })
    .from(matches)
    .where(
      and(
        eq(matches.status, "past"),
        sql`${matches.startTime} >= ${seasonStart}`,
        sql`not exists (select 1 from match_players mp where mp.match_id = "matches"."id" and mp.played)`,
      ),
    );
  for (const m of noXi) {
    out.push({
      id: `noxi:${m.id}`,
      severity: "warn",
      title: `No players recorded for the match vs ${m.opponent} (${formatDate(m.at)})`,
      detail: "Nobody can be charged the match fee until the players are added. Add them under Match fees, or fix the scorecard on CricHeroes.",
      href: `/admin/fees/${m.id}`,
    });
  }

  // 3. Fee rows that do not match who played (chargeable matches only)
  const mismatch = rowsOf<{ id: string; opponent: string; at: Date; members: number; fees: number }>(
    await db.execute(sql`
      select m.id, m.opponent_name as opponent, m.start_time as at,
        (select count(*) from ${matchPlayers} mp join ${players} p on p.id = mp.player_id where mp.match_id = m.id and mp.played and p.is_member)::int as members,
        (select count(*) from ${charges} c where c.match_id = m.id and c.kind = 'match_fee' and not c.waived)::int as fees
      from ${matches} m
      where m.status = 'past' and m.chargeable
        -- a fee an admin waived or edited is a decision, not a mistake
        and not exists (select 1 from ${charges} c where c.match_id = m.id and c.kind = 'match_fee' and (c.waived or c.admin_locked))
    `),
  ).filter((r) => r.members !== r.fees);
  for (const m of mismatch) {
    out.push({
      id: `fees:${m.id}`,
      severity: "warn",
      title: `Match vs ${m.opponent} (${formatDate(m.at)}): ${m.members} members played but ${m.fees} match fees are charged`,
      detail: "Open the match to check who played; saving it there recalculates the fees.",
      href: `/admin/fees/${m.id}`,
    });
  }

  // 4. Regular guests (guests are never charged)
  const guests = rowsOf<{ id: string; name: string; n: number }>(
    await db.execute(sql`
      select p.id, p.name, count(*)::int as n
      from ${matchPlayers} mp join ${players} p on p.id = mp.player_id join ${matches} m on m.id = mp.match_id
      where mp.played and not p.is_member and m.status = 'past' and m.start_time >= ${seasonStart}
      group by p.id, p.name having count(*) >= 3
    `),
  );
  for (const g of guests) {
    out.push({
      id: `guest:${g.id}`,
      severity: "info",
      title: `${g.name} has played ${g.n} matches as a guest`,
      detail: "Guests are never charged. If they are now part of the squad, mark them as a member under Manage players.",
      href: "/admin/players",
    });
  }

  // 5. Same name twice (often one person with two CricHeroes profiles)
  const dupes = rowsOf<{ name: string; n: number }>(
    await db.execute(sql`select lower(${players.name}) as name, count(*)::int as n from ${players} group by lower(${players.name}) having count(*) > 1`),
  );
  for (const d of dupes) {
    out.push({ id: `dupe:${d.name}`, severity: "info", title: `${d.n} players are named “${d.name}”`, detail: "Check they are different people; fees and stats are counted separately.", href: "/admin/players" });
  }

  // 6. Dues and advance credit
  const balances = (await getPlayerBalances(db)).filter((b) => b.isMember);
  const bigDues = balances.filter((b) => b.balance >= 6 * settings.match_fee).sort((a, b) => b.balance - a.balance);
  if (bigDues.length) {
    out.push({
      id: `dues:${bigDues.map((b) => `${b.playerId}=${b.balance}`).join(",")}`,
      severity: "info",
      title: `${bigDues.length} player${bigDues.length > 1 ? "s owe" : " owes"} ${rupees(6 * settings.match_fee)} or more`,
      detail: bigDues.map((b) => `${b.name} ${rupees(b.balance)}`).join(", ") + ". Dues reminders can draft a friendly message.",
      href: "/admin/reminders",
    });
  }

  // 7. The last CricHeroes sync
  const [last] = await db.select().from(syncRuns).where(eq(syncRuns.kind, "cricheroes")).orderBy(desc(syncRuns.startedAt)).limit(1);
  if (last?.status === "failed") {
    out.push({ id: `sync:${last.id}`, severity: "warn", title: "The last CricHeroes sync failed", detail: last.error ?? "See Sync & logs.", href: "/admin/sync" });
  }
  const warnings = ((last?.summary as { warnings?: string[] } | null)?.warnings ?? []).slice(0, 5);
  if (last?.status === "success" && warnings.length) {
    out.push({ id: `syncwarn:${last.id}`, severity: "info", title: `The last sync had ${warnings.length} warning${warnings.length > 1 ? "s" : ""}`, detail: warnings.join(" · "), href: "/admin/sync" });
  }

  return out;
}
