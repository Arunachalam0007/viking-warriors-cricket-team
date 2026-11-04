import "server-only";
import { and, gte, inArray, ne, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import { aiUsage, matches, players } from "@/db/schema";
import { dateRangeToInstants, formatDate, formatMonth, todayIst } from "@/lib/dates";
import { listAiContent } from "./content";

/** Calls per feature and provider since `from` (public-chat question markers left out). */
export async function usageSince(db: Executor, from: Date) {
  const rows = await db
    .select({
      feature: aiUsage.feature,
      provider: aiUsage.provider,
      calls: sql<number>`count(*)`.mapWith(Number),
      failed: sql<number>`count(*) filter (where not ${aiUsage.ok})`.mapWith(Number),
      tokens: sql<number>`coalesce(sum(coalesce(${aiUsage.inputTokens}, 0) + coalesce(${aiUsage.outputTokens}, 0)), 0)`.mapWith(Number),
    })
    .from(aiUsage)
    .where(and(gte(aiUsage.at, from), ne(aiUsage.model, "question")))
    .groupBy(aiUsage.feature, aiUsage.provider);
  return rows;
}

export async function aiDashboard(db: Executor = getDb()) {
  const today = dateRangeToInstants(todayIst(), todayIst()).start;
  const week = new Date(today.getTime() - 6 * 86_400_000);
  const [todayRows, weekRows, [questions], lastErrors] = await Promise.all([
    usageSince(db, today),
    usageSince(db, week),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(aiUsage).where(and(gte(aiUsage.at, today), sql`${aiUsage.model} = 'question'`)),
    db.select().from(aiUsage).where(sql`not ${aiUsage.ok}`).orderBy(sql`${aiUsage.id} desc`).limit(6),
  ]);
  return { todayRows, weekRows, questionsToday: questions.n, lastErrors };
}

/** Generated texts with a readable label for what each one is about. */
export async function aiContentList(db: Executor = getDb()) {
  const rows = await listAiContent(db, 300);
  const matchIds = [...new Set(rows.filter((r) => r.kind === "match_summary").map((r) => r.subjectId))];
  const playerIds = [...new Set(rows.filter((r) => r.kind === "player_insight").map((r) => r.subjectId))];
  const [ms, ps] = await Promise.all([
    matchIds.length ? db.select({ id: matches.id, opponent: matches.opponentName, at: matches.startTime }).from(matches).where(inArray(matches.id, matchIds)) : [],
    playerIds.length ? db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, playerIds)) : [],
  ]);
  const label = (kind: string, subject: string) => {
    if (kind === "match_summary") {
      const m = ms.find((x) => x.id === subject);
      return { text: m ? `vs ${m.opponent} · ${formatDate(m.at)}` : "Deleted match", href: m ? `/matches/${m.id}` : null };
    }
    if (kind === "player_insight") {
      const p = ps.find((x) => x.id === subject);
      return { text: p?.name ?? "Deleted player", href: p ? `/players/${p.id}` : null };
    }
    if (kind === "period_writeup") {
      const [type, value] = subject.split(":");
      const text = type === "week" ? `Week of ${formatDate(value, { day: "numeric", month: "short" })}` : type === "month" ? formatMonth(value) : `Season since ${formatDate(value)}`;
      return { text, href: `/leaderboard?period=${type}${type === "week" ? `&week=${value}` : type === "month" ? `&month=${value}` : ""}` };
    }
    return { text: "Data checks summary", href: "/admin/sync" };
  };
  return rows.map((r) => ({ ...r, label: label(r.kind, r.subjectId) }));
}
