import "server-only";
import { parseScorecard, parseTeamMatches, parseTeamMembers } from "./parser";

const BASE = "https://cricheroes.com";
const USER_AGENT =
  "Mozilla/5.0 (compatible; VikingWarriorsTeamPortal/1.0; nightly team sync; +https://github.com/Arunachalam0007/viking-warriors-cricket-team)";

async function fetchPage(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`CricHeroes ${path} returned HTTP ${res.status}`);
  return res.text();
}

export async function fetchTeamMatches(teamId: number) {
  const matches = parseTeamMatches(await fetchPage(`/team-profile/${teamId}/team/matches`));
  if (matches.length === 0) {
    throw new Error("CricHeroes matches page parsed to 0 matches — the page format may have changed");
  }
  return matches;
}

export async function fetchTeamMembers(teamId: number) {
  return parseTeamMembers(await fetchPage(`/team-profile/${teamId}/team/members`));
}

export async function fetchScorecard(matchId: number) {
  // CricHeroes ignores the slug segments, only the match id matters
  return parseScorecard(await fetchPage(`/scorecard/${matchId}/match/match/scorecard`));
}

export function cricheroesMatchUrl(matchId: number) {
  return `${BASE}/scorecard/${matchId}/match/match/summary`;
}

export function cricheroesPlayerUrl(playerId: number) {
  return `${BASE}/player-profile/${playerId}/player`;
}

export function cricheroesTeamUrl(teamId: number) {
  return `${BASE}/team-profile/${teamId}/team`;
}
