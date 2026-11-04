"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { useStoredChoice } from "@/hooks/use-stored-choice";

export type AiTextView = { lang: "en" | "ta"; title: string | null; body: string };


/**
 * An AI-written text (match report, performers write-up, form note) in Tamil and English.
 * Tamil first; the visitor's choice is remembered in this browser. "Copy" puts it on the
 * clipboard ready to paste into the team WhatsApp group.
 */
export function AiTextCard({ texts, label, note, className }: { texts: AiTextView[]; label: string; note?: string; className?: string }) {
  const [lang, pick] = useStoredChoice("ai-text:lang", ["ta", "en"] as const, "ta");
  const [copied, setCopied] = useState(false);

  const text = texts.find((t) => t.lang === lang) ?? texts[0];
  if (!text) return null;
  const langs = (["ta", "en"] as const).filter((l) => texts.some((t) => t.lang === l));

  return (
    <Card className={cn("ai-text-card relative gap-3", className)}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ai-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white uppercase">
            <motion.span animate={{ rotate: [0, 18, -12, 0] }} transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 2 }}>
              <Sparkles className="size-3.5" />
            </motion.span>
            {label}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {langs.length > 1 && (
              <div className="flex rounded-full bg-muted p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Language">
                {langs.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={lang === l}
                    onClick={() => pick(l)}
                    className={cn("rounded-full px-2.5 py-0.5 transition-colors", lang === l ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {l === "ta" ? "தமிழ்" : "English"}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              title="Copy for WhatsApp"
              aria-label="Copy for WhatsApp"
              onClick={() => {
                const value = [text.title ? `*${text.title}*` : null, text.body].filter(Boolean).join("\n\n");
                void navigator.clipboard?.writeText(value).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            </button>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={lang} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-1.5">
            {text.title && <h3 className="font-heading text-xl leading-snug font-bold tracking-wide text-balance">{text.title}</h3>}
            <p className="leading-relaxed whitespace-pre-line text-foreground/90">{text.body}</p>
          </motion.div>
        </AnimatePresence>
        {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}
