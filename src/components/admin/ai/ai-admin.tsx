"use client";

import { EyeOff, Eye, Loader2, Pencil, RefreshCw, Save, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { useAction } from "@/components/admin/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { editAiText, hideAiText, regenerateAiText, runAiJobsNow, saveAiSettings } from "@/modules/ai/actions";

/* ---------- Settings ---------- */

export type AiSettingsValues = {
  ai_enabled: boolean;
  ai_public_chat: boolean;
  ai_primary_provider: "gemini" | "groq";
};

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl px-1 py-1">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function AiSettingsForm({ initial }: { initial: AiSettingsValues }) {
  const [v, setV] = useState(initial);
  const { run, pending } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveAiSettings(v), "AI settings saved");
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">AI settings</CardTitle>
          <CardDescription>Both providers are free. If the first one is out of quota or busy, the other answers automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Toggle id="ai-enabled" label="AI features on" hint="AI-Viking-Bot chat, AI texts, screenshot reading and reminder drafts." checked={v.ai_enabled} onChange={(ai_enabled) => setV({ ...v, ai_enabled })} />
          <Toggle id="ai-public" label="AI-Viking-Bot for everyone" hint="Off = only logged-in admins see the chat button." checked={v.ai_public_chat} onChange={(ai_public_chat) => setV({ ...v, ai_public_chat })} />
          <div className="grid gap-1.5">
            <Label>Try first</Label>
            <div className="flex w-fit rounded-full bg-muted p-1 text-sm font-semibold">
              {(["gemini", "groq"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setV({ ...v, ai_primary_provider: p })}
                  className={cn("rounded-full px-4 py-1.5 transition-colors", v.ai_primary_provider === p ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {p === "gemini" ? "Google Gemini" : "Groq"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Gemini writes better Tamil; Groq answers faster. The other one is always the backup.</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/* ---------- Generated texts ---------- */

export type AiContentRow = {
  id: string;
  kind: string;
  subjectId: string;
  lang: string;
  title: string | null;
  body: string;
  model: string | null;
  edited: boolean;
  hidden: boolean;
  updatedAt: string;
  label: { text: string; href: string | null };
};

const KIND_LABEL: Record<string, string> = {
  match_summary: "Match reports",
  period_writeup: "Performer write-ups",
  player_insight: "Player form notes",
  sync_check: "Data checks",
};

export function AiContentManager({ rows }: { rows: AiContentRow[] }) {
  const [kind, setKind] = useState("match_summary");
  const [editing, setEditing] = useState<AiContentRow | null>(null);
  const jobs = useAction();
  const counts = useMemo(() => Object.fromEntries(Object.keys(KIND_LABEL).map((k) => [k, rows.filter((r) => r.kind === k && r.lang === "en").length])), [rows]);
  const shown = rows.filter((r) => r.kind === kind);
  // Pair the Tamil and English rows of one subject
  const subjects = [...new Set(shown.map((r) => r.subjectId))].map((s) => shown.filter((r) => r.subjectId === s).sort((a) => (a.lang === "ta" ? -1 : 1)));

  return (
    <Card>
      <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="font-heading text-2xl tracking-wide">AI texts</CardTitle>
        <CardDescription>Written after each sync from the scorecards, in Tamil and English. Edit any text: your version is never overwritten.</CardDescription>
        <div data-slot="card-action" className="row-span-2 self-start">
          <Button
            variant="outline"
            disabled={jobs.pending}
            onClick={() =>
              jobs.run(() => runAiJobsNow({}), undefined, (r) => {
                const res = r as { written: number; failed: number; stoppedAtLimit: boolean } | undefined;
                if (!res) return;
                if (res.failed) toast.warning(`${res.written} written, ${res.failed} failed (free quota used up?). Try again later.`);
                else toast.success(res.written ? `${res.written} texts updated${res.stoppedAtLimit ? " — press again for more" : ""}` : "Everything is up to date");
              })
            }
          >
            {jobs.pending ? <Loader2 className="animate-spin" /> : <Wand2 />} Update now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(KIND_LABEL).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-full px-3 py-1 text-sm font-medium ring-1 ring-foreground/10", kind === k ? "team-gradient-x text-white ring-0" : "hover:bg-muted")}>
              {label} <span className="tabular opacity-75">{counts[k]}</span>
            </button>
          ))}
        </div>
        {subjects.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing written yet. Press “Update now”, or wait for the next sync.</p>
        ) : (
          <ul className="divide-y">
            {subjects.map((pair) => (
              <SubjectRow key={pair[0].subjectId} pair={pair} onEdit={setEditing} />
            ))}
          </ul>
        )}
      </CardContent>
      <EditDialog row={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function SubjectRow({ pair, onEdit }: { pair: AiContentRow[]; onEdit: (r: AiContentRow) => void }) {
  const [lang, setLang] = useState(pair[0].lang);
  const row = pair.find((r) => r.lang === lang) ?? pair[0];
  const { run, pending } = useAction();
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {row.label.href ? (
          <Link href={row.label.href} className="font-semibold hover:underline">
            {row.label.text}
          </Link>
        ) : (
          <span className="font-semibold">{row.label.text}</span>
        )}
        {row.edited && <Badge variant="secondary">Edited</Badge>}
        {row.hidden && <Badge variant="outline">Hidden</Badge>}
        <span className="text-xs text-muted-foreground">{row.model}</span>
        <div className="ml-auto flex items-center gap-1">
          {pair.map((r) => (
            <button key={r.lang} type="button" onClick={() => setLang(r.lang)} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", lang === r.lang ? "bg-muted" : "text-muted-foreground")}>
              {r.lang === "ta" ? "தமிழ்" : "EN"}
            </button>
          ))}
          <Button size="icon" variant="ghost" className="size-8" title="Edit" onClick={() => onEdit(row)}>
            <Pencil />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" title={row.hidden ? "Show on the site" : "Hide from the site"} disabled={pending} onClick={() => run(() => hideAiText({ id: row.id, hidden: !row.hidden }), row.hidden ? "Shown again" : "Hidden")}>
            {row.hidden ? <Eye /> : <EyeOff />}
          </Button>
          <Button size="icon" variant="ghost" className="size-8" title="Write again with AI" disabled={pending} onClick={() => run(() => regenerateAiText({ kind: row.kind as never, subjectId: row.subjectId }), "Written again")}>
            {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </div>
      </div>
      {row.title && <p className="text-sm font-medium">{row.title}</p>}
      <p className={cn("line-clamp-3 text-sm text-muted-foreground", row.hidden && "opacity-60")}>{row.body}</p>
    </li>
  );
}

function EditDialog({ row, onClose }: { row: AiContentRow | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [forId, setForId] = useState<string | null>(null);
  const { run, pending } = useAction();
  if (row && forId !== row.id) {
    setForId(row.id);
    setTitle(row.title ?? "");
    setBody(row.body);
  }
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Edit {row?.lang === "ta" ? "Tamil" : "English"} text
          </DialogTitle>
          <DialogDescription>{row?.label.text}. Once saved, the AI will not rewrite it (use “Write again” to hand it back).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ai-edit-title">Headline</Label>
            <Input id="ai-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ai-edit-body">Text</Label>
            <Textarea id="ai-edit-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || body.trim().length < 10} onClick={() => row && run(() => editAiText({ id: row.id, title: title.trim() || null, body }), "Saved", onClose)}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
