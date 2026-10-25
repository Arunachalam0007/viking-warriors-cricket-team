import "server-only";
import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb, type Tx } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { syncSheet } from "@/modules/sheets/sheets";

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/**
 * Wraps every admin mutation:
 *  1. checks the caller is an admin
 *  2. validates input with zod
 *  3. runs the work in one database transaction
 *  4. refreshes the page and mirrors the change to Google Sheets after the response
 */
export function adminAction<S extends z.ZodType, T>(
  schema: S,
  run: (input: z.infer<S>, ctx: { tx: Tx; actor: string }) => Promise<T>,
  opts: { syncSheet?: boolean } = { syncSheet: true },
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    const actor = await requireAdmin();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
    try {
      const data = await getDb().transaction((tx) => run(parsed.data, { tx, actor }));
      if (opts.syncSheet !== false) after(() => syncSheet("change").catch(() => undefined));
      refresh();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };
}

export const rupeeAmount = z.coerce.number().int("Use whole rupees").min(0, "Amount cannot be negative").max(1_000_000);
export const positiveRupees = z.coerce.number().int("Use whole rupees").min(1, "Amount must be at least ₹1").max(1_000_000);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-25");
export const paymentMode = z.enum(["cash", "upi", "bank", "other"]);
