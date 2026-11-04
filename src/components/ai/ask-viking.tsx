"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { Check, Copy, Loader2, Mic, MicOff, RotateCcw, SendHorizontal, Shield, Sparkles, Square, Users, Volume2, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { cn } from "cn";
import { useStoredChoice } from "@/hooks/use-stored-choice";
import { CHANGE_TOOLS, type ChatLang, type ChatMessage, type ChatMode, type ChatPreview } from "@/modules/ai/chat-types";
import { chatText, type ChatText } from "./chat-text";
import { ChatMarkdown } from "./markdown";

/*
 * "AI-Viking-Bot": the floating AI assistant on every page.
 *   - launcher button bottom-right (above the phone menu), opens a chat panel
 *     (a card on desktop and tablet, full screen on phones)
 *   - Tamil / English / auto language, voice input, read-aloud, copy
 *   - admins can switch to Admin mode: money questions and changes they confirm on a preview card
 *   - the conversation is kept in this browser only (localStorage), per mode
 */

const STORE = (mode: ChatMode) => `ask-viking:${mode}`;

/** What the open chat sends with every request; kept outside React so the transport always reads the latest. */
const context = { lang: "auto" as ChatLang, path: "/" };

// Admin and team chats are separate conversations; the mode travels in the chat id
const transport = new DefaultChatTransport<ChatMessage>({
  api: "/api/ai/chat",
  prepareSendMessagesRequest: ({ id, messages }) => ({
    body: { messages, mode: id.endsWith("-admin") ? "admin" : "public", lang: context.lang, path: context.path },
  }),
});
const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

function load(mode: ChatMode): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORE(mode));
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function save(mode: ChatMode, messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORE(mode), JSON.stringify(messages.slice(-30)));
  } catch {
    /* private mode or full storage: the chat still works, it just isn't remembered */
  }
}

export function AskViking({ isAdmin, teamName }: { isAdmin: boolean; teamName: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("public");
  const [lang, chooseLang] = useStoredChoice<ChatLang>("ask-viking:lang", ["auto", "ta", "en"], "auto");
  const [teaser, setTeaser] = useState(false);

  // A short "Ask me" bubble once per visit, so people notice the assistant
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("ask-viking:teased") === "1";
      sessionStorage.setItem("ask-viking:teased", "1");
    } catch {
      /* ignore */
    }
    if (seen) return;
    const show = setTimeout(() => setTeaser(true), 2500);
    const hide = setTimeout(() => setTeaser(false), 9000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);


  // Phones: the panel is full screen, so stop the page behind it from scrolling
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 767px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.div
            key="launcher"
            className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 flex items-center gap-2 md:right-6 md:bottom-6"
            initial={{ opacity: 0, scale: 0.4, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.4, y: 20 }}
            transition={SPRING}
          >
            <AnimatePresence>
              {teaser && (
                <motion.button
                  type="button"
                  onClick={() => {
                    setTeaser(false);
                    setOpen(true);
                  }}
                  className="relative rounded-2xl rounded-br-md bg-card px-3.5 py-2 text-left text-sm shadow-lg ring-1 ring-foreground/10"
                  initial={{ opacity: 0, x: 16, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 16, scale: 0.9 }}
                  transition={SPRING}
                >
                  <span className="block font-semibold">AI-Viking-Bot 🏏</span>
                  <span className="block text-xs text-muted-foreground">கேளுங்க! Scores, dues, fixtures…</span>
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button
              type="button"
              aria-label="Open AI-Viking-Bot, the team assistant"
              onClick={() => {
                setTeaser(false);
                setOpen(true);
              }}
              className="ask-viking-launcher relative grid size-15 place-items-center rounded-full text-white shadow-[0_10px_30px_-6px_oklch(0.45_0.18_330/0.65)]"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
            >
              <span aria-hidden className="ask-viking-ring absolute -inset-1 rounded-full" />
              <span aria-hidden className="ask-viking-pulse absolute inset-0 rounded-full" />
              <span className="relative grid size-13 place-items-center overflow-hidden rounded-full bg-white ring-2 ring-white/80">
                <Image src="/team-logo.jpeg" alt="" width={104} height={104} className="size-12 object-contain" />
              </span>
              <motion.span
                aria-hidden
                className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow ring-2 ring-background"
                animate={{ rotate: [0, 14, -10, 0], scale: [1, 1.15, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.6 }}
              >
                <Sparkles className="size-3.5" />
              </motion.span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            role="dialog"
            aria-label="AI-Viking-Bot chat"
            className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background md:inset-auto md:right-6 md:bottom-6 md:h-[min(680px,calc(100dvh-3rem))] md:w-[420px] md:rounded-3xl md:shadow-[0_24px_60px_-12px_rgb(0_0_0/0.35)] md:ring-1 md:ring-foreground/10"
            style={{ transformOrigin: "bottom right" }}
            initial={{ opacity: 0, scale: 0.6, y: 60 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 60 }}
            transition={SPRING}
          >
            <ChatSession
              key={mode}
              mode={mode}
              lang={lang}
              isAdmin={isAdmin}
              teamName={teamName}
              onMode={setMode}
              onLang={chooseLang}
              onClose={() => setOpen(false)}
            />
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---------- One conversation (public or admin) ---------- */

function ChatSession(props: {
  mode: ChatMode;
  lang: ChatLang;
  isAdmin: boolean;
  teamName: string;
  onMode: (m: ChatMode) => void;
  onLang: (l: ChatLang) => void;
  onClose: () => void;
}) {
  const { mode, lang, isAdmin, onClose } = props;
  const pathname = usePathname();
  useEffect(() => {
    context.lang = lang;
    context.path = pathname;
  }, [lang, pathname]);

  const { messages, sendMessage, status, stop, error, regenerate, setMessages, addToolApprovalResponse, clearError } = useChat<ChatMessage>({
    id: `ask-viking-${mode}`,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  // Restore this browser's conversation once, then keep saving it
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = load(mode);
    if (saved.length) setMessages(saved);
  }, [mode, setMessages]);
  useEffect(() => {
    if (restored.current && (status === "ready" || status === "error")) save(mode, messages);
  }, [messages, status, mode]);

  const busy = status === "submitted" || status === "streaming";
  const [input, setInput] = useState("");
  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    clearError();
    void sendMessage({ text: t });
    setInput("");
  };

  // Keep the newest message in view
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: status === "streaming" ? "auto" : "smooth" });
  }, [messages, status]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const previews = useMemo(() => {
    const map = new Map<string, ChatPreview>();
    for (const m of messages) for (const p of m.parts) if (p.type === "data-preview" && p.id) map.set(p.id, p.data);
    return map;
  }, [messages]);

  const closeOnPhone = () => window.matchMedia("(max-width: 767px)").matches && onClose();
  const t = chatText(lang);
  const errorText = error ? readError(error) : null;

  return (
    <>
      <ChatHeader {...props} t={t} busy={busy} onNew={() => { stop(); setMessages([]); save(mode, []); clearError(); }} />

      <div ref={scroller} className="ask-viking-scroll relative flex-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-2 sm:px-4">
        {messages.length === 0 ? (
          <Welcome mode={mode} path={pathname} t={t} onPick={send} />
        ) : (
          <ul className="space-y-4">
            {messages.map((m, i) => (
              <MessageItem
                key={m.id}
                message={m}
                last={i === messages.length - 1}
                streaming={busy && i === messages.length - 1}
                previews={previews}
                t={t}
                onApprove={(id, approved) => addToolApprovalResponse({ id, approved })}
                onNavigate={closeOnPhone}
              />
            ))}
            {status === "submitted" && messages.at(-1)?.role === "user" && <Thinking t={t} />}
          </ul>
        )}
        {errorText && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <XCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">{errorText}</div>
            <button type="button" onClick={() => { clearError(); void regenerate(); }} className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-destructive/30 hover:bg-destructive/10">
              {t.retry}
            </button>
          </motion.div>
        )}
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSend={() => send(input)}
        onStop={stop}
        busy={busy}
        t={t}
        placeholder={t.placeholder(mode === "admin")}
      />
      <p className="px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] text-center text-[10.5px] text-muted-foreground md:pb-2">
        {t.footer}
        {isAdmin && mode === "public" ? t.adminHint : ""}
      </p>
    </>
  );
}

function readError(error: Error) {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    /* not JSON */
  }
  return error.message || "Something went wrong. Please try again.";
}

/* ---------- Header ---------- */

function ChatHeader({ mode, lang, isAdmin, teamName, busy, t, onMode, onLang, onClose, onNew }: {
  mode: ChatMode; lang: ChatLang; isAdmin: boolean; teamName: string; busy: boolean; t: ChatText;
  onMode: (m: ChatMode) => void; onLang: (l: ChatLang) => void; onClose: () => void; onNew: () => void;
}) {
  return (
    <header className="team-gradient-x relative shrink-0 overflow-hidden px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 text-white md:pt-3">
      <span aria-hidden className="ask-viking-shine pointer-events-none absolute inset-0" />
      <div className="relative flex items-center gap-3">
        <div className="relative">
          <span className="grid size-11 place-items-center overflow-hidden rounded-2xl bg-white ring-2 ring-white/60">
            <Image src="/team-logo.jpeg" alt="" width={88} height={88} className="size-10 object-contain" />
          </span>
          <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-emerald-400 ring-2 ring-[var(--sidebar-from)]">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-xl leading-none font-bold tracking-wide">AI-Viking-Bot</h2>
          <p className="mt-1 truncate text-xs text-white/80">
            {busy ? (
              <span className="inline-flex items-center gap-1">
                {t.typing}
                <span className="ask-viking-dots" />
              </span>
            ) : (
              t.subtitle(teamName, mode === "admin")
            )}
          </p>
        </div>
        <button type="button" onClick={onNew} aria-label="New chat" title="New chat" className="grid size-9 place-items-center rounded-full hover:bg-white/15">
          <RotateCcw className="size-4.5" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-white/15">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative mt-3 flex items-center gap-2">
        <Segmented
          value={lang}
          onChange={onLang}
          options={[
            { value: "ta", label: "தமிழ்" },
            { value: "en", label: "English" },
            { value: "auto", label: "Auto" },
          ]}
          label="Answer language"
        />
        {isAdmin && (
          <Segmented
            className="ml-auto"
            value={mode}
            onChange={onMode}
            options={[
              { value: "public", label: "Team", icon: <Users className="size-3.5" /> },
              { value: "admin", label: "Admin", icon: <Shield className="size-3.5" /> },
            ]}
            label="Mode"
          />
        )}
      </div>
    </header>
  );
}

function Segmented<T extends string>({ value, onChange, options, label, className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: React.ReactNode }[]; label: string; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("relative flex rounded-full bg-black/20 p-0.5 text-xs font-semibold", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("relative z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors", value === o.value ? "text-[var(--sidebar-from)]" : "text-white/85 hover:text-white")}
        >
          {value === o.value && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 -z-10 rounded-full bg-white shadow" transition={SPRING} />}
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Empty state ---------- */

function Welcome({ mode, path, t, onPick }: { mode: ChatMode; path: string; t: ChatText; onPick: (text: string) => void }) {
  const here = { match: /^\/matches\/[0-9a-f-]{36}$/.test(path), player: /^\/players\/[0-9a-f-]{36}$/.test(path) };
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-4 text-center">
      <div className="relative mb-4 size-24">
        <motion.span aria-hidden className="ask-viking-orbit absolute inset-0 rounded-full" animate={{ rotate: 360 }} transition={{ duration: 6, ease: "linear", repeat: Infinity }}>
          <span className="cricket-ball absolute -top-1.5 left-1/2 size-4 -translate-x-1/2 rounded-full" />
        </motion.span>
        <motion.span
          className="absolute inset-2.5 grid place-items-center overflow-hidden rounded-full bg-white shadow-lg ring-4 ring-primary/10"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING}
        >
          <Image src="/team-logo.jpeg" alt="" width={140} height={140} className="size-16 object-contain" />
        </motion.span>
      </div>
      <motion.h3 className="font-heading text-2xl font-bold tracking-wide" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 }}>
        {t.hello}
      </motion.h3>
      <motion.p className="mt-1 max-w-xs text-sm text-muted-foreground" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.14 }}>
        {t.welcome(mode === "admin")}
      </motion.p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {t.suggestions(mode === "admin", here).map((s, i) => (
          <motion.button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full bg-card px-3 py-1.5 text-[13px] shadow-sm ring-1 ring-foreground/10 hover:bg-accent hover:ring-primary/30"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...SPRING, delay: 0.18 + i * 0.05 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.96 }}
          >
            {s}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Messages ---------- */

type AnyPart = ChatMessage["parts"][number] & { toolCallId?: string; state?: string; approval?: { id: string; approved?: boolean }; errorText?: string };

function MessageItem({ message, last, streaming, previews, t, onApprove, onNavigate }: {
  message: ChatMessage; last: boolean; streaming: boolean; previews: Map<string, ChatPreview>; t: ChatText;
  onApprove: (id: string, approved: boolean) => void; onNavigate: () => void;
}) {
  const user = message.role === "user";
  const text = message.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n\n");

  if (user) {
    return (
      <motion.li className="flex justify-end" initial={{ opacity: 0, x: 24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={SPRING}>
        <div className="team-gradient-x max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap text-white shadow-sm">{text}</div>
      </motion.li>
    );
  }

  return (
    <motion.li className="flex items-start gap-2" initial={{ opacity: 0, x: -24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={SPRING}>
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-foreground/10">
        <Image src="/team-logo.jpeg" alt="" width={56} height={56} className="size-6 object-contain" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {message.parts.map((raw, i) => {
          const part = raw as AnyPart;
          if (part.type === "text") {
            return (part as { text: string }).text.trim() ? (
              <div key={i} className="rounded-2xl rounded-tl-md bg-card px-3.5 py-2.5 shadow-sm ring-1 ring-foreground/8">
                <ChatMarkdown text={(part as { text: string }).text} onNavigate={onNavigate} />
                {streaming && i === message.parts.length - 1 && <span className="ask-viking-caret" />}
              </div>
            ) : null;
          }
          if (part.type.startsWith("tool-")) {
            const name = part.type.slice(5);
            return CHANGE_TOOLS.has(name) ? (
              <ApprovalCard key={part.toolCallId ?? i} name={name} part={part} preview={part.toolCallId ? previews.get(part.toolCallId) : undefined} t={t} onApprove={onApprove} />
            ) : (
              <ToolChip key={part.toolCallId ?? i} name={name} state={part.state} t={t} />
            );
          }
          return null;
        })}
        {streaming && !text.trim() && !message.parts.some((x) => (x as AnyPart).state === "approval-requested") && (
          <AiLoader t={t} tool={runningTool(message, t)} />
        )}
        {!streaming && text && <MessageActions text={text} model={message.metadata?.provider} last={last} t={t} />}
      </div>
    </motion.li>
  );
}

/** The label of the lookup running right now, for the loader line. */
function runningTool(message: ChatMessage, t: ChatText) {
  const part = [...message.parts].reverse().find((p) => p.type.startsWith("tool-")) as AnyPart | undefined;
  return part && (part.state === "input-streaming" || part.state === "input-available") ? t.tool(part.type.slice(5)) : undefined;
}

/**
 * The AI loader: a spinning team-colour orb with a cricket ball in orbit, the current step
 * ("Checking the leaderboard…") in shimmering text, and placeholder lines where the answer will be.
 */
function AiLoader({ t, tool }: { t: ChatText; tool?: string }) {
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
      className="ai-loader relative overflow-hidden rounded-2xl rounded-tl-md bg-card px-3.5 py-3 shadow-sm ring-1 ring-foreground/8"
    >
      <div className="flex items-center gap-3">
        <span className="relative grid size-10 shrink-0 place-items-center">
          <span className="ai-loader-ring absolute inset-0 rounded-full" />
          <span className="ai-loader-core absolute inset-[5px] rounded-full" />
          <motion.span className="absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}>
            <span className="cricket-ball absolute -top-0.5 left-1/2 size-2.5 -translate-x-1/2 rounded-full" />
          </motion.span>
          <Sparkles className="relative size-4 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={tool ?? "default"} className="ai-loader-text truncate text-[13.5px] font-semibold" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {t.fetching(tool)}
            </motion.p>
          </AnimatePresence>
          <p className="truncate text-[11px] text-muted-foreground">{t.loaderHint}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5" aria-hidden>
        {["92%", "78%", "55%"].map((w, i) => (
          <span key={w} className="ai-loader-line block h-2 rounded-full" style={{ width: w, animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </motion.div>
  );
}

function ToolChip({ name, state, t }: { name: string; state?: string; t: ChatText }) {
  const done = state === "output-available";
  const failed = state === "output-error";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1",
        done ? "bg-success/10 text-success ring-success/20" : failed ? "bg-destructive/10 text-destructive ring-destructive/20" : "ask-viking-shimmer bg-primary/8 text-primary ring-primary/20",
      )}
    >
      {done ? <Check className="size-3.5" /> : failed ? <XCircle className="size-3.5" /> : <span className="cricket-ball cricket-ball-spin size-3 rounded-full" />}
      {t.tool(name)}
      {!done && !failed && "…"}
    </motion.div>
  );
}

function ApprovalCard({ name, part, preview, t, onApprove }: { name: string; part: AnyPart; preview?: ChatPreview; t: ChatText; onApprove: (id: string, approved: boolean) => void }) {
  const state = part.state;
  const output = (part as { output?: { done?: boolean; total?: string } }).output;
  const title = preview?.title ?? t.tool(name);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
      className={cn(
        "overflow-hidden rounded-2xl bg-card shadow-sm ring-1",
        state === "approval-requested" ? "ring-amber-400/60" : state === "output-available" ? "ring-success/30" : state === "output-denied" ? "ring-foreground/10 opacity-70" : "ring-foreground/10",
      )}
    >
      <div className="flex items-center gap-2 border-b border-foreground/5 bg-muted/50 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Shield className="size-3.5" />
        {state === "approval-requested" ? t.card.requested : state === "output-available" ? t.card.saved : state === "output-denied" ? t.card.cancelled : state === "output-error" ? t.card.notSaved : t.card.preparing}
      </div>
      <div className="space-y-1.5 px-3 py-2.5 text-[13.5px]">
        <p className="font-semibold">{title}</p>
        {preview?.lines.map((l) => (
          <p key={l} className="text-muted-foreground">
            {l}
          </p>
        ))}
        {preview?.warnings?.map((w) => (
          <p key={w} className="rounded-md bg-amber-500/10 px-2 py-1 text-[12.5px] text-amber-700 dark:text-amber-300">
            {w}
          </p>
        ))}
        {preview?.error && <p className="text-destructive">{preview.error}</p>}
        {state === "output-error" && <p className="text-destructive">{part.errorText}</p>}
        {state === "output-available" && output?.total && <p className="text-success">
            {t.card.total} {output.total}
          </p>}
      </div>
      {state === "approval-requested" && part.approval && (
        <div className="flex gap-2 px-3 pb-3">
          <button type="button" onClick={() => onApprove(part.approval!.id, true)} className="team-gradient-x inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-white shadow-sm active:scale-[0.98]">
            <Check className="size-4" /> {t.card.confirm}
          </button>
          <button type="button" onClick={() => onApprove(part.approval!.id, false)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold ring-1 ring-foreground/15 hover:bg-muted active:scale-[0.98]">
            <X className="size-4" /> {t.card.cancel}
          </button>
        </div>
      )}
      {state === "approval-responded" && (
        <div className="flex items-center gap-2 px-3 pb-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {part.approval?.approved ? t.card.saving : t.card.cancelling}
        </div>
      )}
    </motion.div>
  );
}

/** Audio made on the server, kept per answer so a replay starts at once. */
const voiceCache = new Map<string, string>();
let playing: HTMLAudioElement | null = null;

function MessageActions({ text, model, last, t }: { text: string; model?: string; last: boolean; t: ChatText }) {
  const [copied, setCopied] = useState(false);
  const [voice, setVoice] = useState<"idle" | "loading" | "playing">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);

  const stopVoice = () => {
    audio.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setVoice("idle");
  };

  // The phone's own voice: only if the server voice is unavailable
  const browserVoice = (lang: string) => {
    if (!("speechSynthesis" in window)) return setVoice("idle");
    const u = new SpeechSynthesisUtterance(text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_#`|>-]/g, " "));
    u.lang = lang;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang.replace("_", "-").startsWith(lang === "ta-IN" ? "ta" : "en-IN"));
    if (v) u.voice = v;
    u.onend = () => setVoice("idle");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setVoice("playing");
  };

  const speak = async () => {
    if (voice !== "idle") return stopVoice();
    // தமிழ் → Tamil voice, English → English voice, Auto → the answer's own language
    const lang = t.speechLang(text);
    const key = `${lang}:${text}`;
    setVoice("loading");
    try {
      let url = voiceCache.get(key);
      if (!url) {
        const res = await fetch("/api/ai/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang: lang === "ta-IN" ? "ta" : "en" }) });
        if (!res.ok) throw new Error(await res.text());
        url = URL.createObjectURL(await res.blob());
        voiceCache.set(key, url);
      }
      playing?.pause();
      const el = new Audio(url);
      playing = el;
      audio.current = el;
      el.onplaying = () => setVoice("playing");
      el.onended = () => setVoice("idle");
      el.onpause = () => setVoice("idle");
      // A browser that cannot play the file (or blocks it) gets the device voice instead
      const started = new Promise<void>((resolve, reject) => {
        el.addEventListener("playing", () => resolve(), { once: true });
        el.addEventListener("error", () => reject(new Error("cannot play")), { once: true });
        setTimeout(() => reject(new Error("did not start")), 6000);
      });
      await Promise.all([el.play(), started]);
    } catch {
      audio.current?.pause();
      browserVoice(lang);
    }
  };

  useEffect(() => () => audio.current?.pause(), []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className={cn("flex items-center gap-1 pl-1 text-muted-foreground", !last && "opacity-0 hover:opacity-100 focus-within:opacity-100")}>
      <button
        type="button"
        title={t.copy}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="grid size-7 place-items-center rounded-md hover:bg-muted hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
      <button
        type="button"
        title={voice === "loading" ? t.preparingVoice : voice === "playing" ? t.stopReading : t.readAloud}
        aria-label={voice === "loading" ? t.preparingVoice : voice === "playing" ? t.stopReading : t.readAloud}
        onClick={() => void speak()}
        className={cn("grid size-7 place-items-center rounded-md hover:bg-muted hover:text-foreground", voice !== "idle" && "text-primary")}
      >
        {voice === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : voice === "playing" ? <Square className="size-3 fill-current" /> : <Volume2 className="size-3.5" />}
      </button>
      {voice === "playing" && <span className="ask-viking-eq" aria-hidden><i /><i /><i /><i /></span>}
      {model && <span className="ml-1 text-[10.5px]">via {model === "gemini" ? "Gemini" : "Groq"}</span>}
    </motion.div>
  );
}

function Thinking({ t }: { t: ChatText }) {
  return (
    <motion.li className="flex items-start gap-2" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-foreground/10">
        <Image src="/team-logo.jpeg" alt="" width={56} height={56} className="size-6 object-contain" />
      </span>
      <div className="min-w-0 flex-1">
        <AiLoader t={t} />
      </div>
    </motion.li>
  );
}

/* ---------- Composer ---------- */

const noSubscribe = () => () => {};

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

function Composer({ value, onChange, onSend, onStop, busy, t, placeholder }: {
  value: string; onChange: (v: string) => void; onSend: () => void; onStop: () => void; busy: boolean; t: ChatText; placeholder: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const canListen = useSyncExternalStore(
    noSubscribe,
    () => {
      const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    },
    () => false,
  );

  useEffect(() => {
    area.current?.focus({ preventScroll: true });
  }, []);

  // Grow with the text, up to five lines
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const toggleMic = useCallback(() => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = t.micLang;
    r.interimResults = true;
    r.continuous = false;
    const before = value ? `${value.trimEnd()} ` : "";
    r.onresult = (e) => onChange(before + Array.from(e.results, (res) => res[0]!.transcript).join(""));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }, [t.micLang, listening, onChange, value]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="shrink-0 px-3 pt-2 sm:px-4"
    >
      <div className="flex items-end gap-1.5 rounded-3xl bg-card p-1.5 pl-4 shadow-sm ring-1 ring-foreground/10 transition-shadow focus-within:ring-2 focus-within:ring-primary/40">
        <textarea
          ref={area}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          placeholder={listening ? t.listening : placeholder}
          aria-label="Message"
          className="max-h-[120px] min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-muted-foreground/80"
        />
        {canListen && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? "Stop voice input" : "Speak your question"}
            className={cn("relative grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground", listening && "text-destructive")}
          >
            {listening && <span className="absolute inset-0 animate-ping rounded-full bg-destructive/20" />}
            {listening ? <MicOff className="size-4.5" /> : <Mic className="size-4.5" />}
          </button>
        )}
        <AnimatePresence mode="popLayout" initial={false}>
          {busy ? (
            <motion.button key="stop" type="button" onClick={onStop} aria-label="Stop" className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={SPRING}>
              <Square className="size-3.5 fill-current" />
            </motion.button>
          ) : (
            <motion.button
              key="send"
              type="submit"
              disabled={!value.trim()}
              aria-label="Send"
              className="team-gradient-x grid size-9 shrink-0 place-items-center rounded-full text-white shadow disabled:opacity-40"
              initial={{ scale: 0, rotate: 90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: -90 }}
              whileTap={{ scale: 0.88 }}
              transition={SPRING}
            >
              <SendHorizontal className="size-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
