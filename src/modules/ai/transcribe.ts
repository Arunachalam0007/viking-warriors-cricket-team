import "server-only";
import { getDb } from "@/db";
import { aiUsage } from "@/db/schema";

/*
 * Voice input for AI-Viking-Bot. Phones record the question (MediaRecorder) and send it here,
 * because the browsers' own speech recognition is missing or unreliable on phones (iPhones need
 * Siri switched on; Tamil often fails silently).
 *   1. Groq Whisper large-v3 (free tier, GROQ_API_KEY): about half a second, good Tamil
 *   2. Gemini (free tier, GEMINI_API_KEY): slower but very accurate, if Groq is unavailable
 *   3. Groq Whisper large-v3-turbo
 */

export type TranscribeLang = "ta" | "en" | "auto";

function log(provider: string, model: string, ok: boolean, error?: unknown) {
  getDb()
    .insert(aiUsage)
    .values({ feature: "transcribe", provider, model, ok, error: error ? String((error as Error).message ?? error).slice(0, 300) : null })
    .catch(() => undefined);
}

async function groqWhisper(audio: Blob, filename: string, lang: TranscribeLang, model: string) {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const fd = new FormData();
  fd.append("file", audio, filename);
  fd.append("model", model);
  if (lang !== "auto") fd.append("language", lang);
  // A hint keeps names and cricket words right
  fd.append("prompt", "Viking Warriors cricket team: match, score, runs, wickets, MVP, leaderboard, match fee, Yogi, Santhosh, Ragul.");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: fd,
    signal: AbortSignal.timeout(20_000),
  });
  const d = (await r.json()) as { text?: string; error?: { message: string } };
  if (!r.ok || d.error) throw new Error(d.error?.message ?? `HTTP ${r.status}`);
  return (d.text ?? "").trim();
}

async function geminiTranscribe(audio: Blob, lang: TranscribeLang) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inlineData: { mimeType: audio.type || "audio/webm", data } },
            { text: `Transcribe this question exactly as spoken${lang === "ta" ? " (Tamil in Tamil script; English cricket words may stay in English)" : lang === "en" ? " (English)" : ""}. Return only the text, nothing else.` },
          ],
        },
      ],
    }),
  });
  const d = (await r.json()) as { error?: { message: string }; candidates?: { content?: { parts?: { text?: string }[] } }[] };
  if (!r.ok || d.error) throw new Error(d.error?.message ?? `HTTP ${r.status}`);
  return (d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
}

export async function transcribe(audio: Blob, filename: string, lang: TranscribeLang) {
  const attempts: [string, string, () => Promise<string>][] = [
    ["groq", "whisper-large-v3", () => groqWhisper(audio, filename, lang, "whisper-large-v3")],
    ["gemini", "gemini-3.5-flash-lite", () => geminiTranscribe(audio, lang)],
    ["groq", "whisper-large-v3-turbo", () => groqWhisper(audio, filename, lang, "whisper-large-v3-turbo")],
  ];
  let last: unknown;
  for (const [provider, model, run] of attempts) {
    try {
      const text = await run();
      log(provider, model, true);
      return text;
    } catch (e) {
      last = e;
      log(provider, model, false, e);
    }
  }
  throw last ?? new Error("No transcription service answered");
}
