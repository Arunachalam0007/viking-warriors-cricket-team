"use client";

import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Copy, Loader2, MessageCircle, Phone, Save, Send, SkipForward, Sparkles, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { useAction } from "@/components/admin/use-action";
import { PlayerAvatar } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { draftDuesReminders, groupDuesSummary, markReminderSent, savePaymentContact } from "@/modules/ai/actions";
import type { ReminderDraft } from "@/modules/ai/reminders";
import { savePlayerPhones } from "@/modules/players/actions";

export type Owing = { playerId: string; name: string; photo: string | null; owes: number; phone: string | null; lastRemindedAt: string | null };
export type MemberPhone = { playerId: string; name: string; photo: string | null; phone: string | null };
export type SentReminder = { id: string; name: string; sentAt: string | null; message: string };
type Lang = "ta" | "en";

const WEEK = 7 * 86_400_000;
const recentlyReminded = (iso: string | null) => Boolean(iso && Date.now() - new Date(iso).getTime() < WEEK);

/** wa.me: Indian 10-digit numbers get the 91 country code. Without a number WhatsApp asks whom to send to. */
function whatsappLink(phone: string | null, text: string) {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

function LangSwitch({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex rounded-full bg-muted p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Message language">
      {(["ta", "en"] as const).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={value === l} onClick={() => onChange(l)} className={cn("rounded-full px-2.5 py-0.5", value === l ? "bg-background shadow-sm" : "text-muted-foreground")}>
          {l === "ta" ? "தமிழ்" : "English"}
        </button>
      ))}
    </div>
  );
}

export function RemindersWorkspace(props: {
  owing: Owing[];
  members: MemberPhone[];
  contact: { gpay_name: string; gpay_number: string };
  history: SentReminder[];
}) {
  const { owing, members, contact, history } = props;
  // Ticked: everyone who owes and was not reminded in the last 7 days
  const [picked, setPicked] = useState<Set<string>>(() => new Set(owing.filter((o) => !recentlyReminded(o.lastRemindedAt)).map((o) => o.playerId)));
  const [tone, setTone] = useState<"friendly" | "firm">("friendly");
  const [drafts, setDrafts] = useState<ReminderDraft[]>([]);
  const [sending, setSending] = useState(false);
  const [lang, setLang] = useState<Lang>("ta");
  const [pending, start] = useTransition();
  const noPhone = owing.filter((o) => !o.phone).length;

  const draft = () =>
    start(async () => {
      const res = await draftDuesReminders({ playerIds: [...picked], tone });
      if (res.ok) {
        setDrafts(res.data ?? []);
        if (!res.data?.length) toast.info("Nobody selected owes anything");
      } else toast.error(res.error);
    });

  return (
    <div className="grid gap-5">
      <PaymentContactCard contact={contact} members={members} />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Who owes</CardTitle>
          <CardDescription>Players reminded in the last 7 days are not ticked. Draft the messages, then send them one tap at a time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {noPhone > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              {noPhone} of {owing.length} players have no phone number yet. Add them under “Phone numbers” below; without one, WhatsApp asks whom to send to.
            </p>
          )}
          {owing.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">Everyone is paid up. 🎉</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {owing.map((o) => (
                <li key={o.playerId}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 ring-1 ring-foreground/10 hover:bg-muted/50">
                    <Checkbox
                      checked={picked.has(o.playerId)}
                      onCheckedChange={(c) =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (c) n.add(o.playerId);
                          else n.delete(o.playerId);
                          return n;
                        })
                      }
                    />
                    <PlayerAvatar name={o.name} photo={o.photo} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {o.lastRemindedAt ? `Reminded ${formatDate(o.lastRemindedAt, { day: "numeric", month: "short" })}` : "Not reminded yet"}
                        {!o.phone && " · no phone"}
                      </span>
                    </span>
                    <span className="font-semibold text-destructive tabular">{rupees(o.owes)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full bg-muted p-1 text-sm font-semibold">
              {(["friendly", "firm"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTone(t)} className={cn("rounded-full px-3 py-1", tone === t ? "bg-background shadow-sm" : "text-muted-foreground")}>
                  {t === "friendly" ? "Friendly" : "Firm but polite"}
                </button>
              ))}
            </div>
            <Button onClick={draft} disabled={pending || picked.size === 0} className="team-gradient-x border-0 text-white">
              {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft {picked.size} message{picked.size === 1 ? "" : "s"}
            </Button>
            {drafts.length > 0 && (
              <Button onClick={() => setSending(true)} className="bg-[#25D366] text-white hover:bg-[#1ebe57]">
                <Send /> Send all ({drafts.length})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {drafts.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-2xl font-bold tracking-wide">Drafts</h2>
          <LangSwitch value={lang} onChange={setLang} />
        </div>
      )}
      <AnimatePresence>
        {drafts.map((d, i) => (
          <motion.div key={d.playerId} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }}>
            <DraftCard draft={d} lang={lang} />
          </motion.div>
        ))}
      </AnimatePresence>

      <SendAllDialog open={sending} onClose={() => setSending(false)} drafts={drafts} lang={lang} onLang={setLang} />

      <GroupSummaryCard />
      <PhonesCard members={members} />
      <HistoryCard history={history} />
    </div>
  );
}

/* ---------- Payment contact (Ragul's GPay) ---------- */

function PaymentContactCard({ contact, members }: { contact: { gpay_name: string; gpay_number: string }; members: MemberPhone[] }) {
  const [name, setName] = useState(contact.gpay_name);
  const [number, setNumber] = useState(contact.gpay_number);
  const { run, pending } = useAction();
  const match = members.find((m) => m.phone && name.trim() && m.name.toLowerCase().startsWith(name.trim().toLowerCase()));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-2xl tracking-wide">
          <Phone className="size-5" /> GPay number in the messages
        </CardTitle>
        <CardDescription>Every reminder and the group summary end with “💵 Pay Ragul by cash or GPay: number”. Left empty, the mobile number on Ragul&apos;s player record is used. Only in messages admins send, never on the public site.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => savePaymentContact({ gpay_name: name, gpay_number: number }), "GPay number saved");
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="gpay-name">Name</Label>
            <Input id="gpay-name" className="h-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ragul" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gpay-number">GPay number</Label>
            <Input id="gpay-number" className="h-10 tabular" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="98765 43210" />
            {!number && match && (
              <button type="button" className="w-fit text-xs font-medium text-primary hover:underline" onClick={() => setNumber(match.phone!)}>
                Use {match.name}&apos;s number ({match.phone})
              </button>
            )}
          </div>
          <Button type="submit" className="h-10" disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
        </form>
        {!contact.gpay_number && !match && <p className="mt-3 text-sm text-warning">No number yet for {contact.gpay_name || "the admin"}: messages will say “pay by cash or UPI” without a number. Enter it here, or as {contact.gpay_name}&apos;s mobile under Phone numbers below.</p>}
      </CardContent>
    </Card>
  );
}

/* ---------- One draft ---------- */

function DraftCard({ draft, lang }: { draft: ReminderDraft; lang: Lang }) {
  const [text, setText] = useState({ ta: draft.ta, en: draft.en });
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const { run } = useAction();
  const message = text[lang];
  const markSent = () => run(() => markReminderSent({ playerId: draft.playerId, message }), undefined, () => setSent(true));

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{draft.name}</span>
          <span className="font-semibold text-destructive tabular">{rupees(draft.owes)}</span>
          <span className="text-xs text-muted-foreground">
            {draft.matches.length} unpaid · {draft.phone ?? "no phone"}
          </span>
          {sent && (
            <Badge className="ml-auto bg-success text-white">
              <Check /> Sent
            </Badge>
          )}
        </div>
        <Textarea rows={9} value={message} onChange={(e) => setText({ ...text, [lang]: e.target.value })} className="font-[inherit] text-[14.5px] leading-relaxed" />
        <div className="flex flex-wrap gap-2">
          <Button asChild className="bg-[#25D366] text-white hover:bg-[#1ebe57]">
            <a href={whatsappLink(draft.phone, message)} target="_blank" rel="noreferrer" onClick={markSent}>
              <MessageCircle /> {draft.phone ? "Send on WhatsApp" : "Choose chat in WhatsApp"}
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard?.writeText(message).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? <Check className="text-success" /> : <Copy />} Copy
          </Button>
          {!sent && (
            <Button variant="ghost" onClick={markSent}>
              <CheckCircle2 /> Mark as sent
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Send all: one tap per player ---------- */

function SendAllDialog({ open, onClose, drafts, lang, onLang }: { open: boolean; onClose: () => void; drafts: ReminderDraft[]; lang: Lang; onLang: (l: Lang) => void }) {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, Partial<Record<Lang, string>>>>({});
  const { run } = useAction();
  const current = drafts[index];
  const finished = index >= drafts.length;
  const message = current ? (edits[current.playerId]?.[lang] ?? current[lang]) : "";

  const next = () => setIndex((i) => i + 1);
  const send = () => {
    if (!current) return;
    run(() => markReminderSent({ playerId: current.playerId, message }), undefined, () => setDone((s) => new Set(s).add(current.playerId)));
    // WhatsApp opens in another app / tab; the next player is ready when the admin comes back
    setTimeout(next, 600);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setIndex(0);
        }
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-2xl tracking-wide">
            <Send className="size-5" /> Send reminders
          </DialogTitle>
          <DialogDescription>Tap Send, press send in WhatsApp, come back here: the next player is ready.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium tabular">
              {Math.min(index + 1, drafts.length)} of {drafts.length} · {done.size} sent
            </span>
            <LangSwitch value={lang} onChange={onLang} />
          </div>
          <Progress value={(Math.min(index, drafts.length) / Math.max(drafts.length, 1)) * 100} />
        </div>

        <AnimatePresence mode="wait">
          {finished ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="grid place-items-center gap-2 py-8 text-center">
              <CheckCircle2 className="size-12 text-success" />
              <p className="font-heading text-2xl font-bold">All done 🎉</p>
              <p className="text-sm text-muted-foreground">
                {done.size} reminder{done.size === 1 ? "" : "s"} sent, {drafts.length - done.size} skipped.
              </p>
              <Button onClick={onClose}>Close</Button>
            </motion.div>
          ) : (
            current && (
              <motion.div key={current.playerId} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{current.name}</span>
                  <span className="font-semibold text-destructive tabular">{rupees(current.owes)}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular">{current.phone ?? "no phone"}</span>
                </div>
                <Textarea
                  rows={10}
                  value={message}
                  onChange={(e) => setEdits({ ...edits, [current.playerId]: { ...edits[current.playerId], [lang]: e.target.value } })}
                  className="text-[14.5px] leading-relaxed"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                    <ArrowLeft /> Back
                  </Button>
                  <Button variant="outline" onClick={next}>
                    <SkipForward /> Skip
                  </Button>
                  <Button asChild className="ml-auto bg-[#25D366] text-white hover:bg-[#1ebe57]">
                    <a href={whatsappLink(current.phone, message)} target="_blank" rel="noreferrer" onClick={send}>
                      <MessageCircle /> Send on WhatsApp
                    </a>
                  </Button>
                </div>
              </motion.div>
            )
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Group summary ---------- */

function GroupSummaryCard() {
  const [text, setText] = useState<Record<Lang, string> | null>(null);
  const [lang, setLang] = useState<Lang>("ta");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const load = () =>
    start(async () => {
      const res = await groupDuesSummary();
      if (res.ok && res.data) setText(res.data);
      else if (!res.ok) toast.error(res.error);
    });
  const message = text?.[lang] ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-2xl tracking-wide">
          <Users className="size-5" /> Team group summary
        </CardTitle>
        <CardDescription>One message for the team WhatsApp group: everyone&apos;s dues, the total and the GPay number.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!text ? (
          <Button variant="outline" onClick={load} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Users />} Make group summary
          </Button>
        ) : (
          <>
            <div className="flex justify-end">
              <LangSwitch value={lang} onChange={setLang} />
            </div>
            <Textarea rows={12} value={message} onChange={(e) => setText({ ...text, [lang]: e.target.value })} className="text-[14.5px] leading-relaxed" />
            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-[#25D366] text-white hover:bg-[#1ebe57]">
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                  <MessageCircle /> Share to WhatsApp group
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard?.writeText(message).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                }
              >
                {copied ? <Check className="text-success" /> : <Copy />} Copy
              </Button>
              <Button variant="ghost" onClick={load} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Refresh
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Phone numbers ---------- */

function PhonesCard({ members }: { members: MemberPhone[] }) {
  const initial = useMemo(() => Object.fromEntries(members.map((m) => [m.playerId, m.phone ?? ""])), [members]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const { run, pending } = useAction();
  const changed = members.filter((m) => (values[m.playerId] ?? "") !== (m.phone ?? ""));
  const missing = members.filter((m) => !(values[m.playerId] ?? "").trim()).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-2xl tracking-wide">
          <Phone className="size-5" /> Phone numbers
        </CardTitle>
        <CardDescription>
          WhatsApp numbers of the squad ({members.length - missing} of {members.length} filled). Admin-only; 10-digit numbers get +91 automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => (
            <li key={m.playerId} className="flex items-center gap-2">
              <PlayerAvatar name={m.name} photo={m.photo} size="sm" />
              <Label htmlFor={`ph-${m.playerId}`} className="w-32 shrink-0 truncate font-medium">
                {m.name}
              </Label>
              <Input
                id={`ph-${m.playerId}`}
                inputMode="tel"
                placeholder="98765 43210"
                className={cn("h-9 tabular", (values[m.playerId] ?? "") !== (m.phone ?? "") && "ring-2 ring-primary/40")}
                value={values[m.playerId] ?? ""}
                onChange={(e) => setValues({ ...values, [m.playerId]: e.target.value })}
              />
            </li>
          ))}
        </ul>
        <Button disabled={pending || changed.length === 0} onClick={() => run(() => savePlayerPhones({ items: changed.map((m) => ({ playerId: m.playerId, phone: values[m.playerId] ?? "" })) }), `${changed.length} number${changed.length === 1 ? "" : "s"} saved`)}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save {changed.length || ""} change{changed.length === 1 ? "" : "s"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------- History ---------- */

function HistoryCard({ history }: { history: SentReminder[] }) {
  if (history.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl tracking-wide">Recently sent</CardTitle>
        <CardDescription>Reminders opened in WhatsApp from this page.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex items-baseline gap-3 py-2">
              <span className="w-28 shrink-0 text-muted-foreground tabular">{h.sentAt ? formatDate(h.sentAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "–"}</span>
              <span className="w-32 shrink-0 truncate font-medium">{h.name}</span>
              <span className="truncate text-muted-foreground">{h.message.split("\n").slice(1, 2).join(" ")}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
