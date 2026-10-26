"use server";

import { eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { admins } from "@/db/schema";
import { adminAction, isoDate, rupeeAmount, type ActionResult } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/modules/audit/audit";
import { deleteLogin, passwordSchema, setLoginPassword } from "@/modules/auth/accounts";
import { resolveTeamUrl } from "@/modules/cricheroes/client";
import { syncSheet } from "@/modules/sheets/sheets";
import { requestCricheroesSync, syncViaAgent } from "@/modules/sync/queue";
import { runCricheroesSync } from "@/modules/sync/sync";
import { getSettings, saveSettings, sheetIdFromUrl } from "./settings";

export const saveSettingsAction = adminAction(
  z.object({
    team_name: z.string().trim().min(2).max(60),
    cricheroes_team_url: z.string().trim().min(1, "Paste the CricHeroes team link").max(300),
    match_fee: rupeeAmount,
    finance_start_date: isoDate,
    sync_start_date: isoDate,
    google_sheet_url: z
      .string()
      .trim()
      .refine((v) => v === "" || sheetIdFromUrl(v) !== null, "Paste the full Google Sheets link"),
    public_show_balances: z.boolean(),
    upi_id: z.string().trim().max(80),
  }),
  async (values, { tx, actor }) => {
    const before = await getSettings(tx);
    // Share links are resolved now, so the nightly sync always has a plain team page link.
    const team = await resolveTeamUrl(values.cricheroes_team_url);
    const after = { ...values, cricheroes_team_url: team.url, team_id: team.teamId };
    await saveSettings(after, actor, tx);
    await audit({ actor, action: "settings.update", entity: "settings", before, after }, tx);
  },
);

/** Adds an admin with a starting password (they can change it in My account). */
export const addAdmin = adminAction(
  z.object({ email: z.email().transform((e) => e.toLowerCase()), password: passwordSchema }),
  async ({ email, password }, { tx, actor }) => {
    await tx.insert(admins).values({ email, addedBy: actor }).onConflictDoNothing();
    await audit({ actor, action: "admin.add", entity: "admin", entityId: email }, tx);
    // Last, so a failure here rolls the admin row back
    await setLoginPassword(email, password);
  },
  { syncSheet: false },
);

/** Sets a new password for another admin, e.g. when they forgot theirs. */
export const setAdminPassword = adminAction(
  z.object({ email: z.email().transform((e) => e.toLowerCase()), password: passwordSchema }),
  async ({ email, password }, { tx, actor }) => {
    const [row] = await tx.select().from(admins).where(eq(admins.email, email));
    if (!row) throw new Error("That email is not an admin");
    await audit({ actor, action: "admin.password_reset", entity: "admin", entityId: email }, tx);
    await setLoginPassword(email, password);
  },
  { syncSheet: false },
);

export const removeAdmin = adminAction(
  z.object({ email: z.email() }),
  async ({ email }, { tx, actor }) => {
    if (email.toLowerCase() === actor) throw new Error("You cannot remove yourself");
    const [{ n }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(admins);
    if (n <= 1) throw new Error("At least one admin is required");
    await tx.delete(admins).where(eq(admins.email, email.toLowerCase()));
    await audit({ actor, action: "admin.remove", entity: "admin", entityId: email }, tx);
    await deleteLogin(email);
  },
  { syncSheet: false },
);

/**
 * "Sync now" button: pulls CricHeroes, then rewrites the Google Sheet. On Vercel CricHeroes refuses
 * the server, so the request is queued for the sync helper on the team's Mac instead (queue.ts).
 */
export async function runSyncNow(): Promise<ActionResult<{ summary: unknown; sheets: unknown } | { queued: true; alreadyQueued: boolean }>> {
  const actor = await requireAdmin();
  if (syncViaAgent()) {
    const { runId, alreadyQueued } = await requestCricheroesSync();
    if (!alreadyQueued) await audit({ actor, action: "sync.request", entity: "sync", entityId: String(runId) });
    refresh();
    return { ok: true, data: { queued: true, alreadyQueued } };
  }
  try {
    const { summary } = await runCricheroesSync("manual");
    const sheets = await syncSheet("manual");
    await audit({ actor, action: "sync.manual", entity: "sync", after: { summary, sheets } });
    refresh();
    return { ok: true, data: { summary, sheets } };
  } catch (e) {
    refresh();
    return { ok: false, error: (e as Error).message };
  }
}

export async function syncSheetNow(): Promise<ActionResult<unknown>> {
  await requireAdmin();
  const result = await syncSheet("manual");
  refresh();
  if (result.status === "success") return { ok: true, data: result };
  return { ok: false, error: result.reason ?? "Sheet sync did not run" };
}
