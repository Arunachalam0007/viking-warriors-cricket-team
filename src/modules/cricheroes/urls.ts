/**
 * CricHeroes links. The admin stores the team link in Settings; the site origin and team id
 * are both read from it, so a moved team or a new CricHeroes domain only needs a new link.
 * Safe to import from client components (no fetching here).
 */

export const DEFAULT_CRICHEROES_TEAM_URL = "https://cricheroes.com/team-profile/2921535/Viking-Warriors";

export type CricheroesTeam = { origin: string; teamId: number; url: string };

const TEAM_PATH = /\/team-profile\/(\d+)(?:\/([^/?#]+))?/;

/** Reads a team-profile link such as https://cricheroes.com/team-profile/2921535/Viking-Warriors/matches. */
export function parseTeamUrl(input: string): CricheroesTeam | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const m = TEAM_PATH.exec(url.pathname);
  if (!m) return null;
  const teamId = Number(m[1]);
  if (!Number.isSafeInteger(teamId) || teamId <= 0) return null;
  const slug = m[2] && m[2] !== "team" ? `/${m[2]}` : "";
  return { origin: url.origin, teamId, url: `${url.origin}/team-profile/${teamId}${slug}` };
}

/** First team-profile link inside an HTML page (how chshare.link share pages carry their target). */
export function findTeamUrlInHtml(html: string): string | null {
  const m = /https?:\/\/[^"'\s<>\\]+\/team-profile\/\d+[^"'\s<>\\]*/.exec(html);
  return m ? m[0] : null;
}

export function cricheroesMatchUrl(origin: string, matchId: number) {
  return `${origin}/scorecard/${matchId}/match/match/summary`;
}

export function cricheroesPlayerUrl(origin: string, playerId: number) {
  return `${origin}/player-profile/${playerId}/player`;
}
