import "server-only";
import { parseScorecard, parseTeamMatches, parseTeamMembers } from "./parser";
import { findTeamUrlInHtml, parseTeamUrl, type CricheroesTeam } from "./urls";

const USER_AGENT =
  "Mozilla/5.0 (compatible; VikingWarriorsTeamPortal/1.0; nightly team sync; +https://github.com/Arunachalam0007/viking-warriors-cricket-team)";

async function fetchPage(origin: string, path: string): Promise<string> {
  const res = await fetch(`${origin}${path}`, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const hint =
      res.status === 404
        ? " — check the CricHeroes team link in Admin → Settings"
        : res.status === 403
          ? " — CricHeroes refused this server"
          : "";
    // Which layer answered (CDN / firewall) helps tell a blocked server from a missing page
    const via = ["server", "cf-ray", "x-amz-cf-id", "x-cache"].map((h) => res.headers.get(h) && `${h}=${res.headers.get(h)}`).filter(Boolean).join(", ");
    throw new Error(`CricHeroes ${origin}${path} returned HTTP ${res.status}${hint}${via ? ` (${via})` : ""}`);
  }
  return res.text();
}

export async function fetchTeamMatches(origin: string, teamId: number) {
  const matches = parseTeamMatches(await fetchPage(origin, `/team-profile/${teamId}/team/matches`));
  if (matches.length === 0) {
    throw new Error("CricHeroes matches page parsed to 0 matches — the page format or the team link in Settings may have changed");
  }
  return matches;
}

export async function fetchTeamMembers(origin: string, teamId: number) {
  return parseTeamMembers(await fetchPage(origin, `/team-profile/${teamId}/team/members`));
}

export async function fetchScorecard(origin: string, matchId: number) {
  // CricHeroes ignores the slug segments, only the match id matters
  return parseScorecard(await fetchPage(origin, `/scorecard/${matchId}/match/match/scorecard`));
}

/**
 * Turns what an admin pastes into a team link: a team-profile URL is used as is; a share link
 * (chshare.link/team/…) is opened and the team-profile URL it points to is read from it.
 */
export async function resolveTeamUrl(input: string): Promise<CricheroesTeam> {
  const direct = parseTeamUrl(input);
  if (direct) return direct;

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Paste the full CricHeroes team link, starting with https://");
  }
  if (url.protocol !== "https:") throw new Error("The CricHeroes link must start with https://");

  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) throw new Error("Could not open that link. Check it opens in a browser, or paste the team page link instead.");

  const resolved = parseTeamUrl(res.url) ?? parseTeamUrl(findTeamUrlInHtml(await res.text()) ?? "");
  if (!resolved) throw new Error("That link does not lead to a CricHeroes team page");
  return resolved;
}
