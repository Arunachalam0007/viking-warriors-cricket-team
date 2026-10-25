import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { charges, matches, matchPlayers, paymentAllocations, payments, players } from "@/db/schema";
import { istDate, todayIst } from "@/lib/dates";

/*
 * Ledger rules
 * - A charge is something a player owes. A payment is money received.
 * - payment_allocations link payments to the charges they settle.
 * - Player balance = Σ non-waived charges − Σ payments. Unallocated payment
 *   money is credit and is applied automatically to the oldest open charges.
 */

// Explicitly qualified: drizzle renders bare column names in single-table selects.
const chargeAllocatedSql = sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.charge_id = "charges"."id"), 0)`.mapWith(Number);

/** Creates / updates / removes the ₹ match-fee charges of one match so they match who played. */
export async function reconcileMatchCharges(db: Executor, matchId: string) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) return { created: 0, updated: 0, removed: 0, kept: 0 };

  const roster = await db
    .select({ playerId: matchPlayers.playerId, played: matchPlayers.played, isMember: players.isMember })
    .from(matchPlayers)
    .innerJoin(players, eq(players.id, matchPlayers.playerId))
    .where(eq(matchPlayers.matchId, matchId));

  const shouldCharge = new Set(
    match.chargeable ? roster.filter((r) => r.played && r.isMember).map((r) => r.playerId) : [],
  );

  const existing = await db
    .select({
      id: charges.id,
      playerId: charges.playerId,
      adminLocked: charges.adminLocked,
      allocated: chargeAllocatedSql,
    })
    .from(charges)
    .where(and(eq(charges.matchId, matchId), eq(charges.kind, "match_fee")));

  const chargeDate = istDate(match.startTime);
  const description = `Match fee vs ${match.opponentName}`;
  const result = { created: 0, updated: 0, removed: 0, kept: 0 };
  const touchedPlayers = new Set<string>();

  for (const c of existing) {
    if (shouldCharge.has(c.playerId)) {
      if (!c.adminLocked) {
        await db
          .update(charges)
          .set({ amount: match.feePerPlayer, chargeDate, description, updatedAt: sql`now()` })
          .where(eq(charges.id, c.id));
        result.updated++;
        touchedPlayers.add(c.playerId);
      }
      shouldCharge.delete(c.playerId);
    } else if (c.adminLocked || c.allocated > 0) {
      // Paid or admin-edited charges are never deleted automatically
      result.kept++;
    } else {
      await db.delete(charges).where(eq(charges.id, c.id));
      result.removed++;
    }
  }

  for (const playerId of shouldCharge) {
    await db.insert(charges).values({
      playerId,
      kind: "match_fee",
      matchId,
      chargeDate,
      description,
      amount: match.feePerPlayer,
    });
    result.created++;
    touchedPlayers.add(playerId);
  }

  for (const playerId of touchedPlayers) await applyCredit(db, playerId);
  return result;
}

/** Applies a player's unallocated payment money to their oldest open charges. */
export async function applyCredit(db: Executor, playerId: string) {
  const pays = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      allocated: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.payment_id = "payments"."id"), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(eq(payments.playerId, playerId))
    .orderBy(asc(payments.paidOn), asc(payments.createdAt));

  const credits = pays.map((p) => ({ id: p.id, free: p.amount - p.allocated })).filter((p) => p.free > 0);
  if (credits.length === 0) return 0;

  const open = await openCharges(db, playerId);
  let applied = 0;
  for (const charge of open) {
    let due = charge.amount - charge.allocated;
    for (const credit of credits) {
      if (due <= 0) break;
      if (credit.free <= 0) continue;
      const take = Math.min(due, credit.free);
      await db
        .insert(paymentAllocations)
        .values({ paymentId: credit.id, chargeId: charge.id, amount: take })
        .onConflictDoUpdate({
          target: [paymentAllocations.paymentId, paymentAllocations.chargeId],
          set: { amount: sql`${paymentAllocations.amount} + ${take}` },
        });
      credit.free -= take;
      due -= take;
      applied += take;
    }
  }
  return applied;
}

async function openCharges(db: Executor, playerId: string) {
  const rows = await db
    .select({
      id: charges.id,
      amount: charges.amount,
      chargeDate: charges.chargeDate,
      allocated: chargeAllocatedSql,
    })
    .from(charges)
    .where(and(eq(charges.playerId, playerId), eq(charges.waived, false)))
    .orderBy(asc(charges.chargeDate), asc(charges.createdAt));
  return rows.filter((r) => r.allocated < r.amount);
}

type PaymentMeta = { mode?: string; holderId?: string | null; paidOn?: string; reference?: string | null; note?: string | null; actor: string };

/** Records a lump-sum payment and settles the oldest open charges with it. */
export async function recordPayment(db: Executor, playerId: string, amount: number, meta: PaymentMeta) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Amount must be a whole number of rupees above 0");
  const [payment] = await db
    .insert(payments)
    .values({
      playerId,
      amount,
      paidOn: meta.paidOn ?? todayIst(),
      mode: meta.mode ?? "upi",
      holderId: meta.holderId ?? null,
      reference: meta.reference ?? null,
      note: meta.note ?? null,
      source: "manual",
      createdBy: meta.actor,
    })
    .returning();
  await applyCredit(db, playerId);
  return payment;
}

/** "Mark paid" on one charge: uses existing credit first, then records a quick payment for the rest. */
export async function markChargePaid(db: Executor, chargeId: string, meta: PaymentMeta) {
  const [charge] = await db.select().from(charges).where(eq(charges.id, chargeId));
  if (!charge) throw new Error("Charge not found");
  if (charge.waived) throw new Error("This charge is waived");

  const due = charge.amount - (await allocatedTo(db, chargeId));
  if (due <= 0) return null;

  const [payment] = await db
    .insert(payments)
    .values({
      playerId: charge.playerId,
      amount: due,
      paidOn: meta.paidOn ?? todayIst(),
      mode: meta.mode ?? "upi",
      holderId: meta.holderId ?? null,
      reference: meta.reference ?? null,
      note: meta.note ?? charge.description,
      source: "quick",
      createdBy: meta.actor,
    })
    .returning();
  await db.insert(paymentAllocations).values({ paymentId: payment.id, chargeId, amount: due });
  return payment;
}

/** Undo "paid" on one charge. Quick payments made for it are deleted; lump-sum money becomes credit again. */
export async function markChargeUnpaid(db: Executor, chargeId: string) {
  const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.chargeId, chargeId));
  if (allocs.length === 0) return;
  await db.delete(paymentAllocations).where(eq(paymentAllocations.chargeId, chargeId));
  const paymentIds = allocs.map((a) => a.paymentId);
  const quick = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(inArray(payments.id, paymentIds), eq(payments.source, "quick")));
  for (const q of quick) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, q.id));
    if (n === 0) await db.delete(payments).where(eq(payments.id, q.id));
  }
}

/** Admin changes the amount of one charge. The charge is locked from sync changes afterwards. */
export async function setChargeAmount(db: Executor, chargeId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("Amount must be a whole number of rupees");
  const [charge] = await db
    .update(charges)
    .set({ amount, adminLocked: true, updatedAt: sql`now()` })
    .where(eq(charges.id, chargeId))
    .returning();
  if (!charge) throw new Error("Charge not found");
  await trimAllocations(db, chargeId, amount);
  await applyCredit(db, charge.playerId);
  return charge;
}

/** Waive (or un-waive) a charge. Waiving frees any money paid against it as credit. */
export async function setChargeWaived(db: Executor, chargeId: string, waived: boolean) {
  const [charge] = await db
    .update(charges)
    .set({ waived, adminLocked: true, updatedAt: sql`now()` })
    .where(eq(charges.id, chargeId))
    .returning();
  if (!charge) throw new Error("Charge not found");
  if (waived) await markChargeUnpaid(db, chargeId);
  await applyCredit(db, charge.playerId);
  return charge;
}

export async function deletePayment(db: Executor, paymentId: string) {
  const [p] = await db.delete(payments).where(eq(payments.id, paymentId)).returning();
  if (p) await applyCredit(db, p.playerId);
  return p;
}

async function allocatedTo(db: Executor, chargeId: string) {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)`.mapWith(Number) })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.chargeId, chargeId));
  return total;
}

async function trimAllocations(db: Executor, chargeId: string, amount: number) {
  let over = (await allocatedTo(db, chargeId)) - amount;
  if (over <= 0) return;
  const allocs = await db
    .select()
    .from(paymentAllocations)
    .where(eq(paymentAllocations.chargeId, chargeId));
  for (const a of allocs.reverse()) {
    if (over <= 0) break;
    const cut = Math.min(over, a.amount);
    if (cut === a.amount) {
      await db
        .delete(paymentAllocations)
        .where(and(eq(paymentAllocations.paymentId, a.paymentId), eq(paymentAllocations.chargeId, chargeId)));
    } else {
      await db
        .update(paymentAllocations)
        .set({ amount: a.amount - cut })
        .where(and(eq(paymentAllocations.paymentId, a.paymentId), eq(paymentAllocations.chargeId, chargeId)));
    }
    over -= cut;
  }
}
