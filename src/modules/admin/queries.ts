import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import { admins, auditLog, cashHolders, collections, expenses, income, payments, players, syncRuns } from "@/db/schema";

export async function listCashHolders(db: Executor = getDb()) {
  return db.select().from(cashHolders).orderBy(desc(cashHolders.isDefault), asc(cashHolders.name));
}

export async function listAdmins(db: Executor = getDb()) {
  return db.select().from(admins).orderBy(asc(admins.createdAt));
}

export async function listPayments(db: Executor = getDb(), limit = 200) {
  return db
    .select({ payment: payments, playerName: players.name, holderName: cashHolders.name })
    .from(payments)
    .innerJoin(players, eq(players.id, payments.playerId))
    .leftJoin(cashHolders, eq(cashHolders.id, payments.holderId))
    .orderBy(desc(payments.paidOn), desc(payments.createdAt))
    .limit(limit);
}

export async function listCollections(db: Executor = getDb()) {
  return db.select().from(collections).orderBy(desc(collections.dueOn));
}

export async function listExpenses(db: Executor = getDb()) {
  return db
    .select({ expense: expenses, holderName: cashHolders.name })
    .from(expenses)
    .leftJoin(cashHolders, eq(cashHolders.id, expenses.holderId))
    .orderBy(desc(expenses.spentOn));
}

export async function listIncome(db: Executor = getDb()) {
  return db
    .select({ income, holderName: cashHolders.name })
    .from(income)
    .leftJoin(cashHolders, eq(cashHolders.id, income.holderId))
    .orderBy(desc(income.receivedOn));
}

export async function listSyncRuns(db: Executor = getDb(), limit = 30) {
  return db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit);
}

export async function lastSuccessfulSync(db: Executor = getDb(), kind: "cricheroes" | "sheets" = "cricheroes") {
  const rows = await db.select().from(syncRuns).where(eq(syncRuns.kind, kind)).orderBy(desc(syncRuns.startedAt)).limit(20);
  return { last: rows[0] ?? null, lastSuccess: rows.find((r) => r.status === "success") ?? null };
}

export async function listAudit(db: Executor = getDb(), limit = 100) {
  return db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
}
