import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { getDb } from "@/db";
import { aiUsage } from "@/db/schema";
import { getSetting } from "@/modules/settings/settings";

/*
 * Two free AI providers, each with its own key in .env.local:
 *   GEMINI_API_KEY (Google AI Studio)   GROQ_API_KEY (console.groq.com)
 *
 * Free tiers are small and every model has its own quota (Gemini: about 20 requests a day per
 * model; Groq: about 8,000 tokens a minute per model). So each call walks a chain of models that
 * alternates providers, starting with the admin's primary provider (Admin → AI, default Gemini):
 *     Gemini best → Groq best → Gemini next → Groq next → …
 * When a model is out of quota, overloaded, failing or silent, the same call moves to the next
 * model, and that model is rested for a while so later calls skip it. Works both ways.
 */

export type ProviderId = "gemini" | "groq";
export const PROVIDERS: ProviderId[] = ["gemini", "groq"];
export const PROVIDER_LABEL: Record<ProviderId, string> = { gemini: "Google Gemini", groq: "Groq" };

/** chat = live answers (best first) · bulk = background texts (cheap first) · vision = reads images */
export type Tier = "chat" | "bulk" | "vision";

/** Models per provider and tier, best first. All of them call tools; Tamil is weakest on qwen. */
const CHAINS: Record<Tier, Record<ProviderId, string[]>> = {
  chat: {
    gemini: ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemma-4-26b-a4b-it"],
    groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
  },
  bulk: {
    gemini: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-3.5-flash", "gemma-4-26b-a4b-it"],
    groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
  },
  vision: {
    gemini: ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemma-4-26b-a4b-it"],
    groq: ["qwen/qwen3.8-27b"],
  },
};

/** AI_GEMINI_MODELS / AI_GROQ_MODELS (comma-separated) replace the chat chain, e.g. when a model is retired. */
function chain(tier: Tier, provider: ProviderId) {
  const env = tier === "chat" ? process.env[provider === "gemini" ? "AI_GEMINI_MODELS" : "AI_GROQ_MODELS"] : undefined;
  return env ? env.split(",").map((m) => m.trim()).filter(Boolean) : CHAINS[tier][provider];
}

const apiKey = (provider: ProviderId) => (provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY)?.trim() || undefined;

export function configuredProviders() {
  return PROVIDERS.filter((p) => apiKey(p));
}

type Candidate = { provider: ProviderId; modelId: string };
const keyOf = (c: Candidate) => `${c.provider}:${c.modelId}`;

function providerModel(c: Candidate): LanguageModelV3 {
  return c.provider === "gemini" ? createGoogleGenerativeAI({ apiKey: apiKey("gemini") })(c.modelId) : createGroq({ apiKey: apiKey("groq") })(c.modelId);
}

/* ---------- Resting a failing model ---------- */

type Health = { restUntil: number; lastError?: string; lastErrorAt?: number };
const globalForAi = globalThis as unknown as { __vwAiHealth?: Map<string, Health> };
const health = (globalForAi.__vwAiHealth ??= new Map<string, Health>());
const healthOf = (key: string) => health.get(key) ?? health.set(key, { restUntil: 0 }).get(key)!;

/** How long to stop sending calls to a model after this error. */
export function restFor(error: unknown): number {
  const e = error as { statusCode?: number; message?: string };
  const message = (e?.message ?? "").toLowerCase();
  if (e?.statusCode === 429 || message.includes("quota") || message.includes("rate limit")) {
    // The daily free quota resets at midnight US Pacific time; try again in a few hours
    return message.includes("per day") || message.includes("daily") ? 3 * 60 * 60_000 : 60_000;
  }
  if (e?.statusCode === 401 || e?.statusCode === 403) return 10 * 60_000; // wrong or revoked key
  if (e?.statusCode === 404) return 24 * 60 * 60_000; // model retired
  if (e?.statusCode && e.statusCode >= 500) return 30_000; // "high demand", outages, no answer in time
  return 0; // a bad request is about this call, not the model
}

function noteFailure(c: Candidate, error: unknown) {
  const h = healthOf(keyOf(c));
  h.lastError = (error as Error)?.message?.slice(0, 300) ?? String(error);
  h.lastErrorAt = Date.now();
  const rest = restFor(error);
  if (rest) h.restUntil = Date.now() + rest;
}

/** For Admin → AI: each provider's models and whether this server is resting them. */
export function providerHealth() {
  const now = Date.now();
  return PROVIDERS.map((p) => ({
    provider: p,
    label: PROVIDER_LABEL[p],
    configured: Boolean(apiKey(p)),
    models: [...new Set([...chain("chat", p), ...chain("bulk", p), ...chain("vision", p)])].map((modelId) => {
      const h = health.get(keyOf({ provider: p, modelId }));
      return {
        modelId,
        restingUntil: h && h.restUntil > now ? new Date(h.restUntil) : null,
        lastError: h?.lastError ?? null,
        lastErrorAt: h?.lastErrorAt ? new Date(h.lastErrorAt) : null,
      };
    }),
  }));
}

/**
 * The models to try, in order: alternating providers, primary first (for images, the primary
 * provider's whole list first). Resting models go to the
 * end (still tried if nothing else works).
 */
export function callOrder(primary: ProviderId, tier: Tier = "chat", now = Date.now()): Candidate[] {
  const providers = [primary, ...PROVIDERS.filter((p) => p !== primary)].filter((p) => apiKey(p));
  const lists = providers.map((p) => chain(tier, p).map((modelId) => ({ provider: p, modelId })));
  const out: Candidate[] = [];
  // Reading images: Groq's one vision model is much weaker, so every Gemini model goes first
  if (tier === "vision") out.push(...lists.flat());
  else for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  const resting = (c: Candidate) => (health.get(keyOf(c))?.restUntil ?? 0) > now;
  return [...out.filter((c) => !resting(c)), ...out.filter(resting)];
}

/* ---------- Usage log ---------- */

export type AiFeature =
  | "chat_public"
  | "chat_admin"
  | "match_summary"
  | "period_writeup"
  | "player_insight"
  | "sync_check"
  | "payment_scan"
  | "reminder";

type CallInfo = { feature: AiFeature; client?: string };

function logUsage(info: CallInfo, provider: ProviderId, model: string, ok: boolean, usage?: { input?: number; output?: number }, error?: unknown) {
  getDb()
    .insert(aiUsage)
    .values({
      feature: info.feature,
      provider,
      model,
      ok,
      inputTokens: usage?.input ?? null,
      outputTokens: usage?.output ?? null,
      error: error ? ((error as Error).message ?? String(error)).slice(0, 500) : null,
      client: info.client ?? null,
    })
    .catch(() => undefined);
}

/* ---------- The fallback model ---------- */

export class NoAiProviderError extends Error {
  constructor() {
    super("No AI provider is configured. Add GEMINI_API_KEY or GROQ_API_KEY to the environment.");
  }
}

/**
 * A model that tries each model of the chain in turn. Pass it to generateText / streamText like any model.
 * Each step of a multi-step tool call picks its provider afresh, so a chat survives a provider
 * running out of quota halfway through.
 */
/** A provider that has not started answering by then is treated as down for this call. */
const FIRST_ANSWER_MS = { stream: 15_000, generate: 45_000 };

class ProviderTimeoutError extends Error {
  statusCode = 504;
  constructor(ms: number) {
    super(`No answer within ${ms / 1000} seconds`);
  }
}

/** An abort signal for one attempt: fires on the caller's own abort, or after `ms`. */
function attemptSignal(outer: AbortSignal | undefined, ms: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new ProviderTimeoutError(ms)), ms);
  const onAbort = () => ac.abort(outer?.reason);
  outer?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: ac.signal,
    timedOut: () => ac.signal.reason instanceof ProviderTimeoutError,
    // The caller's abort stays linked, so Stop still cancels a stream that is under way
    done: () => clearTimeout(timer),
  };
}

// Stream parts that mean the provider is really answering (not just "stream started")
const ANSWERING = new Set(["text-delta", "reasoning-delta", "tool-input-start", "tool-call", "finish", "error"]);

export function fallbackModel(
  order: Candidate[],
  info: CallInfo,
  // Tests pass mock models and short timeouts
  make: (c: Candidate) => LanguageModelV3 = providerModel,
  timeouts: { stream: number; generate: number } = FIRST_ANSWER_MS,
): LanguageModelV3 {
  const attempt = async <T>(outer: AbortSignal | undefined, ms: number, run: (model: LanguageModelV3, provider: ProviderId, signal: AbortSignal) => Promise<T>) => {
    if (order.length === 0) throw new NoAiProviderError();
    let lastError: unknown;
    for (const candidate of order) {
      const { provider } = candidate;
      const model = make(candidate);
      const guard = attemptSignal(outer, ms);
      try {
        return await run(model, provider, guard.signal);
      } catch (e) {
        // The visitor pressed Stop or left: do not try the next provider
        if (outer?.aborted) throw e;
        const error = guard.timedOut() ? new ProviderTimeoutError(ms) : e;
        lastError = error;
        noteFailure(candidate, error);
        logUsage(info, provider, model.modelId, false, undefined, error);
      } finally {
        guard.done();
      }
    }
    throw lastError;
  };

  const first = make(order[0] ?? { provider: "gemini", modelId: CHAINS.chat.gemini[0] });
  return {
    specificationVersion: "v3",
    provider: "vw-fallback",
    modelId: order.map(keyOf).join(" → "),
    supportedUrls: first.supportedUrls,

    doGenerate: (options: LanguageModelV3CallOptions) =>
      attempt(options.abortSignal, timeouts.generate, async (model, provider, abortSignal) => {
        const result = await model.doGenerate({ ...options, abortSignal });
        logUsage(info, provider, model.modelId, true, { input: result.usage.inputTokens.total, output: result.usage.outputTokens.total });
        // result.response.modelId tells the caller which provider answered
        return { ...result, response: { ...result.response, modelId: model.modelId } };
      }),

    doStream: (options: LanguageModelV3CallOptions) =>
      attempt(options.abortSignal, timeouts.stream, async (model, provider, abortSignal) => {
        // Wait until the provider really starts answering before handing the stream on. Quota
        // errors, overload errors and silent stalls all happen before that point, so the next
        // provider can still answer before the visitor sees anything.
        const result = await model.doStream({ ...options, abortSignal });
        const reader = result.stream.getReader();
        const head: LanguageModelV3StreamPart[] = [];
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          head.push(value);
          if (value.type === "error" && head.every((p) => p.type !== "text-delta" && p.type !== "tool-call")) throw value.error;
          if (ANSWERING.has(value.type)) break;
        }

        let usage: { input?: number; output?: number } | undefined;
        let streamError: unknown;
        const note = (part: LanguageModelV3StreamPart): LanguageModelV3StreamPart => {
          if (part.type === "finish") usage = { input: part.usage.inputTokens.total, output: part.usage.outputTokens.total };
          if (part.type === "error") streamError = part.error;
          return part.type === "response-metadata" ? { ...part, modelId: model.modelId } : part;
        };
        const finish = () => {
          if (streamError) noteFailure({ provider, modelId: model.modelId }, streamError);
          logUsage(info, provider, model.modelId, !streamError, usage, streamError);
        };
        const stream = new ReadableStream<LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({ type: "response-metadata", modelId: model.modelId });
            for (const part of head) controller.enqueue(note(part));
          },
          async pull(controller) {
            const { value, done } = await reader.read();
            if (done) {
              finish();
              controller.close();
            } else controller.enqueue(note(value));
          },
          cancel(reason) {
            return reader.cancel(reason);
          },
        });
        return { ...result, stream };
      }),
  };
}

const TIER: Record<AiFeature, Tier> = {
  chat_public: "chat",
  chat_admin: "chat",
  reminder: "chat",
  payment_scan: "vision",
  match_summary: "bulk",
  period_writeup: "bulk",
  player_insight: "bulk",
  sync_check: "bulk",
};

/** The model for one AI feature: its tier's chain, in the provider order the admin chose. */
export async function aiModel(feature: AiFeature, opts: { client?: string } = {}) {
  const primary = (await getSetting("ai_primary_provider").catch(() => "gemini")) as ProviderId;
  return fallbackModel(callOrder(PROVIDERS.includes(primary) ? primary : "gemini", TIER[feature]), { feature, client: opts.client });
}

/** Which provider a model id (as reported in response.modelId) belongs to. */
export function providerOf(modelId: string): ProviderId {
  return modelId.includes("gemini") || modelId.includes("gemma") ? "gemini" : "groq";
}

/** Keeps answers quick: little hidden "thinking" on either provider. */
export const FAST_OPTIONS = {
  google: { thinkingConfig: { thinkingLevel: "low" } },
  groq: { reasoningEffort: "low" },
} as const;
