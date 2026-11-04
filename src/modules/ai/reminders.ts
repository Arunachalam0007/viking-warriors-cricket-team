import "server-only";
import { generateText, Output } from "ai";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { notificationOutbox, players } from "@/db/schema";
import { formatDate, todayIst } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { getChargeRows, getPlayerBalances } from "@/modules/finance/queries";
import { getSettings, type Settings } from "@/modules/settings/settings";
import { aiModel, FAST_OPTIONS } from "./models";
import { houseRules, TEAM_NAME_TA } from "./prompts";

/*
 * WhatsApp dues reminders, sent by an admin one tap at a time (nothing is sent automatically).
 * The AI writes only the friendly opening line; the amount, the unpaid matches and the GPay
 * number are filled in here from the ledger and settings, so they are always exact.
 * A reminder the admin opened in WhatsApp is recorded in notification_outbox (status "sent").
 */

export type ReminderLang = "ta" | "en";
export type ReminderDraft = {
  playerId: string;
  name: string;
  phone: string | null;
  owes: number;
  matches: string[];
  lastRemindedAt: string | null;
  ta: string;
  en: string;
};

const MAX_LINES = 8;

/** "98765 43210" → "9876543210"; keeps a leading + for numbers outside India. */
export function cleanPhone(phone: string) {
  const t = phone.trim();
  return (t.startsWith("+") ? "+" : "") + t.replace(/\D/g, "");
}

/** The number wa.me needs: country code, digits only (Indian 10-digit numbers get 91). */
export function whatsappNumber(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d;
}

/** "9876543210" → "98765 43210" for reading */
function prettyPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  const last10 = d.slice(-10);
  return d.length >= 10 ? `${last10.slice(0, 5)} ${last10.slice(5)}` : phone;
}

type PayContact = Pick<Settings, "gpay_name" | "gpay_number" | "upi_id">;

function payLines(settings: PayContact, lang: ReminderLang) {
  const name = settings.gpay_name || (lang === "ta" ? "அணியின் admin" : "the team admin");
  const number = settings.gpay_number ? `*${prettyPhone(settings.gpay_number)}*` : null;
  const lines = [
    number
      ? lang === "ta"
        ? `💵 ${name}-இடம் cash அல்லது GPay: ${number}`
        : `💵 Pay ${name} by cash or GPay: ${number}`
      : lang === "ta"
        ? `💵 ${name}-இடம் cash அல்லது UPI-ல் கொடுங்க`
        : `💵 Pay ${name} by cash or UPI`,
  ];
  if (settings.upi_id) lines.push(`🏦 *UPI:* ${settings.upi_id}`);
  return lines;
}

/**
 * Who to pay and their number: the GPay number from the reminders page, or else the mobile
 * number saved on that person's player record (e.g. "Ragul" → player "Ragul RD").
 */
export async function payContact(db: Executor, settings: Settings): Promise<PayContact> {
  if (settings.gpay_number || !settings.gpay_name.trim()) return settings;
  const squad = await db.select({ name: players.name, phone: players.phone }).from(players);
  const person = squad.find((p) => p.phone && p.name.toLowerCase().startsWith(settings.gpay_name.trim().toLowerCase()));
  return { ...settings, gpay_number: person?.phone ?? "" };
}

/** The full WhatsApp message for one player (WhatsApp shows *text* in bold). */
export function composeReminder(o: {
  name: string;
  owes: number;
  unpaid: string[];
  opening: string;
  lang: ReminderLang;
  teamName: string;
  settings: PayContact;
}) {
  const first = o.name.split(/\s+/)[0];
  const shown = o.unpaid.slice(0, MAX_LINES);
  const more = o.unpaid.length - shown.length;
  const ta = o.lang === "ta";
  return [
    ta ? `வணக்கம் *${first}*! 🏏` : `Hi *${first}*! 🏏`,
    o.opening.trim(),
    "",
    ta ? `*Match fee பாக்கி: ${rupees(o.owes)}*` : `*Match fees due: ${rupees(o.owes)}*`,
    ...shown.map((l) => `• ${l}`),
    ...(more > 0 ? [ta ? `• மேலும் ${more} match` : `• and ${more} more`] : []),
    "",
    ...payLines(o.settings, o.lang),
    ta ? "Pay பண்ணிட்டு screenshot அனுப்புங்க. நன்றி! 🙏" : "Please share the screenshot after paying. Thank you! 🙏",
    `— ${ta ? TEAM_NAME_TA : o.teamName}`,
  ].join("\n");
}

const FALLBACK_OPENING: Record<"friendly" | "firm", Record<ReminderLang, string>> = {
  friendly: { ta: "உங்கள் match fee பாக்கி பற்றிய சின்ன நினைவூட்டல்.", en: "A quick, friendly reminder about your match fees." },
  firm: { ta: "இந்த வாரத்துக்குள் match fee பாக்கியை கட்டிவிடுங்க.", en: "Please clear your pending match fees this week." },
};

/** When each player was last reminded (from reminders the admin sent). */
export async function lastReminded(db: Executor) {
  const rows = await db
    .select({ playerId: notificationOutbox.playerId, sentAt: notificationOutbox.sentAt })
    .from(notificationOutbox)
    .where(and(eq(notificationOutbox.status, "sent"), isNotNull(notificationOutbox.sentAt)))
    .orderBy(desc(notificationOutbox.sentAt));
  const map = new Map<string, Date>();
  for (const r of rows) if (r.playerId && r.sentAt && !map.has(r.playerId)) map.set(r.playerId, r.sentAt);
  return map;
}

export async function recentReminders(db: Executor, limit = 30) {
  return db
    .select({ id: notificationOutbox.id, sentAt: notificationOutbox.sentAt, message: notificationOutbox.message, name: players.name })
    .from(notificationOutbox)
    .innerJoin(players, eq(players.id, notificationOutbox.playerId))
    .where(eq(notificationOutbox.status, "sent"))
    .orderBy(desc(notificationOutbox.sentAt))
    .limit(limit);
}

/** True when members owe money and no reminder went out in the last 7 days (admin overview nudge). */
export async function remindersDue(db: Executor) {
  const owing = (await getPlayerBalances(db)).filter((b) => b.isMember && b.balance > 0).length;
  if (owing === 0) return { owing, due: false };
  const [recent] = await db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(and(eq(notificationOutbox.status, "sent"), gte(notificationOutbox.sentAt, new Date(Date.now() - 7 * 86_400_000))))
    .limit(1);
  return { owing, due: !recent };
}

async function owingWithFacts(db: Executor, playerIds?: string[]) {
  const [balances, phones, reminded, due] = await Promise.all([
    getPlayerBalances(db),
    db.select({ id: players.id, phone: players.phone }).from(players),
    lastReminded(db),
    getChargeRows(db, { status: "due" }),
  ]);
  return balances
    .filter((b) => b.isMember && b.balance > 0 && (!playerIds || playerIds.includes(b.playerId)))
    .sort((a, b) => b.balance - a.balance)
    .map((b) => ({
      playerId: b.playerId,
      name: b.name,
      owes: b.balance,
      phone: phones.find((p) => p.id === b.playerId)?.phone ?? null,
      lastRemindedAt: reminded.get(b.playerId)?.toISOString() ?? null,
      unpaid: due
        .filter((c) => c.playerId === b.playerId)
        .sort((x, y) => x.chargeDate.localeCompare(y.chargeDate))
        .map((c) => `${formatDate(c.chargeDate, { day: "numeric", month: "short" })} ${c.opponent ? `vs ${c.opponent}` : c.description} – ${rupees(c.due)}`),
    }));
}

export async function draftReminders(db: Executor, opts: { playerIds?: string[]; tone?: "friendly" | "firm" } = {}): Promise<ReminderDraft[]> {
  const settings = await getSettings(db);
  const contact = await payContact(db, settings);
  const tone = opts.tone ?? "friendly";
  const owing = (await owingWithFacts(db, opts.playerIds)).slice(0, 30);
  if (owing.length === 0) return [];

  // The AI only writes a short personal opening per player; if it is unavailable, a fixed one is used
  let openings: { playerId: string; ta: string; en: string }[] = [];
  try {
    const { output } = await generateText({
      model: await aiModel("reminder"),
      system: houseRules(settings.team_name),
      prompt: [
        `For each player, write ONE short opening sentence (max 18 words) for a WhatsApp match-fee reminder from ${settings.team_name}, in Tamil and in English.`,
        tone === "firm" ? "Tone: polite but clear it should be paid this week." : "Tone: warm, like a teammate; no pressure, no guilt.",
        "Do NOT greet and do NOT use the player's name (the greeting with the name is added before your sentence). Do NOT mention amounts, dates, matches or payment details (added after it). You may mention how many matches are unpaid.",
        `Tamil: simple spoken Tamil, team name ${TEAM_NAME_TA}. English: team name "${settings.team_name}".`,
        `Players (JSON): ${JSON.stringify(owing.map((o) => ({ playerId: o.playerId, firstName: o.name.split(/\s+/)[0], unpaidMatches: o.unpaid.length })))}`,
      ].join("\n"),
      output: Output.object({ schema: z.object({ openings: z.array(z.object({ playerId: z.string(), ta: z.string(), en: z.string() })) }) }),
      providerOptions: FAST_OPTIONS,
      maxRetries: 0,
    });
    openings = output.openings;
  } catch {
    openings = [];
  }

  return owing.map((o) => {
    const ai = openings.find((x) => x.playerId === o.playerId);
    const opening = (lang: ReminderLang) => (ai?.[lang]?.trim() && !/₹|\d{3,}/.test(ai[lang]) ? ai[lang].trim() : FALLBACK_OPENING[tone][lang]);
    const compose = (lang: ReminderLang) => composeReminder({ name: o.name, owes: o.owes, unpaid: o.unpaid, opening: opening(lang), lang, teamName: settings.team_name, settings: contact });
    return { playerId: o.playerId, name: o.name, phone: o.phone, owes: o.owes, matches: o.unpaid, lastRemindedAt: o.lastRemindedAt, ta: compose("ta"), en: compose("en") };
  });
}

/** One message for the team group: everyone's dues, the total and how to pay. */
export async function groupSummary(db: Executor): Promise<Record<ReminderLang, string>> {
  const settings = await getSettings(db);
  const contact = await payContact(db, settings);
  const owing = await owingWithFacts(db);
  const total = owing.reduce((s, o) => s + o.owes, 0);
  const date = formatDate(todayIst(), { day: "numeric", month: "short" });
  const build = (lang: ReminderLang) => {
    const ta = lang === "ta";
    return [
      ta ? `*${TEAM_NAME_TA} – Match fee பாக்கி (${date})* 🏏` : `*${settings.team_name} – Match fees due (${date})* 🏏`,
      "",
      ...owing.map((o, i) => `${i + 1}. ${o.name} – ${rupees(o.owes)}`),
      "",
      ta ? `*மொத்தம்: ${rupees(total)}*` : `*Total: ${rupees(total)}*`,
      ...payLines(contact, lang),
      ta ? "Pay பண்ணிட்டு screenshot அனுப்புங்க. நன்றி! 🙏" : "Please pay and share the screenshot. Thank you! 🙏",
    ].join("\n");
  };
  return owing.length ? { ta: build("ta"), en: build("en") } : { ta: "எல்லோரும் கட்டிவிட்டார்கள்! 🎉", en: "Everyone is paid up! 🎉" };
}
