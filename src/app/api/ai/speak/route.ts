import { NextResponse } from "next/server";
import { speech, type SpeechLang } from "@/modules/ai/speech";
import { getSettings } from "@/modules/settings/settings";

// Read-aloud for AI-Viking-Bot answers: POST { text, lang: "ta" | "en" } → audio
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: string; lang?: SpeechLang } | null;
  if (!body?.text || typeof body.text !== "string" || body.text.length > 8000) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const settings = await getSettings();
  if (!settings.ai_enabled) return NextResponse.json({ error: "AI is switched off" }, { status: 503 });
  try {
    const { audio, type, voice } = await speech(body.text, body.lang === "en" ? "en" : "ta");
    return new Response(new Uint8Array(audio), { headers: { "content-type": type, "cache-control": "private, max-age=3600", "x-voice": voice } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
