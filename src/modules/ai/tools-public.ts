import "server-only";
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { players } from "@/db/schema";
import { addDays, formatDate, formatMonth, monthDateRange, todayIst, weekStart } from "@/lib/dates";
import { economy, rupees, strikeRate } from "@/lib/format";
import { getChargeRows, getPlayerBalances } from "@/modules/finance/queries";
import type { Settings } from "@/modules/settings/settings";
import { getMatches, getPlayerStats, getTeamRecord } from "@/modules/stats/queries";
import { getAiTexts } from "./content";
import { matchFacts, playerFacts } from "./facts";

/*
 * What "AI-Viking-Bot" can look up for anyone. Read-only, and only what the public pages show:
 * no phone numbers, no payments detail, no expenses, no cash holders. Balances only when the
 * admin setting "Show each player's balance on the public site" is on.
 */

export type ToolContext = { db: Executor; settings: Settings };

const month = z.string().regex(/^\d{4}-\d{2}$/).describe("Month as YYYY-MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date as YYYY-MM-DD");

function periodRange(settings: Settings, p: { period: "week" | "month" | "season"; month?: string; weekOf?: string }) {
  const today = todayIst();
  if (p.period === "week") {
    const from = weekStart(p.weekOf ?? today);
    return { from, to: addDays(from, 6), label: `week of ${formatDate(from, { day: "numeric", month: "short" })}`, key: `week:${from}` };
  }
  if (p.period === "month") {
    const m = p.month ?? today.slice(0, 7);
    return { ...monthDateRange(m), label: formatMonth(m), key: `month:${m}` };
  }
  return { from: settings.sync_start_date, to: today, label: `season since ${formatDate(settings.sync_start_date)}`, key: `season:${settings.sync_start_date}` };
}

const matchRow = (m: Awaited<ReturnType<typeof getMatches>>[number]) => ({
  matchId: m.id,
  url: `/matches/${m.id}`,
  date: formatDate(m.startTime, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }),
  opponent: m.opponentName,
  type: m.kind === "tournament" ? (m.tournamentName ?? "tournament") : "individual",
  ground: [m.ground, m.city].filter(Boolean).join(", ") || null,
  status: m.status === "past" ? "played" : "upcoming",
  outcome: m.outcome,
  result: m.resultText,
  ourScore: m.ourScore,
  opponentScore: m.opponentScore,
});

export function publicTools({ db, settings }: ToolContext) {
  return {
    listPlayers: tool({
      description:
        "All players with their ids. Call this first whenever a question names a player, to find the right id (names may be typed in Tamil script or with spelling mistakes; match them yourself).",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select({ id: players.id, name: players.name, isMember: players.isMember, isActive: players.isActive, isCaptain: players.isCaptain })
          .from(players);
        return rows.map((p) => ({ playerId: p.id, name: p.name, url: `/players/${p.id}`, squadMember: p.isMember, active: p.isActive, captain: p.isCaptain }));
      },
    }),

    playerProfile: tool({
      description: "One player's season stats, last matches, AI form note and (if public) money owed.",
      inputSchema: z.object({ playerId: z.uuid() }),
      execute: async ({ playerId }) => {
        const [p] = await db.select().from(players).where(eq(players.id, playerId));
        if (!p) return { error: "No player with that id" };
        const [facts, [all], insight] = await Promise.all([
          playerFacts(db, playerId, settings.sync_start_date),
          getPlayerStats(db, {}, playerId),
          getAiTexts(db, "player_insight", playerId),
        ]);
        let money: unknown = "not shown publicly";
        if (settings.public_show_balances) {
          const b = (await getPlayerBalances(db)).find((x) => x.playerId === playerId);
          money = b ? { charged: rupees(b.charged), paid: rupees(b.paid), balance: b.balance > 0 ? `owes ${rupees(b.balance)}` : b.balance < 0 ? `credit ${rupees(-b.balance)}` : "nothing due" } : "no charges";
        }
        return {
          name: p.name,
          url: `/players/${p.id}`,
          role: [p.battingStyle, p.bowlingStyle].filter(Boolean).join(", ") || null,
          squadMember: p.isMember,
          captain: p.isCaptain,
          allTime: all
            ? { matches: all.matches, runs: all.runs, strikeRate: strikeRate(all.runs, all.balls), highest: all.highest, wickets: all.wickets, economy: economy(all.runsConceded, all.ballsBowled), catches: all.catches, mvpPoints: all.mvp }
            : null,
          season: facts?.season ?? null,
          lastMatches: facts?.lastMatches ?? [],
          formNote: insight.map((t) => ({ lang: t.lang, text: t.body })),
          money,
        };
      },
    }),

    leaderboard: tool({
      description: "Rankings for a week, a month or the season: MVP points, runs, wickets, catches or strike rate.",
      inputSchema: z.object({
        period: z.enum(["week", "month", "season"]),
        month: month.optional().describe("For period=month; default this month"),
        weekOf: date.optional().describe("Any date in the week, for period=week; default this week"),
        metric: z.enum(["mvp", "runs", "wickets", "catches", "strikeRate"]).default("mvp"),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      execute: async ({ period, month: m, weekOf, metric, limit }) => {
        const range = periodRange(settings, { period, month: m, weekOf });
        const stats = await getPlayerStats(db, { from: range.from, to: range.to });
        const key = {
          mvp: (s: (typeof stats)[number]) => s.mvp,
          runs: (s: (typeof stats)[number]) => s.runs,
          wickets: (s: (typeof stats)[number]) => s.wickets * 1000 - s.runsConceded,
          catches: (s: (typeof stats)[number]) => s.catches + s.stumpings + s.runOuts,
          strikeRate: (s: (typeof stats)[number]) => (s.balls >= 20 ? s.runs / s.balls : -1),
        }[metric];
        const writeup = await getAiTexts(db, "period_writeup", range.key);
        return {
          period: range.label,
          metric,
          rows: [...stats]
            .sort((a, b) => key(b) - key(a))
            .filter((s) => key(s) > 0)
            .slice(0, limit)
            .map((s, i) => ({ rank: i + 1, name: s.name, url: `/players/${s.playerId}`, matches: s.matches, mvpPoints: s.mvp, runs: s.runs, strikeRate: strikeRate(s.runs, s.balls), wickets: s.wickets, economy: economy(s.runsConceded, s.ballsBowled), catches: s.catches })),
          writeup: writeup.map((t) => ({ lang: t.lang, text: t.body })),
        };
      },
    }),

    matches: tool({
      description: "Upcoming fixtures (from today) or played matches, newest first, optionally for a month or an opponent.",
      inputSchema: z.object({
        status: z.enum(["upcoming", "played"]),
        month: month.optional(),
        opponent: z.string().optional().describe("Part of the opponent's name"),
        limit: z.number().int().min(1).max(30).default(10),
      }),
      execute: async ({ status, month: m, opponent, limit }) => {
        const range = m ? monthDateRange(m) : {};
        const rows = await getMatches(db, { status: status === "played" ? "past" : "upcoming", ...range });
        const filtered = opponent ? rows.filter((r) => r.opponentName.toLowerCase().includes(opponent.toLowerCase())) : rows;
        return { count: filtered.length, matches: filtered.slice(0, limit).map(matchRow) };
      },
    }),

    matchDetail: tool({
      description: "Full scorecard facts of one played match (batting, bowling, fielding, player of the match) and its AI match report.",
      inputSchema: z.object({ matchId: z.uuid() }),
      execute: async ({ matchId }) => {
        const [facts, report] = await Promise.all([matchFacts(db, matchId), getAiTexts(db, "match_summary", matchId)]);
        if (!facts) {
          const [m] = (await getMatches(db, {})).filter((x) => x.id === matchId);
          return m ? { ...matchRow(m), note: "Not played yet, so there is no scorecard" } : { error: "No match with that id" };
        }
        return { url: `/matches/${matchId}`, ...facts, report: report.map((t) => ({ lang: t.lang, text: t.body })) };
      },
    }),

    teamRecord: tool({
      description: "Won / lost / abandoned counts for a month or the season.",
      inputSchema: z.object({ month: month.optional().describe("Leave out for the whole season") }),
      execute: async ({ month: m }) => {
        const range = m ? monthDateRange(m) : { from: settings.sync_start_date, to: todayIst() };
        return { period: m ? formatMonth(m) : `season since ${formatDate(settings.sync_start_date)}`, ...(await getTeamRecord(db, range)) };
      },
    }),

    dues: tool({
      description: "Match-fee dues: who owes how much (all players), or one player's unpaid matches. Also the fee rules.",
      inputSchema: z.object({ playerId: z.uuid().optional().describe("Leave out for everyone") }),
      execute: async ({ playerId }) => {
        const rules = `₹${settings.match_fee} per squad member for every played or abandoned individual (practice) match from ${formatDate(settings.finance_start_date)}. Tournament matches, upcoming matches and guest players are not charged; tournament money is collected separately by the admins.`;
        const howToPay = settings.upi_id ? `Pay by UPI to ${settings.upi_id}, then tell an admin.` : "Pay the team admins (cash or UPI).";
        if (!settings.public_show_balances) return { rules, howToPay, note: "Individual balances are not shown publicly. Ask an admin." };
        if (playerId) {
          const rows = (await getChargeRows(db, { playerId, status: "due" })).map((c) => ({ date: formatDate(c.chargeDate), for: c.description, amount: rupees(c.amount), due: rupees(c.due) }));
          const b = (await getPlayerBalances(db)).find((x) => x.playerId === playerId);
          return { rules, howToPay, balance: b ? (b.balance > 0 ? `owes ${rupees(b.balance)}` : b.balance < 0 ? `credit ${rupees(-b.balance)}` : "nothing due") : "no charges", unpaid: rows };
        }
        const balances = (await getPlayerBalances(db)).filter((b) => b.balance !== 0).sort((a, b) => b.balance - a.balance);
        return {
          rules,
          howToPay,
          totalOutstanding: rupees(balances.reduce((s, b) => s + Math.max(b.balance, 0), 0)),
          owing: balances.filter((b) => b.balance > 0).map((b) => ({ name: b.name, url: `/players/${b.playerId}`, owes: rupees(b.balance) })),
          inCredit: balances.filter((b) => b.balance < 0).map((b) => ({ name: b.name, credit: rupees(-b.balance) })),
          financePage: "/finance",
        };
      },
    }),

    siteGuide: tool({
      description: "How to use this website: what each page shows and where to find things.",
      inputSchema: z.object({}),
      execute: async () => ({
        pages: [
          { page: "Dashboard", url: "/", shows: "Team record, upcoming fixtures, recent results, top performers, dues summary" },
          { page: "Players", url: "/players", shows: "Every player with photo; tap one for their profile, stats, form note and dues" },
          { page: "Leaderboard", url: "/leaderboard", shows: "Weekly top players, monthly performers and the season table by MVP points, with an AI write-up" },
          { page: "Matches", url: "/matches", shows: "Fixtures and results month by month; a match page has the scorecard and an AI match report" },
          { page: "Finance", url: "/finance", shows: "Match fees per player and per match, paid / unpaid, month filter, Excel download" },
          { page: "Reports", url: "/reports", shows: "Season top performers and monthly charts" },
        ],
        data: "Scores come from CricHeroes and are refreshed every night at 23:30 India time. Admins record payments.",
        mvpPoints: "MVP points add up runs, boundaries, wickets, maidens and fielding (see the Leaderboard page).",
      }),
    }),
  };
}

