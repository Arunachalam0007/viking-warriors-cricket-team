"use client";

import { Loader2, Mic, MicOff, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import type { ChatLang } from "@/modules/ai/chat-types";
import type { ChatText } from "./chat-text";

/*
 * Voice questions that work on phones. The browser records (MediaRecorder) and the server turns
 * the recording into text (/api/ai/transcribe: Groq Whisper, Gemini as backup). The first tap
 * explains why the microphone is needed, then the browser asks for permission.
 */

type Phase = "idle" | "ask" | "recording" | "transcribing" | "denied" | "unsupported";

const ASKED_KEY = "ask-viking:mic-asked";
const MAX_MS = 30_000;
const SILENCE_MS = 1800;
const BARS = 24;

const noSubscribe = () => () => {};

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return "";
}

function wasAsked() {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function useVoiceInput({ lang, t, onText }: { lang: ChatLang; t: ChatText; onText: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; cancelled: boolean } | null>(null);
  const supported = useSyncExternalStore(
    noSubscribe,
    () => Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined",
    () => true,
  );

  const cleanup = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    r.stream.getTracks().forEach((track) => track.stop());
    void r.ctx.close().catch(() => undefined);
    rec.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const send = useCallback(
    async (blob: Blob) => {
      setPhase("transcribing");
      try {
        const fd = new FormData();
        fd.append("audio", blob, "question");
        fd.append("lang", lang);
        const res = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
        const data = (await res.json()) as { text?: string; error?: string };
        const text = data.text?.trim();
        if (!res.ok || !text) throw new Error(data.error ?? "empty");
        onText(text);
        setNote(null);
      } catch {
        setNote(t.mic.nothing);
      } finally {
        setPhase("idle");
      }
    },
    [lang, onText, t.mic.nothing],
  );

  const record = useCallback(async () => {
    setNote(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as Error).name;
      setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
      return;
    }
    try {
      localStorage.setItem(ASKED_KEY, "1");
    } catch {
      /* ignore */
    }

    const mime = pickMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Live level meter, and stop by itself after a pause once the person has spoken
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    void ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const started = performance.now();
    let lastVoice = started;
    let spoke = false;

    const state = { recorder, stream, ctx, raf: 0, cancelled: false };
    rec.current = state;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
      const now = performance.now();
      if (level > 0.12) {
        lastVoice = now;
        spoke = true;
      }
      setLevels((prev) => [...prev.slice(1), Math.max(0.08, level)]);
      setElapsed(now - started);
      if (now - started > MAX_MS || (spoke && now - lastVoice > SILENCE_MS)) {
        if (recorder.state === "recording") recorder.stop();
        return;
      }
      state.raf = requestAnimationFrame(tick);
    };

    recorder.onstop = () => {
      const cancelled = state.cancelled;
      cleanup();
      if (cancelled) return setPhase("idle");
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
      if (blob.size < 1500) {
        setNote(t.mic.nothing);
        return setPhase("idle");
      }
      void send(blob);
    };

    recorder.start(250);
    setLevels(Array(BARS).fill(0.08));
    setElapsed(0);
    setPhase("recording");
    state.raf = requestAnimationFrame(tick);
  }, [cleanup, send, t.mic.nothing]);

  /** The mic button: explain first (once), then record; tap again to stop. */
  const toggle = useCallback(() => {
    if (phase === "recording") {
      if (rec.current?.recorder.state === "recording") rec.current.recorder.stop();
      return;
    }
    if (phase === "transcribing") return;
    if (!supported) return setPhase("unsupported");
    if (!wasAsked()) return setPhase("ask");
    void record();
  }, [phase, record, supported]);

  const cancel = useCallback(() => {
    if (rec.current) {
      rec.current.cancelled = true;
      if (rec.current.recorder.state === "recording") rec.current.recorder.stop();
      else cleanup();
    }
    setPhase("idle");
  }, [cleanup]);

  return { phase, setPhase, levels, elapsed, note, setNote, toggle, record, cancel };
}

export type VoiceInput = ReturnType<typeof useVoiceInput>;

/** The animated mic button in the composer. */
export function MicButton({ voice, t }: { voice: VoiceInput; t: ChatText }) {
  const active = voice.phase === "recording";
  const busy = voice.phase === "transcribing";
  return (
    <motion.button
      type="button"
      onClick={voice.toggle}
      aria-label={active ? t.mic.stop : t.mic.speak}
      title={active ? t.mic.stop : t.mic.speak}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
      className={cn("mic-button relative grid size-10 shrink-0 place-items-center rounded-full text-white", active ? "mic-button-live" : "mic-button-idle")}
    >
      {!active && !busy && <span aria-hidden className="mic-button-halo absolute inset-0 rounded-full" />}
      {active && (
        <>
          <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />
          <span aria-hidden className="absolute -inset-1 rounded-full ring-2 ring-destructive/40" />
        </>
      )}
      {busy ? <Loader2 className="relative size-4.5 animate-spin" /> : active ? <Square className="relative size-3.5 fill-current" /> : <Mic className="relative size-5" />}
    </motion.button>
  );
}

/** Shown above the composer: permission explainer, recording meter, transcribing, problems. */
export function VoicePanel({ voice, t }: { voice: VoiceInput; t: ChatText }) {
  const secs = Math.floor(voice.elapsed / 1000);
  const show = voice.phase !== "idle" || voice.note;
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key={voice.phase + (voice.note ?? "")}
          initial={{ opacity: 0, y: 12, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: 12, height: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="overflow-hidden px-3 sm:px-4"
        >
          <div className="mb-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-foreground/10">
            {voice.phase === "ask" && (
              <div className="flex items-start gap-3">
                <span className="mic-button mic-button-idle grid size-10 shrink-0 place-items-center rounded-full text-white">
                  <Mic className="size-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold">{t.mic.askTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.mic.askBody}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void voice.record()} className="team-gradient-x rounded-full px-4 py-1.5 text-sm font-semibold text-white shadow-sm active:scale-95">
                      {t.mic.allow}
                    </button>
                    <button type="button" onClick={() => voice.setPhase("idle")} className="rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-foreground/15 hover:bg-muted">
                      {t.mic.notNow}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {voice.phase === "recording" && (
              <div className="flex items-center gap-3">
                <span className="relative flex size-3 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-destructive/60" />
                  <span className="relative size-3 rounded-full bg-destructive" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">
                    {t.listening} <span className="text-muted-foreground tabular">0:{String(secs).padStart(2, "0")}</span>
                  </p>
                  <div className="mt-1 flex h-7 items-center gap-[3px]" aria-hidden>
                    {voice.levels.map((l, i) => (
                      <span key={i} className="voice-bar block w-[3px] rounded-full" style={{ height: `${Math.round(l * 100)}%` }} />
                    ))}
                  </div>
                </div>
                <button type="button" onClick={voice.cancel} aria-label={t.mic.cancel} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-4" />
                </button>
                <button type="button" onClick={voice.toggle} className="rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-white active:scale-95">
                  {t.mic.done}
                </button>
              </div>
            )}

            {voice.phase === "transcribing" && (
              <p className="ai-loader-text flex items-center gap-2 text-sm font-semibold">
                <Loader2 className="size-4 animate-spin text-primary" /> {t.mic.transcribing}
              </p>
            )}

            {(voice.phase === "denied" || voice.phase === "unsupported") && (
              <div className="flex items-start gap-3">
                <MicOff className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold">{voice.phase === "denied" ? t.mic.deniedTitle : t.mic.unsupported}</p>
                  {voice.phase === "denied" && <p className="text-xs text-muted-foreground">{t.mic.deniedHelp}</p>}
                </div>
                <button type="button" onClick={() => voice.setPhase("idle")} aria-label={t.mic.cancel} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-4" />
                </button>
              </div>
            )}

            {voice.phase === "idle" && voice.note && (
              <div className="flex items-center gap-2 text-sm">
                <MicOff className="size-4 text-muted-foreground" />
                <span className="flex-1">{voice.note}</span>
                <button type="button" onClick={() => voice.setNote(null)} aria-label={t.mic.cancel} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
