import "server-only";
import { getDb } from "@/db";
import { aiUsage } from "@/db/schema";

/*
 * Read-aloud audio for chat answers. Phones and laptops rarely have a Tamil voice installed (no
 * iPhone has one), so the browser would read Tamil in an English voice. The audio is made here:
 *   1. Microsoft Edge read-aloud voices (free, no key, fast): ta-IN Pallavi / en-IN Neerja
 *   2. Gemini text-to-speech (free tier, GEMINI_API_KEY), if Edge is unreachable
 * The chat window falls back to the browser's own voice only if both fail.
 */

export type SpeechLang = "ta" | "en";

const EDGE_VOICE: Record<SpeechLang, string> = { ta: "ta-IN-PallaviNeural", en: "en-IN-NeerjaNeural" };
const GEMINI_TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const MAX_CHARS = 1800;

/** Markdown answer → plain sentences a voice can read (links → their text, tables → lines). */
export function speakableText(markdown: string) {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/[*_#`>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/₹\s?/g, "₹")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, MAX_CHARS);
}

function log(provider: string, model: string, ok: boolean, error?: unknown) {
  getDb()
    .insert(aiUsage)
    .values({ feature: "speech", provider, model, ok, error: error ? String((error as Error).message ?? error).slice(0, 300) : null })
    .catch(() => undefined);
}

async function edgeSpeech(text: string, lang: SpeechLang): Promise<Buffer> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const tts = new MsEdgeTTS();
  await tts.setMetadata(EDGE_VOICE[lang], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const { audioStream } = tts.toStream(escaped);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => reject(new Error("Edge read-aloud did not answer in 15 s")), 15_000);
    audioStream.on("data", (c: Buffer) => chunks.push(c));
    audioStream.on("error", (e: Error) => reject(e));
    audioStream.on("close", () => {
      clearTimeout(timer);
      tts.close();
      const audio = Buffer.concat(chunks);
      if (audio.length < 1000) reject(new Error("Edge read-aloud returned no audio"));
      else resolve(audio);
    });
  });
}

/** 16-bit mono PCM (what Gemini returns) → a playable WAV file. */
function pcmToWav(pcm: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function geminiSpeech(text: string, lang: SpeechLang, model: string): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Read this aloud in a warm, clear ${lang === "ta" ? "Tamil" : "Indian English"} voice:\n${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    }),
  });
  const d = (await r.json()) as { error?: { message: string }; candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
  if (!r.ok || d.error) throw Object.assign(new Error(d.error?.message ?? `HTTP ${r.status}`), { statusCode: r.status });
  const inline = d.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline) throw new Error("Gemini returned no audio");
  const audio = Buffer.from(inline.data, "base64");
  if (/wav/i.test(inline.mimeType)) return audio;
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType)?.[1] ?? 24000);
  return pcmToWav(audio, rate);
}

/** Audio for a chat answer, from the first voice service that works. */
export async function speech(markdown: string, lang: SpeechLang): Promise<{ audio: Buffer; type: string; voice: string }> {
  const text = speakableText(markdown);
  if (!text) throw new Error("Nothing to read");
  try {
    const audio = await edgeSpeech(text, lang);
    log("edge", EDGE_VOICE[lang], true);
    return { audio, type: "audio/mpeg", voice: EDGE_VOICE[lang] };
  } catch (e) {
    log("edge", EDGE_VOICE[lang], false, e);
  }
  let last: unknown;
  for (const model of GEMINI_TTS_MODELS) {
    try {
      const audio = await geminiSpeech(text, lang, model);
      log("gemini", model, true);
      return { audio, type: "audio/wav", voice: model };
    } catch (e) {
      last = e;
      log("gemini", model, false, e);
    }
  }
  throw last ?? new Error("No voice service answered");
}
