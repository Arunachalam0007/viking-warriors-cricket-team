"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { matchPlayers, players } from "@/db/schema";
import { adminAction, type ActionResult } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/modules/audit/audit";
import { reconcileMatchCharges } from "@/modules/finance/ledger";
import { getDb } from "@/db";
import { refresh } from "next/cache";

const PHOTO_BUCKET = "player-photos";

export const updatePlayer = adminAction(
  z.object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(80),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^[+\d\s-]*$/, "Phone can only contain digits, spaces, + and -")
      .optional()
      .nullable()
      .transform((v) => v || null),
    isMember: z.boolean(),
    isActive: z.boolean(),
    notes: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
  }),
  async ({ id, ...values }, { tx, actor }) => {
    const [before] = await tx.select().from(players).where(eq(players.id, id));
    if (!before) throw new Error("Player not found");
    const nameChanged = values.name !== before.name;
    const [after] = await tx
      .update(players)
      .set({ ...values, nameLocked: before.nameLocked || nameChanged, updatedAt: sql`now()` })
      .where(eq(players.id, id))
      .returning();

    // Member ↔ guest changes who is charged in every match they played
    if (before.isMember !== values.isMember) {
      const games = await tx.select({ matchId: matchPlayers.matchId }).from(matchPlayers).where(eq(matchPlayers.playerId, id));
      for (const g of games) await reconcileMatchCharges(tx, g.matchId);
    }
    await audit(
      {
        actor,
        action: "player.update",
        entity: "player",
        entityId: id,
        before: { name: before.name, phone: before.phone, isMember: before.isMember, isActive: before.isActive },
        after: { name: after.name, phone: after.phone, isMember: after.isMember, isActive: after.isActive },
      },
      tx,
    );
  },
);

/** Players not on CricHeroes (or not yet synced) can be added by hand. */
export const createPlayer = adminAction(
  z.object({ name: z.string().trim().min(1).max(80), isMember: z.boolean().default(true), phone: z.string().trim().max(20).optional() }),
  async (input, { tx, actor }) => {
    const [p] = await tx
      .insert(players)
      .values({ name: input.name, isMember: input.isMember, phone: input.phone || null, nameLocked: true })
      .returning();
    await audit({ actor, action: "player.create", entity: "player", entityId: p.id, after: p }, tx);
    return p.id;
  },
);

/** Upload a custom photo (overrides the CricHeroes photo). FormData: playerId, file */
export async function uploadPlayerPhoto(form: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const playerId = z.uuid().safeParse(form.get("playerId"));
  const file = form.get("file");
  if (!playerId.success || !(file instanceof File)) return { ok: false, error: "Choose a photo to upload" };
  if (!file.type.startsWith("image/")) return { ok: false, error: "The file must be an image (JPG, PNG or WebP)" };
  if (file.size > 3 * 1024 * 1024) return { ok: false, error: "Photo must be smaller than 3 MB" };

  try {
    const storage = createSupabaseAdminClient().storage;
    const { data: buckets } = await storage.listBuckets();
    if (!buckets?.some((b) => b.name === PHOTO_BUCKET)) {
      await storage.createBucket(PHOTO_BUCKET, { public: true, fileSizeLimit: 3 * 1024 * 1024 });
    }
    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const path = `${playerId.data}/${Date.now()}.${ext}`;
    const { error } = await storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: true });
    if (error) return { ok: false, error: error.message };
    const url = storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;

    await getDb().update(players).set({ photoUrl: url, updatedAt: sql`now()` }).where(eq(players.id, playerId.data));
    await audit({ actor, action: "player.photo", entity: "player", entityId: playerId.data, after: { photoUrl: url } });
    refresh();
    return { ok: true, data: url };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Go back to the CricHeroes photo */
export const resetPlayerPhoto = adminAction(
  z.object({ id: z.uuid() }),
  async ({ id }, { tx, actor }) => {
    await tx.update(players).set({ photoUrl: null, updatedAt: sql`now()` }).where(eq(players.id, id));
    await audit({ actor, action: "player.photo.reset", entity: "player", entityId: id }, tx);
  },
  { syncSheet: false },
);
