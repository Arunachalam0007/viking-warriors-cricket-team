/**
 * Parses CricHeroes public web pages.
 *
 * cricheroes.com is a Next.js App Router site: page data is embedded in
 * `self.__next_f.push([1,"<chunk>"])` script tags (React Server Components
 * payload). We decode those chunks, parse every JSON line, and look for the
 * objects we need by their keys. If CricHeroes changes its markup, this is the
 * only file that should need fixing — see tests/cricheroes-parser.test.ts.
 */
import type { ChMatchSummary, ChMember, ChScorecard, ChBattingRow, ChBowlingRow, ChInnings } from "./types";

const CHUNK_RE = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;

export function decodeRscPayload(html: string): string {
  let out = "";
  for (const m of html.matchAll(CHUNK_RE)) {
    out += JSON.parse(`"${m[1]}"`) as string;
  }
  return out;
}

export function parseRscObjects(html: string): unknown[] {
  const text = decodeRscPayload(html);
  const objects: unknown[] = [];
  for (const line of text.split("\n")) {
    const m = /^[0-9a-f]+:(.*)$/.exec(line);
    if (!m) continue;
    const body = m[1];
    if (body[0] !== "[" && body[0] !== "{") continue;
    try {
      objects.push(JSON.parse(body));
    } catch {
      // Non-JSON RSC rows (module refs, hints) are ignored
    }
  }
  return objects;
}

type Dict = Record<string, unknown>;

function* walk(node: unknown): Generator<Dict> {
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
  } else if (node && typeof node === "object") {
    const dict = node as Dict;
    yield dict;
    for (const value of Object.values(dict)) yield* walk(value);
  }
}

function findAll(objects: unknown[], predicate: (d: Dict) => boolean): Dict[] {
  const found: Dict[] = [];
  for (const root of objects) for (const d of walk(root)) if (predicate(d)) found.push(d);
  return found;
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ---------- Team matches page ---------- */

export function parseTeamMatches(html: string): ChMatchSummary[] {
  const objects = parseRscObjects(html);
  const rows = findAll(objects, (d) => "match_id" in d && "team_a_id" in d && "team_b_id" in d);
  const byId = new Map<number, ChMatchSummary>();
  for (const r of rows) {
    const id = num(r.match_id);
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      matchId: id,
      startTime: str(r.match_start_time),
      status: str(r.status),
      result: str(r.match_result),
      winningTeamId: num(r.winning_team_id),
      winBy: str(r.win_by),
      summary: str((r.match_summary as Dict | undefined)?.summary),
      tournamentId: num(r.tournament_id),
      tournamentName: str(r.tournament_name),
      overs: num(r.overs),
      ballType: str(r.ball_type),
      ground: str(r.ground_name),
      city: str(r.city_name),
      teamA: { id: num(r.team_a_id), name: str(r.team_a), logo: str(r.team_a_logo), score: str(r.team_a_summary) },
      teamB: { id: num(r.team_b_id), name: str(r.team_b), logo: str(r.team_b_logo), score: str(r.team_b_summary) },
      pomPlayerId: num(r.pom_player_id),
    });
  }
  return [...byId.values()].sort((a, b) => b.startTime.localeCompare(a.startTime));
}

/* ---------- Team members page ---------- */

export function parseTeamMembers(html: string): ChMember[] {
  const objects = parseRscObjects(html);
  const rows = findAll(objects, (d) => "player_id" in d && "profile_photo" in d && "is_captain" in d);
  const byId = new Map<number, ChMember>();
  for (const r of rows) {
    const id = num(r.player_id);
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      playerId: id,
      name: cleanName(str(r.name)),
      photoUrl: str(r.profile_photo) || null,
      isCaptain: num(r.is_captain) === 1,
      battingStyle: str(r.batter_category) || null,
      bowlingStyle: str(r.bowler_category) || null,
    });
  }
  return [...byId.values()];
}

/* ---------- Scorecard page ---------- */

export function parseScorecard(html: string): ChScorecard | null {
  const objects = parseRscObjects(html);
  const holder = findAll(objects, (d) => Array.isArray(d.scoreCardData))[0];
  if (!holder) return null;
  const innings: ChInnings[] = (holder.scoreCardData as Dict[]).map((inn) => {
    const meta = (inn.inning ?? {}) as Dict;
    return {
      teamId: num(inn.team_id),
      inning: num(meta.inning),
      totalRuns: num(meta.total_run),
      totalWickets: num(meta.total_wicket),
      overs: str(meta.overs_played),
      batting: ((inn.batting as Dict[]) ?? []).map(toBattingRow),
      yetToBat: ((inn.to_be_bat as Dict[]) ?? []).map((p) => ({ playerId: num(p.player_id), name: cleanName(str(p.name)) })),
      bowling: ((inn.bowling as Dict[]) ?? []).map(toBowlingRow),
    };
  });
  return { innings };
}

function toBattingRow(r: Dict): ChBattingRow {
  const howOut = str(r.how_to_out).trim();
  return {
    playerId: num(r.player_id),
    name: cleanName(str(r.name)),
    runs: num(r.runs),
    balls: num(r.balls),
    fours: num(r["4s"]),
    sixes: num(r["6s"]),
    howOut,
    isOut: isDismissed(howOut),
  };
}

function toBowlingRow(r: Dict): ChBowlingRow {
  return {
    playerId: num(r.player_id),
    name: cleanName(str(r.name)),
    balls: oversToBalls(r.overs, r.balls),
    maidens: num(r.maidens),
    runs: num(r.runs),
    wickets: num(r.wickets),
    dots: num(r["0s"]),
    wides: num(r.wide),
    noBalls: num(r.noball),
  };
}

/** "3.4" overs → 22 balls. CricHeroes sends whole overs in `overs` and the remainder in `balls`. */
export function oversToBalls(overs: unknown, balls: unknown): number {
  const [whole, part] = String(overs ?? "0").split(".");
  const partBalls = part ? Number(part) : num(balls);
  return num(whole) * 6 + (Number.isFinite(partBalls) ? partBalls : 0);
}

const NOT_OUT = /^(not out|retired hurt|retired not out|absent hurt|did not bat|)$/i;

export function isDismissed(howOut: string): boolean {
  return !NOT_OUT.test(howOut.trim());
}

/** "Madhan  (c)" → "Madhan", "†Jaya Chandran" → "Jaya Chandran" */
export function cleanName(name: string): string {
  return name
    .replace(/[†*]/g, "")
    .replace(/\((c|wk|c & wk|c&wk|vc)\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeName(name: string): string {
  return cleanName(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type FieldingCredit = { fielder: string; kind: "catch" | "stumping" | "run_out" };

/**
 * Extracts fielding credits from a dismissal text, e.g.
 * "c †Jaya Chandran b Santhosh", "c&b Yogi", "st †Jaya Chandran b Suman", "run out Suman Sanju",
 * "run out (Suman/Jaya)".
 */
export function fieldingCredits(howOut: string): FieldingCredit[] {
  const text = howOut.trim();
  let m = /^c\s*&\s*b\s+(.+)$/i.exec(text);
  if (m) return [{ fielder: cleanName(m[1]), kind: "catch" }];
  m = /^c\s+(.+?)\s+b\s+.+$/i.exec(text);
  if (m) return [{ fielder: cleanName(m[1]), kind: "catch" }];
  m = /^st\s+(.+?)\s+b\s+.+$/i.exec(text);
  if (m) return [{ fielder: cleanName(m[1]), kind: "stumping" }];
  m = /^run out\s+\(?([^)/]+)/i.exec(text);
  if (m) return [{ fielder: cleanName(m[1]), kind: "run_out" }];
  return [];
}
