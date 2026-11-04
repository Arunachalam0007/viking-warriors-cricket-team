import "server-only";
import type { Executor } from "@/db";
import { addDays, formatDate, formatMonth, monthDateRange, todayIst, weekStart } from "@/lib/dates";
import { ballsToOvers, economy, strikeRate } from "@/lib/format";
import { getMatchDetail, getMatches, getPlayerMatchLog, getPlayerStats, getTeamRecord, type PlayerStats } from "@/modules/stats/queries";
import { mvpPoints } from "@/modules/stats/mvp";

/*
 * The plain facts each AI text is written from. The AI sees only these, so it cannot make up a
 * score; the hash of these facts decides when a text is out of date.
 */

export async function matchFacts(db: Executor, matchId: string) {
  const detail = await getMatchDetail(db, matchId);
  if (!detail || detail.match.status !== "past") return null;
  const { match, roster } = detail;
  const xi = roster.filter((r) => r.played);
  const pom = match.pomCricheroesPlayerId ? roster.find((r) => r.cricheroesPlayerId === match.pomCricheroesPlayerId) : undefined;
  return {
    date: formatDate(match.startTime, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    opponent: match.opponentName,
    type: match.kind === "tournament" ? `tournament${match.tournamentName ? ` (${match.tournamentName})` : ""}` : "individual / practice match",
    ground: [match.ground, match.city].filter(Boolean).join(", ") || null,
    overs: match.overs,
    outcome: match.outcome ?? "unknown",
    result: match.resultText,
    ourScore: match.ourScore,
    opponentScore: match.opponentScore,
    playerOfTheMatch: pom?.name ?? null,
    batting: xi
      .filter((r) => r.stats?.batted)
      .sort((a, b) => (b.stats?.runs ?? 0) - (a.stats?.runs ?? 0))
      .map((r) => ({ name: r.name, runs: r.stats!.runs, balls: r.stats!.ballsFaced, fours: r.stats!.fours, sixes: r.stats!.sixes, out: r.stats!.isOut, dismissal: r.stats!.dismissal })),
    bowling: xi
      .filter((r) => (r.stats?.ballsBowled ?? 0) > 0)
      .sort((a, b) => (b.stats?.wickets ?? 0) - (a.stats?.wickets ?? 0) || (a.stats?.runsConceded ?? 0) - (b.stats?.runsConceded ?? 0))
      .map((r) => ({ name: r.name, overs: ballsToOvers(r.stats!.ballsBowled), wickets: r.stats!.wickets, runs: r.stats!.runsConceded, maidens: r.stats!.maidens })),
    fielding: xi
      .filter((r) => (r.stats?.catches ?? 0) + (r.stats?.stumpings ?? 0) + (r.stats?.runOuts ?? 0) > 0)
      .map((r) => ({ name: r.name, catches: r.stats!.catches, stumpings: r.stats!.stumpings, runOuts: r.stats!.runOuts })),
    topMvp: [...xi].sort((a, b) => b.mvp - a.mvp).slice(0, 3).map((r) => ({ name: r.name, mvpPoints: r.mvp })),
  };
}

export type Period = { key: string; label: string; from: string; to: string };

/** The week, month and season write-ups kept up to date: this week, this month, last month, the season. */
export function currentPeriods(seasonStart: string, today = todayIst()): Period[] {
  const week = weekStart(today);
  const month = today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const periods: Period[] = [
    weekPeriod(week),
    monthPeriod(month),
    { key: `season:${seasonStart}`, label: `Season since ${formatDate(seasonStart)}`, from: seasonStart, to: today },
  ];
  if (monthDateRange(prev).to >= seasonStart) periods.splice(2, 0, monthPeriod(prev));
  return periods;
}

export function weekPeriod(week: string): Period {
  return { key: `week:${week}`, label: `Week of ${formatDate(week, { day: "numeric", month: "long" })}`, from: week, to: addDays(week, 6) };
}

export function monthPeriod(month: string): Period {
  return { key: `month:${month}`, label: formatMonth(month), ...monthDateRange(month) };
}

const statLine = (s: PlayerStats) => ({
  name: s.name,
  matches: s.matches,
  mvpPoints: s.mvp,
  runs: s.runs,
  balls: s.balls,
  strikeRate: strikeRate(s.runs, s.balls),
  highest: `${s.highest}${s.highestNotOut ? "*" : ""}`,
  sixes: s.sixes,
  wickets: s.wickets,
  economy: economy(s.runsConceded, s.ballsBowled),
  best: s.bestRuns >= 0 ? `${s.bestWickets}/${s.bestRuns}` : null,
  catches: s.catches,
});

export async function periodFacts(db: Executor, period: Period) {
  const [stats, record, list] = await Promise.all([
    getPlayerStats(db, { from: period.from, to: period.to }),
    getTeamRecord(db, { from: period.from, to: period.to }),
    getMatches(db, { from: period.from, to: period.to, status: "past" }),
  ]);
  if (record.played === 0) return null;
  const by = (f: (s: PlayerStats) => number) => [...stats].sort((a, b) => f(b) - f(a));
  return {
    period: period.label,
    record,
    matches: list.map((m) => ({ date: formatDate(m.startTime, { day: "numeric", month: "short" }), opponent: m.opponentName, outcome: m.outcome, result: m.resultText })),
    mvpTop5: by((s) => s.mvp).slice(0, 5).map(statLine),
    topRunScorers: by((s) => s.runs).filter((s) => s.runs > 0).slice(0, 3).map((s) => ({ name: s.name, runs: s.runs, strikeRate: strikeRate(s.runs, s.balls) })),
    topWicketTakers: by((s) => s.wickets).filter((s) => s.wickets > 0).slice(0, 3).map((s) => ({ name: s.name, wickets: s.wickets, economy: economy(s.runsConceded, s.ballsBowled) })),
    bestFielders: by((s) => s.catches + s.stumpings + s.runOuts).filter((s) => s.catches + s.stumpings + s.runOuts > 0).slice(0, 3).map((s) => ({ name: s.name, catches: s.catches, stumpings: s.stumpings, runOuts: s.runOuts })),
  };
}

/** Season totals plus the last six innings, newest first. Null when there is too little to say. */
export async function playerFacts(db: Executor, playerId: string, seasonStart: string) {
  const [[season], log] = await Promise.all([getPlayerStats(db, { from: seasonStart }, playerId), getPlayerMatchLog(db, playerId, 6)]);
  if (!season || season.matches < 2) return null;
  return {
    player: season.name,
    season: statLine(season),
    lastMatches: log.map((m) => ({
      date: formatDate(m.startTime, { weekday: "short", day: "numeric", month: "short" }),
      opponent: m.opponent,
      outcome: m.outcome,
      batting: m.stats?.batted ? `${m.stats.runs}${m.stats.isOut ? "" : "*"} (${m.stats.ballsFaced})` : "did not bat",
      bowling: m.stats && m.stats.ballsBowled > 0 ? `${m.stats.wickets}/${m.stats.runsConceded} in ${ballsToOvers(m.stats.ballsBowled)} ov` : "did not bowl",
      fielding: m.stats ? m.stats.catches + m.stats.stumpings + m.stats.runOuts : 0,
      mvpPoints: m.stats ? mvpPoints(m.stats) : 0,
    })),
  };
}
