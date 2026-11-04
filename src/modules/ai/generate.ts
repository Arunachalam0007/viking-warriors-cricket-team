import "server-only";
import { generateText, Output } from "ai";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Executor } from "@/db";
import { matches, matchPlayers } from "@/db/schema";
import { dateRangeToInstants } from "@/lib/dates";
import { getSettings } from "@/modules/settings/settings";
import { runSyncChecks } from "./checks";
import { factsHash, saveAiText, storedRows, type AiKind } from "./content";
import { currentPeriods, matchFacts, periodFacts, playerFacts, type Period } from "./facts";
import { aiModel, configuredProviders, FAST_OPTIONS, providerOf, type AiFeature } from "./models";
import { houseRules, TEAM_NAME_TA } from "./prompts";

/*
 * Texts the AI writes once and pages read later (no AI call on a page view):
 *   match_summary   — every played match            (match page)
 *   period_writeup  — this week, this/last month, season (leaderboard)
 *   player_insight  — players with 2+ matches        (player profile)
 *   sync_check      — summary of the post-sync checks (admin)
 * Each is written in Tamil and English in one call, from facts only. A text is rewritten when its
 * facts change (new scorecard, new match in the period), never when an admin edited it.
 */

const bilingual = z.object({
  title_en: z.string().describe("Short headline in English, max 10 words"),
  body_en: z.string().describe("The text in English"),
  title_ta: z.string().describe("The same headline in Tamil"),
  body_ta: z.string().describe("The same text in Tamil"),
});

const BRIEFS: Record<AiKind, string> = {
  match_summary:
    "Write a lively match report for the team's WhatsApp group: 70–110 words, 1–2 short paragraphs. Lead with the result, then the standout batting and bowling performances with exact figures, and the player of the match if given. No hashtags.",
  period_writeup:
    "Write a short 'performers of the period' write-up: 60–100 words. Name the top MVP and why (exact figures), then mention 2–3 other standout players, and the team's results in the period. Celebrate, don't criticise.",
  player_insight:
    "Write a 2–3 sentence form note about this player (max 60 words): what they do best this season, how their recent matches compare to their season numbers (trend up or down, with figures), and one positive, concrete thing to aim for. Talk about the player in third person.",
  sync_check:
    "You are writing for the team admins. Summarise these data checks in 2–4 short sentences: what needs attention first and why. Plain words, no greetings.",
};

async function writeBilingual(feature: AiFeature, kind: AiKind, teamName: string, facts: unknown) {
  const model = await aiModel(feature);
  const result = await generateText({
    model,
    system: houseRules(teamName),
    prompt: `${BRIEFS[kind]}\n\nWrite it twice: in English (team name "${teamName}", English letters only), and in natural Tamil (not a word-by-word translation; team name ${TEAM_NAME_TA}).\n\nFacts (JSON):\n${JSON.stringify(facts)}`,
    output: Output.object({ schema: bilingual }),
    providerOptions: FAST_OPTIONS,
    maxRetries: 0,
  });
  const used = result.response.modelId;
  return { ...result.output, model: used, provider: providerOf(used) };
}

async function generateAndSave(db: Executor, feature: AiFeature, kind: AiKind, subjectId: string, facts: unknown, teamName: string) {
  const hash = factsHash(facts);
  const out = await writeBilingual(feature, kind, teamName, facts);
  for (const lang of ["en", "ta"] as const) {
    await saveAiText(db, {
      kind,
      subjectId,
      lang,
      title: out[`title_${lang}`].trim(),
      body: out[`body_${lang}`].trim(),
      factsHash: hash,
      provider: out.provider,
      model: out.model,
    });
  }
}

/** True when the subject has no text yet, or its facts changed and no admin edited it. */
function isStale(rows: { subjectId: string; factsHash: string; edited: boolean }[], subjectId: string, hash: string) {
  const mine = rows.filter((r) => r.subjectId === subjectId);
  if (mine.some((r) => r.edited)) return false;
  return mine.length < 2 || mine.some((r) => r.factsHash !== hash);
}

/* ---------- One subject (admin "Regenerate") ---------- */

export async function generateOne(db: Executor, kind: AiKind, subjectId: string) {
  const settings = await getSettings(db);
  const facts =
    kind === "match_summary"
      ? await matchFacts(db, subjectId)
      : kind === "player_insight"
        ? await playerFacts(db, subjectId, settings.sync_start_date)
        : kind === "period_writeup"
          ? await periodFactsFor(db, subjectId, settings.sync_start_date)
          : { checks: await runSyncChecks(db) };
  if (!facts) throw new Error("Not enough data yet to write this");
  const feature: AiFeature = kind;
  await generateAndSave(db, feature, kind, subjectId, facts, settings.team_name);
}

async function periodFactsFor(db: Executor, key: string, seasonStart: string) {
  const period = currentPeriods(seasonStart).find((p) => p.key === key);
  return period ? periodFacts(db, period) : null;
}

/* ---------- The job (after each sync, and nightly) ---------- */

export type AiJobResult = { written: number; skipped: number; failed: number; errors: string[]; stoppedAtLimit: boolean };

/**
 * Brings every AI text up to date, newest first, writing at most `maxCalls` texts (and stopping
 * once `deadlineMs` has passed) so a run stays inside the free quota and the server's time limit.
 * The rest are picked up next time.
 */
export async function runAiJobs(db: Executor = getDb(), opts: { maxCalls?: number; deadlineMs?: number } = {}): Promise<AiJobResult> {
  const stopAt = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const result: AiJobResult = { written: 0, skipped: 0, failed: 0, errors: [], stoppedAtLimit: false };
  const settings = await getSettings(db);
  if (!settings.ai_enabled || configuredProviders().length === 0) return result;
  const maxCalls = opts.maxCalls ?? 25;
  const teamName = settings.team_name;

  const work: { kind: AiKind; subjectId: string; facts: () => Promise<unknown> }[] = [];

  // Played matches since the season start, newest first
  const seasonStart = dateRangeToInstants(settings.sync_start_date, settings.sync_start_date).start;
  const played = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.status, "past"), gte(matches.startTime, seasonStart)))
    .orderBy(desc(matches.startTime));
  for (const m of played) work.push({ kind: "match_summary", subjectId: m.id, facts: () => matchFacts(db, m.id) });

  for (const p of currentPeriods(settings.sync_start_date) as Period[]) work.push({ kind: "period_writeup", subjectId: p.key, facts: () => periodFacts(db, p) });

  // Players who played this season, most recent first
  const recent = await db
    .selectDistinct({ playerId: matchPlayers.playerId })
    .from(matchPlayers)
    .where(and(eq(matchPlayers.played, true), inArray(matchPlayers.matchId, played.length ? played.map((m) => m.id) : ["00000000-0000-0000-0000-000000000000"])));
  for (const p of recent) work.push({ kind: "player_insight", subjectId: p.playerId, facts: () => playerFacts(db, p.playerId, settings.sync_start_date) });

  work.push({
    kind: "sync_check",
    subjectId: "latest",
    facts: async () => {
      const checks = await runSyncChecks(db);
      return checks.length ? { checks: checks.map(({ severity, title, detail }) => ({ severity, title, detail })) } : null;
    },
  });

  const stored = new Map<AiKind, Awaited<ReturnType<typeof storedRows>>>();
  for (const kind of ["match_summary", "period_writeup", "player_insight", "sync_check"] as AiKind[]) {
    stored.set(kind, await storedRows(db, kind, work.filter((w) => w.kind === kind).map((w) => w.subjectId)));
  }

  for (const w of work) {
    const facts = await w.facts();
    if (!facts) continue;
    if (!isStale(stored.get(w.kind)!, w.subjectId, factsHash(facts))) {
      result.skipped++;
      continue;
    }
    // Out of calls for this run, or out of time (Vercel stops a function after its time limit)
    if (result.written + result.failed >= maxCalls || Date.now() > stopAt) {
      result.stoppedAtLimit = true;
      break;
    }
    try {
      // A short gap between texts keeps a long run under the per-minute free limits
      if (result.written + result.failed > 0) await new Promise((r) => setTimeout(r, 1500));
      await generateAndSave(db, w.kind, w.kind, w.subjectId, facts, teamName);
      result.written++;
    } catch (e) {
      result.failed++;
      result.errors.push(`${w.kind} ${w.subjectId}: ${(e as Error).message}`.slice(0, 300));
      // Both providers refused: stop here rather than burn through the list
      if (result.failed >= 3 && result.written === 0) break;
    }
  }
  return result;
}
