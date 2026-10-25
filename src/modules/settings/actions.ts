"use server";

import { eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { admins } from "@/db/schema";
import { adminAction, isoDate, rupeeAmount, type ActionResult } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/modules/audit/audit";
import { resolveTeamUrl } from "@/modules/cricheroes/client";
import { syncSheet } from "@/modules/sheets/sheets";
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

export const addAdmin = adminAction(
  z.object({ email: z.email().transform((e) => e.toLowerCase()) }),
  async ({ email }, { tx, actor }) => {
    await tx.insert(admins).values({ email, addedBy: actor }).onConflictDoNothing();
    await audit({ actor, action: "admin.add", entity: "admin", entityId: email }, tx);
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
  },
  { syncSheet: false },
);

/** "Sync now" button: pulls CricHeroes, then rewrites the Google Sheet. */
export async function runSyncNow(): Promise<ActionResult<{ summary: unknown; sheets: unknown }>> {
  const actor = await requireAdmin();
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
