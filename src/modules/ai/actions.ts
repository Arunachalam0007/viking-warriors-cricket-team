"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { aiContent, notificationOutbox } from "@/db/schema";
import { adminAction, type ActionResult } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/modules/audit/audit";
import { getSettings, saveSettings } from "@/modules/settings/settings";
import { generateOne, runAiJobs } from "./generate";
import { configuredProviders } from "./models";
import { draftReminders, groupSummary, type ReminderDraft } from "./reminders";
import { scanPaymentImage, type ScanResult } from "./scan";

/* Admin actions for the AI features (Admin → AI, Payments, Dues reminders). */

async function aiReady() {
  const settings = await getSettings();
  if (!settings.ai_enabled) throw new Error("AI features are switched off (Admin → AI).");
  if (configuredProviders().length === 0) throw new Error("No AI key is set (GEMINI_API_KEY or GROQ_API_KEY).");
}

const failure = (e: unknown) => {
  const msg = (e as Error).message ?? String(e);
  return /quota|rate limit|429|high demand|overloaded|No answer within/i.test(msg) ? "Both AI services are busy or out of free quota. Try again in a minute." : msg;
};

/** Payment screenshot → suggested payment (nothing is saved). */
export async function scanPaymentScreenshot(image: string): Promise<ActionResult<ScanResult>> {
  await requireAdmin();
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(image) || image.length > 6_000_000) return { ok: false, error: "Upload a PNG, JPG or WebP screenshot under 4 MB." };
  try {
    await aiReady();
    return { ok: true, data: await scanPaymentImage(getDb(), image) };
  } catch (e) {
    return { ok: false, error: failure(e) };
  }
}

export async function draftDuesReminders(input: { playerIds?: string[]; tone?: "friendly" | "firm" }): Promise<ActionResult<ReminderDraft[]>> {
  await requireAdmin();
  try {
    await aiReady();
    return { ok: true, data: await draftReminders(getDb(), input) };
  } catch (e) {
    return { ok: false, error: failure(e) };
  }
}

/** The admin opened this reminder in WhatsApp: record it as sent (for "last reminded" and history). */
export const markReminderSent = adminAction(
  z.object({ playerId: z.uuid(), message: z.string().trim().min(5).max(2000) }),
  async ({ playerId, message }, { tx, actor }) => {
    const [row] = await tx.insert(notificationOutbox).values({ playerId, message, channel: "whatsapp", status: "sent", sentAt: sql`now()` }).returning();
    await audit({ actor, action: "reminder.sent", entity: "notification", entityId: row.id, after: { playerId } }, tx);
    return row.id;
  },
  { syncSheet: false },
);

/** Who collects on GPay and their number, printed in every reminder. */
export const savePaymentContact = adminAction(
  z.object({
    gpay_name: z.string().trim().min(1, "Enter a name").max(40),
    gpay_number: z
      .string()
      .trim()
      .transform((v) => (v.startsWith("+") ? "+" : "") + v.replace(/\D/g, ""))
      .refine((v) => v === "" || /^(\+?\d{10,13})$/.test(v), "Enter a 10-digit mobile number"),
  }),
  async (values, { tx, actor }) => {
    await saveSettings(values, actor, tx);
    await audit({ actor, action: "settings.gpay", entity: "settings", after: { gpay_name: values.gpay_name } }, tx);
  },
  { syncSheet: false },
);

export async function groupDuesSummary(): Promise<ActionResult<Record<"ta" | "en", string>>> {
  await requireAdmin();
  return { ok: true, data: await groupSummary(getDb()) };
}

const kind = z.enum(["match_summary", "period_writeup", "player_insight", "sync_check"]);

export const regenerateAiText = adminAction(
  z.object({ kind, subjectId: z.string().min(1).max(100) }),
  async ({ kind: k, subjectId }, { tx, actor }) => {
    await aiReady();
    // An admin asking for a fresh text releases their own edit
    await tx.update(aiContent).set({ edited: false }).where(sql`${aiContent.kind} = ${k} and ${aiContent.subjectId} = ${subjectId}`);
    await generateOne(tx, k, subjectId).catch((e) => {
      throw new Error(failure(e));
    });
    await audit({ actor, action: "ai.text.regenerate", entity: "ai_content", entityId: `${k}:${subjectId}` }, tx);
  },
  { syncSheet: false },
);

export const editAiText = adminAction(
  z.object({ id: z.uuid(), title: z.string().trim().max(200).nullable(), body: z.string().trim().min(10).max(4000) }),
  async ({ id, title, body }, { tx, actor }) => {
    const [before] = await tx.select().from(aiContent).where(eq(aiContent.id, id));
    if (!before) throw new Error("Text not found");
    await tx.update(aiContent).set({ title, body, edited: true, updatedAt: sql`now()` }).where(eq(aiContent.id, id));
    await audit({ actor, action: "ai.text.edit", entity: "ai_content", entityId: id, before: { title: before.title, body: before.body }, after: { title, body } }, tx);
  },
  { syncSheet: false },
);

export const hideAiText = adminAction(
  z.object({ id: z.uuid(), hidden: z.boolean() }),
  async ({ id, hidden }, { tx, actor }) => {
    await tx.update(aiContent).set({ hidden, updatedAt: sql`now()` }).where(eq(aiContent.id, id));
    await audit({ actor, action: hidden ? "ai.text.hide" : "ai.text.show", entity: "ai_content", entityId: id }, tx);
  },
  { syncSheet: false },
);

export const saveAiSettings = adminAction(
  z.object({
    ai_enabled: z.boolean(),
    ai_public_chat: z.boolean(),
    ai_primary_provider: z.enum(["gemini", "groq"]),
  }),
  async (values, { tx, actor }) => {
    await saveSettings(values, actor, tx);
    await audit({ actor, action: "settings.ai", entity: "settings", after: values }, tx);
  },
  { syncSheet: false },
);

/** "Update AI texts now": a short run that fits the server's time limit. */
export const runAiJobsNow = adminAction(
  z.object({}),
  async (_input, { actor }) => {
    await aiReady();
    const result = await runAiJobs(getDb(), { maxCalls: 8, deadlineMs: 45_000 });
    await audit({ actor, action: "ai.jobs.run", entity: "ai_content", after: result });
    return result;
  },
  { syncSheet: false },
);
