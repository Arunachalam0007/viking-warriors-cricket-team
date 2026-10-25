"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { cashHolders, charges, collections, expenses, income, matches, matchPlayers } from "@/db/schema";
import { adminAction, isoDate, paymentMode, positiveRupees, rupeeAmount } from "@/lib/action";
import { audit } from "@/modules/audit/audit";
import {
  applyCredit,
  deletePayment,
  markChargePaid,
  markChargeUnpaid,
  reconcileMatchCharges,
  recordPayment,
  setChargeAmount,
  setChargeWaived,
} from "./ledger";

const id = z.uuid();
const optionalText = z.string().trim().max(500).optional().nullable().transform((v) => v || null);
const paymentMeta = {
  mode: paymentMode.default("upi"),
  holderId: z.uuid().optional().nullable(),
  paidOn: isoDate.optional(),
  reference: optionalText,
};

/* ---------- Match-level ---------- */

export const updateMatchFinance = adminAction(
  z.object({
    matchId: id,
    chargeable: z.boolean(),
    feePerPlayer: rupeeAmount,
    kind: z.enum(["individual", "tournament"]),
    notes: optionalText,
  }),
  async (input, { tx, actor }) => {
    const [before] = await tx.select().from(matches).where(eq(matches.id, input.matchId));
    if (!before) throw new Error("Match not found");
    const [after] = await tx
      .update(matches)
      .set({
        chargeable: input.chargeable,
        feePerPlayer: input.feePerPlayer,
        kind: input.kind,
        notes: input.notes,
        financeLocked: true,
        updatedAt: sql`now()`,
      })
      .where(eq(matches.id, input.matchId))
      .returning();
    const result = await reconcileMatchCharges(tx, input.matchId);
    await audit(
      {
        actor,
        action: "match.finance.update",
        entity: "match",
        entityId: input.matchId,
        before: { chargeable: before.chargeable, feePerPlayer: before.feePerPlayer, kind: before.kind },
        after: { chargeable: after.chargeable, feePerPlayer: after.feePerPlayer, kind: after.kind, ...result },
      },
      tx,
    );
    return result;
  },
);

/** Mark a player as played / not played in a match (also adds players CricHeroes missed). */
export const setMatchPlayer = adminAction(
  z.object({ matchId: id, playerId: id, played: z.boolean() }),
  async ({ matchId, playerId, played }, { tx, actor }) => {
    const [existing] = await tx
      .select()
      .from(matchPlayers)
      .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, playerId)));
    if (existing) {
      await tx
        .update(matchPlayers)
        .set({ played, adminLocked: true })
        .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, playerId)));
    } else {
      await tx.insert(matchPlayers).values({ matchId, playerId, played, source: "admin", adminLocked: true });
    }
    const result = await reconcileMatchCharges(tx, matchId);
    await audit({ actor, action: played ? "match.player.played" : "match.player.not_played", entity: "match", entityId: matchId, after: { playerId, ...result } }, tx);
    return result;
  },
);

export const markAllPaidForMatch = adminAction(
  z.object({ matchId: id, ...paymentMeta }),
  async ({ matchId, ...meta }, { tx, actor }) => {
    const rows = await tx
      .select({ id: charges.id, waived: charges.waived })
      .from(charges)
      .where(and(eq(charges.matchId, matchId), eq(charges.kind, "match_fee")));
    let count = 0;
    for (const r of rows) {
      if (r.waived) continue;
      if (await markChargePaid(tx, r.id, { ...meta, actor })) count++;
    }
    await audit({ actor, action: "match.mark_all_paid", entity: "match", entityId: matchId, after: { count, ...meta } }, tx);
    return { count };
  },
);

/* ---------- Charge-level ---------- */

export const markPaid = adminAction(
  z.object({ chargeId: id, ...paymentMeta }),
  async ({ chargeId, ...meta }, { tx, actor }) => {
    const payment = await markChargePaid(tx, chargeId, { ...meta, actor });
    await audit({ actor, action: "charge.mark_paid", entity: "charge", entityId: chargeId, after: payment }, tx);
    return payment?.id ?? null;
  },
);

export const markUnpaid = adminAction(z.object({ chargeId: id }), async ({ chargeId }, { tx, actor }) => {
  await markChargeUnpaid(tx, chargeId);
  await audit({ actor, action: "charge.mark_unpaid", entity: "charge", entityId: chargeId }, tx);
});

export const updateChargeAmount = adminAction(
  z.object({ chargeId: id, amount: rupeeAmount }),
  async ({ chargeId, amount }, { tx, actor }) => {
    const [before] = await tx.select().from(charges).where(eq(charges.id, chargeId));
    const after = await setChargeAmount(tx, chargeId, amount);
    await audit({ actor, action: "charge.amount", entity: "charge", entityId: chargeId, before: { amount: before?.amount }, after: { amount: after.amount } }, tx);
  },
);

export const waiveCharge = adminAction(
  z.object({ chargeId: id, waived: z.boolean() }),
  async ({ chargeId, waived }, { tx, actor }) => {
    await setChargeWaived(tx, chargeId, waived);
    await audit({ actor, action: waived ? "charge.waive" : "charge.unwaive", entity: "charge", entityId: chargeId }, tx);
  },
);

/** One-off charge or credit for a player, e.g. an opening balance carried over from the old sheet. */
export const addAdjustment = adminAction(
  z.object({ playerId: id, amount: positiveRupees, description: z.string().trim().min(2).max(200), date: isoDate }),
  async (input, { tx, actor }) => {
    const [c] = await tx
      .insert(charges)
      .values({ playerId: input.playerId, kind: "adjustment", chargeDate: input.date, description: input.description, amount: input.amount, adminLocked: true })
      .returning();
    await applyCredit(tx, input.playerId);
    await audit({ actor, action: "charge.adjustment", entity: "charge", entityId: c.id, after: c }, tx);
    return c.id;
  },
);

export const deleteCharge = adminAction(z.object({ chargeId: id }), async ({ chargeId }, { tx, actor }) => {
  const [c] = await tx.select().from(charges).where(eq(charges.id, chargeId));
  if (!c) throw new Error("Charge not found");
  if (c.kind === "match_fee") throw new Error("Match fees are removed by marking the player as not played");
  await tx.delete(charges).where(eq(charges.id, chargeId));
  await applyCredit(tx, c.playerId);
  await audit({ actor, action: "charge.delete", entity: "charge", entityId: chargeId, before: c }, tx);
});

/* ---------- Payments ---------- */

export const recordPaymentAction = adminAction(
  z.object({ playerId: id, amount: positiveRupees, note: optionalText, ...paymentMeta }),
  async ({ playerId, amount, ...meta }, { tx, actor }) => {
    const p = await recordPayment(tx, playerId, amount, { ...meta, actor });
    await audit({ actor, action: "payment.record", entity: "payment", entityId: p.id, after: p }, tx);
    return p.id;
  },
);

export const deletePaymentAction = adminAction(z.object({ paymentId: id }), async ({ paymentId }, { tx, actor }) => {
  const p = await deletePayment(tx, paymentId);
  if (!p) throw new Error("Payment not found");
  await audit({ actor, action: "payment.delete", entity: "payment", entityId: paymentId, before: p }, tx);
});

/* ---------- Collections (tournament / monthly / special) ---------- */

export const createCollection = adminAction(
  z.object({
    kind: z.enum(["tournament", "monthly", "special", "other"]),
    title: z.string().trim().min(2).max(120),
    description: optionalText,
    dueOn: isoDate,
    defaultAmount: positiveRupees,
    playerIds: z.array(id).min(1, "Pick at least one player"),
  }),
  async (input, { tx, actor }) => {
    const [c] = await tx
      .insert(collections)
      .values({ kind: input.kind, title: input.title, description: input.description, dueOn: input.dueOn, defaultAmount: input.defaultAmount, createdBy: actor })
      .returning();
    for (const playerId of input.playerIds) {
      await tx.insert(charges).values({
        playerId,
        kind: "collection",
        collectionId: c.id,
        chargeDate: input.dueOn,
        description: input.title,
        amount: input.defaultAmount,
        adminLocked: true,
      });
      await applyCredit(tx, playerId);
    }
    await audit({ actor, action: "collection.create", entity: "collection", entityId: c.id, after: { ...c, players: input.playerIds.length } }, tx);
    return c.id;
  },
);

export const setCollectionPlayers = adminAction(
  z.object({ collectionId: id, playerIds: z.array(id) }),
  async ({ collectionId, playerIds }, { tx, actor }) => {
    const [c] = await tx.select().from(collections).where(eq(collections.id, collectionId));
    if (!c) throw new Error("Collection not found");
    const existing = await tx.select().from(charges).where(eq(charges.collectionId, collectionId));
    const want = new Set(playerIds);
    for (const ch of existing) {
      if (!want.has(ch.playerId)) {
        await tx.delete(charges).where(eq(charges.id, ch.id));
        await applyCredit(tx, ch.playerId);
      }
      want.delete(ch.playerId);
    }
    for (const playerId of want) {
      await tx.insert(charges).values({ playerId, kind: "collection", collectionId, chargeDate: c.dueOn, description: c.title, amount: c.defaultAmount, adminLocked: true });
      await applyCredit(tx, playerId);
    }
    await audit({ actor, action: "collection.players", entity: "collection", entityId: collectionId, after: { players: playerIds.length } }, tx);
  },
);

export const deleteCollection = adminAction(z.object({ collectionId: id }), async ({ collectionId }, { tx, actor }) => {
  const affected = await tx.select({ playerId: charges.playerId }).from(charges).where(eq(charges.collectionId, collectionId));
  const [c] = await tx.delete(collections).where(eq(collections.id, collectionId)).returning();
  for (const a of affected) await applyCredit(tx, a.playerId);
  await audit({ actor, action: "collection.delete", entity: "collection", entityId: collectionId, before: c }, tx);
});

/* ---------- Expenses & income ---------- */

export const saveExpense = adminAction(
  z.object({
    id: id.optional(),
    spentOn: isoDate,
    category: z.enum(["balls", "ground", "equipment", "tournament_fee", "food", "jersey", "other"]),
    description: z.string().trim().min(2).max(200),
    amount: positiveRupees,
    holderId: z.uuid().optional().nullable(),
    paidBy: optionalText,
    mode: paymentMode.default("upi"),
  }),
  async ({ id: expenseId, ...values }, { tx, actor }) => {
    if (expenseId) {
      const [after] = await tx.update(expenses).set(values).where(eq(expenses.id, expenseId)).returning();
      await audit({ actor, action: "expense.update", entity: "expense", entityId: expenseId, after }, tx);
      return expenseId;
    }
    const [e] = await tx.insert(expenses).values({ ...values, createdBy: actor }).returning();
    await audit({ actor, action: "expense.create", entity: "expense", entityId: e.id, after: e }, tx);
    return e.id;
  },
);

export const deleteExpense = adminAction(z.object({ id }), async ({ id: expenseId }, { tx, actor }) => {
  const [e] = await tx.delete(expenses).where(eq(expenses.id, expenseId)).returning();
  await audit({ actor, action: "expense.delete", entity: "expense", entityId: expenseId, before: e }, tx);
});

export const saveIncome = adminAction(
  z.object({
    id: id.optional(),
    receivedOn: isoDate,
    category: z.enum(["sponsorship", "ball_sale", "prize_money", "other"]),
    description: z.string().trim().min(2).max(200),
    amount: positiveRupees,
    holderId: z.uuid().optional().nullable(),
    mode: paymentMode.default("upi"),
  }),
  async ({ id: incomeId, ...values }, { tx, actor }) => {
    if (incomeId) {
      const [after] = await tx.update(income).set(values).where(eq(income.id, incomeId)).returning();
      await audit({ actor, action: "income.update", entity: "income", entityId: incomeId, after }, tx);
      return incomeId;
    }
    const [row] = await tx.insert(income).values({ ...values, createdBy: actor }).returning();
    await audit({ actor, action: "income.create", entity: "income", entityId: row.id, after: row }, tx);
    return row.id;
  },
);

export const deleteIncome = adminAction(z.object({ id }), async ({ id: incomeId }, { tx, actor }) => {
  const [row] = await tx.delete(income).where(eq(income.id, incomeId)).returning();
  await audit({ actor, action: "income.delete", entity: "income", entityId: incomeId, before: row }, tx);
});

/* ---------- Cash holders ---------- */

export const saveCashHolder = adminAction(
  z.object({ id: id.optional(), name: z.string().trim().min(2).max(60), isDefault: z.boolean().default(false), isActive: z.boolean().default(true) }),
  async ({ id: holderId, ...values }, { tx, actor }) => {
    if (values.isDefault) await tx.update(cashHolders).set({ isDefault: false });
    if (holderId) {
      await tx.update(cashHolders).set(values).where(eq(cashHolders.id, holderId));
    } else {
      const [h] = await tx.insert(cashHolders).values(values).returning();
      holderId = h.id;
    }
    await audit({ actor, action: "cash_holder.save", entity: "cash_holder", entityId: holderId, after: values }, tx);
    return holderId;
  },
);
