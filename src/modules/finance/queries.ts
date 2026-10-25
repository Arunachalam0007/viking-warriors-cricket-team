import "server-only";
import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import {
  cashHolders,
  charges,
  collections,
  expenses,
  income,
  matches,
  payments,
  players,
} from "@/db/schema";
import { monthDateRange } from "@/lib/dates";
import { chargeStatus, type ChargeStatus } from "./rules";

export type FinanceFilter = {
  month?: string; // YYYY-MM
  from?: string; // YYYY-MM-DD
  to?: string;
  matchId?: string;
  playerId?: string;
  status?: ChargeStatus | "due";
  kind?: "match_fee" | "collection" | "adjustment";
};

// Correlated subqueries use explicit table-qualified names: drizzle renders bare
// column names in single-table selects, which would bind to the wrong table.
const allocatedSql = sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.charge_id = "charges"."id"), 0)`.mapWith(Number);

function dateBounds(f: FinanceFilter) {
  if (f.month) return monthDateRange(f.month);
  return { from: f.from, to: f.to };
}

export type ChargeRow = {
  chargeId: string;
  playerId: string;
  playerName: string;
  playerPhoto: string | null;
  isMember: boolean;
  kind: string;
  matchId: string | null;
  opponent: string | null;
  collectionId: string | null;
  collectionTitle: string | null;
  chargeDate: string;
  description: string;
  amount: number;
  paid: number;
  due: number;
  waived: boolean;
  status: ChargeStatus;
  adminLocked: boolean;
};

export async function getChargeRows(db: Executor = getDb(), f: FinanceFilter = {}): Promise<ChargeRow[]> {
  const { from, to } = dateBounds(f);
  const where: SQL[] = [];
  if (from) where.push(gte(charges.chargeDate, from));
  if (to) where.push(lte(charges.chargeDate, to));
  if (f.matchId) where.push(eq(charges.matchId, f.matchId));
  if (f.playerId) where.push(eq(charges.playerId, f.playerId));
  if (f.kind) where.push(eq(charges.kind, f.kind));

  const rows = await db
    .select({
      chargeId: charges.id,
      playerId: charges.playerId,
      playerName: players.name,
      photoUrl: players.photoUrl,
      chPhotoUrl: players.chPhotoUrl,
      isMember: players.isMember,
      kind: charges.kind,
      matchId: charges.matchId,
      opponent: matches.opponentName,
      collectionId: charges.collectionId,
      collectionTitle: collections.title,
      chargeDate: charges.chargeDate,
      description: charges.description,
      amount: charges.amount,
      waived: charges.waived,
      adminLocked: charges.adminLocked,
      paid: allocatedSql,
    })
    .from(charges)
    .innerJoin(players, eq(players.id, charges.playerId))
    .leftJoin(matches, eq(matches.id, charges.matchId))
    .leftJoin(collections, eq(collections.id, charges.collectionId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(charges.chargeDate), asc(players.name));

  const out = rows.map((r) => {
    const status = chargeStatus(r.amount, r.paid, r.waived);
    return {
      chargeId: r.chargeId,
      playerId: r.playerId,
      playerName: r.playerName,
      playerPhoto: r.photoUrl ?? r.chPhotoUrl,
      isMember: r.isMember,
      kind: r.kind,
      matchId: r.matchId,
      opponent: r.opponent,
      collectionId: r.collectionId,
      collectionTitle: r.collectionTitle,
      chargeDate: r.chargeDate,
      description: r.description,
      amount: r.amount,
      paid: Math.min(r.paid, r.amount),
      due: r.waived ? 0 : Math.max(r.amount - r.paid, 0),
      waived: r.waived,
      status,
      adminLocked: r.adminLocked,
    };
  });

  if (!f.status) return out;
  if (f.status === "due") return out.filter((r) => r.status === "unpaid" || r.status === "partial");
  return out.filter((r) => r.status === f.status);
}

export type PlayerBalance = {
  playerId: string;
  name: string;
  photo: string | null;
  isMember: boolean;
  isActive: boolean;
  charged: number;
  paid: number;
  balance: number; // > 0 owes the team, < 0 has credit
  matchFees: number;
};

/** Overall (all-time) balance per player. */
export async function getPlayerBalances(db: Executor = getDb()): Promise<PlayerBalance[]> {
  const rows = await db
    .select({
      playerId: players.id,
      name: players.name,
      photoUrl: players.photoUrl,
      chPhotoUrl: players.chPhotoUrl,
      isMember: players.isMember,
      isActive: players.isActive,
      charged: sql<number>`coalesce((select sum(c.amount) from charges c where c.player_id = "players"."id" and c.waived = false), 0)`.mapWith(Number),
      matchFees: sql<number>`(select count(*) from charges c where c.player_id = "players"."id" and c.kind = 'match_fee' and c.waived = false)`.mapWith(Number),
      paid: sql<number>`coalesce((select sum(p.amount) from payments p where p.player_id = "players"."id"), 0)`.mapWith(Number),
    })
    .from(players)
    .orderBy(asc(players.name));

  return rows
    .filter((r) => r.charged > 0 || r.paid > 0 || r.isMember)
    .map((r) => ({
      playerId: r.playerId,
      name: r.name,
      photo: r.photoUrl ?? r.chPhotoUrl,
      isMember: r.isMember,
      isActive: r.isActive,
      charged: r.charged,
      paid: r.paid,
      balance: r.charged - r.paid,
      matchFees: r.matchFees,
    }));
}

export type PlayerPeriodSummary = {
  playerId: string;
  name: string;
  photo: string | null;
  matches: number;
  charged: number;
  paid: number;
  due: number;
  waived: number;
};

/** Per-player totals for the charges matching a filter (e.g. one month). */
export function summarizeByPlayer(rows: ChargeRow[]): PlayerPeriodSummary[] {
  const map = new Map<string, PlayerPeriodSummary>();
  for (const r of rows) {
    let s = map.get(r.playerId);
    if (!s) {
      s = { playerId: r.playerId, name: r.playerName, photo: r.playerPhoto, matches: 0, charged: 0, paid: 0, due: 0, waived: 0 };
      map.set(r.playerId, s);
    }
    if (r.kind === "match_fee" && !r.waived) s.matches++;
    if (r.waived) s.waived += r.amount;
    else s.charged += r.amount;
    s.paid += r.paid;
    s.due += r.due;
  }
  return [...map.values()].sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));
}

export type MatchFinanceSummary = {
  matchId: string;
  startTime: Date;
  opponent: string;
  kind: string;
  status: string;
  outcome: string | null;
  chargeable: boolean;
  feePerPlayer: number;
  players: number;
  charged: number;
  paid: number;
  due: number;
};

export async function getMatchFinanceSummaries(db: Executor = getDb(), f: FinanceFilter = {}): Promise<MatchFinanceSummary[]> {
  const { from, to } = dateBounds(f);
  const where: SQL[] = [eq(matches.status, "past")];
  if (from) where.push(sql`(${matches.startTime} at time zone 'Asia/Kolkata')::date >= ${from}`);
  if (to) where.push(sql`(${matches.startTime} at time zone 'Asia/Kolkata')::date <= ${to}`);
  if (f.matchId) where.push(eq(matches.id, f.matchId));

  const list = await db.select().from(matches).where(and(...where)).orderBy(desc(matches.startTime));
  const rows = await getChargeRows(db, { ...f, kind: "match_fee" });
  const byMatch = new Map<string, ChargeRow[]>();
  for (const r of rows) {
    if (!r.matchId) continue;
    byMatch.set(r.matchId, [...(byMatch.get(r.matchId) ?? []), r]);
  }
  return list.map((m) => {
    const cs = byMatch.get(m.id) ?? [];
    return {
      matchId: m.id,
      startTime: m.startTime,
      opponent: m.opponentName,
      kind: m.kind,
      status: m.status,
      outcome: m.outcome,
      chargeable: m.chargeable,
      feePerPlayer: m.feePerPlayer,
      players: cs.filter((c) => !c.waived).length,
      charged: cs.filter((c) => !c.waived).reduce((s, c) => s + c.amount, 0),
      paid: cs.reduce((s, c) => s + c.paid, 0),
      due: cs.reduce((s, c) => s + c.due, 0),
    };
  });
}

export type RevenueSummary = {
  charged: number;
  collected: number;
  outstanding: number;
  credit: number;
  income: number;
  expenses: number;
  fundBalance: number;
  holders: { id: string | null; name: string; received: number; income: number; spent: number; balance: number }[];
  monthly: { month: string; charged: number; collected: number; income: number; expenses: number }[];
};

export async function getRevenueSummary(db: Executor = getDb()): Promise<RevenueSummary> {
  const balances = await getPlayerBalances(db);
  const outstanding = balances.reduce((s, b) => s + Math.max(b.balance, 0), 0);
  const credit = balances.reduce((s, b) => s + Math.max(-b.balance, 0), 0);

  const [[ch], [pay], [inc], [exp]] = await Promise.all([
    db.select({ v: sql<number>`coalesce(sum(${charges.amount}), 0)`.mapWith(Number) }).from(charges).where(eq(charges.waived, false)),
    db.select({ v: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) }).from(payments),
    db.select({ v: sql<number>`coalesce(sum(${income.amount}), 0)`.mapWith(Number) }).from(income),
    db.select({ v: sql<number>`coalesce(sum(${expenses.amount}), 0)`.mapWith(Number) }).from(expenses),
  ]);

  const holders = await db.select().from(cashHolders).orderBy(desc(cashHolders.isDefault), asc(cashHolders.name));
  const perHolder = async (table: typeof payments | typeof income | typeof expenses) =>
    db
      .select({ holderId: table.holderId, v: sql<number>`coalesce(sum(${table.amount}), 0)`.mapWith(Number) })
      .from(table)
      .groupBy(table.holderId);
  const [recv, incH, expH] = await Promise.all([perHolder(payments), perHolder(income), perHolder(expenses)]);
  const val = (rows: { holderId: string | null; v: number }[], id: string | null) => rows.find((r) => r.holderId === id)?.v ?? 0;

  const holderRows = [...holders.map((h) => ({ id: h.id as string | null, name: h.name })), { id: null, name: "Not assigned" }]
    .map((h) => {
      const received = val(recv, h.id);
      const inc2 = val(incH, h.id);
      const spent = val(expH, h.id);
      return { ...h, received, income: inc2, spent, balance: received + inc2 - spent };
    })
    .filter((h) => h.id !== null || h.received || h.income || h.spent);

  const monthly = await db.execute<{ month: string; charged: number; collected: number; income: number; expenses: number }>(sql`
    with m as (
      select to_char(${charges.chargeDate}, 'YYYY-MM') as month, sum(${charges.amount}) as charged, 0 as collected, 0 as income, 0 as expenses
        from ${charges} where ${charges.waived} = false group by 1
      union all
      select to_char(${payments.paidOn}, 'YYYY-MM'), 0, sum(${payments.amount}), 0, 0 from ${payments} group by 1
      union all
      select to_char(${income.receivedOn}, 'YYYY-MM'), 0, 0, sum(${income.amount}), 0 from ${income} group by 1
      union all
      select to_char(${expenses.spentOn}, 'YYYY-MM'), 0, 0, 0, sum(${expenses.amount}) from ${expenses} group by 1
    )
    select month, sum(charged)::int as charged, sum(collected)::int as collected, sum(income)::int as income, sum(expenses)::int as expenses
    from m group by month order by month
  `);
  const monthlyRows = (Array.isArray(monthly) ? monthly : (monthly as unknown as { rows: unknown[] }).rows) as RevenueSummary["monthly"];

  return {
    charged: ch.v,
    collected: pay.v,
    outstanding,
    credit,
    income: inc.v,
    expenses: exp.v,
    fundBalance: pay.v + inc.v - exp.v,
    holders: holderRows,
    monthly: monthlyRows.map((r) => ({
      month: r.month,
      charged: Number(r.charged),
      collected: Number(r.collected),
      income: Number(r.income),
      expenses: Number(r.expenses),
    })),
  };
}
