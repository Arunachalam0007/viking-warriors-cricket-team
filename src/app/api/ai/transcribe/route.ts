import { NextResponse } from "next/server";
import { transcribe, type TranscribeLang } from "@/modules/ai/transcribe";
import { getSettings } from "@/modules/settings/settings";

// Voice input for AI-Viking-Bot: POST form-data { audio: recording, lang: ta | en | auto } → { text }
export const maxDuration = 60;

const MAX_BYTES = 4_000_000; // about a minute of phone audio; recordings stop at 30 s

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size < 500 || audio.size > MAX_BYTES) return NextResponse.json({ error: "Send a short voice recording" }, { status: 400 });
  const settings = await getSettings();
  if (!settings.ai_enabled) return NextResponse.json({ error: "AI is switched off" }, { status: 503 });
  const lang = (["ta", "en", "auto"].includes(String(form?.get("lang"))) ? form!.get("lang") : "ta") as TranscribeLang;
  const ext = audio.type.includes("mp4") || audio.type.includes("aac") ? "m4a" : audio.type.includes("ogg") ? "ogg" : audio.type.includes("wav") ? "wav" : "webm";
  try {
    const text = await transcribe(audio, `question.${ext}`, lang);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
