import "server-only";
import { tool, type UIMessageStreamWriter } from "ai";
import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { getDb, type Executor, type Tx } from "@/db";
import { cashHolders, expenses, income, matches, matchPlayers, payments, players } from "@/db/schema";
import { formatDate, monthDateRange, todayIst } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { audit } from "@/modules/audit/audit";
import { markChargePaid, markChargeUnpaid, reconcileMatchCharges, recordPayment, setChargeWaived } from "@/modules/finance/ledger";
import { getChargeRows, getMatchFinanceSummaries, getPlayerBalances, getRevenueSummary } from "@/modules/finance/queries";
import { syncSheet } from "@/modules/sheets/sheets";
import { runSyncChecks } from "./checks";
import { publicTools, type ToolContext } from "./tools-public";

/*
 * The admin assistant: everything the public assistant can do, plus the full finance picture,
 * plus changes. A change is never made by the AI alone:
 *   1. the model calls a change tool (e.g. markFeesPaid) with ids it looked up
 *   2. needsApproval works out exactly what would change, from the database, and sends that
 *      preview to the chat as a `data-preview` part (names, amounts, warnings)
 *   3. the admin taps Confirm or Cancel on the preview card
 *   4. only on Confirm does `execute` run, in one transaction, with an audit entry
 *      ("ai.*", actor = the admin) and a Google Sheet refresh, like every admin change
 */

export type Preview = { title: string; lines: string[]; warnings?: string[]; error?: string };
export type AdminToolContext = ToolContext & { actor: string; writer: UIMessageStreamWriter };

const id = z.uuid();
const month = z.string().regex(/^\d{4}-\d{2}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mode = z.enum(["cash", "upi", "bank", "other"]).default("upi");
const holder = z.string().optional().describe("Who received / holds the money (cash holder name); leave out for the default holder");

/** Runs a confirmed change the way adminAction() does: one transaction, then mirror to the Sheet. */
async function change<T>(run: (tx: Tx) => Promise<T>) {
  const result = await getDb().transaction(run);
  after(() => syncSheet("change").catch(() => undefined));
  return result;
}

async function findHolder(tx: Executor, name?: string) {
  const rows = await tx.select().from(cashHolders).where(eq(cashHolders.isActive, true));
  if (name) {
    const h = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    if (!h) throw new Error(`No cash holder named “${name}”. Holders: ${rows.map((r) => r.name).join(", ")}`);
    return h;
  }
  return rows.find((r) => r.isDefault) ?? null;
}

async function matchLabel(matchId: string) {
  const [m] = await getDb().select().from(matches).where(eq(matches.id, matchId));
  if (!m) throw new Error("No match with that id");
  return { match: m, label: `vs ${m.opponentName} on ${formatDate(m.startTime)}` };
}

async function playerName(playerId: string) {
  const [p] = await getDb().select({ name: players.name }).from(players).where(eq(players.id, playerId));
  if (!p) throw new Error("No player with that id");
  return p.name;
}

async function feeCharge(db: Executor, matchId: string, playerId: string) {
  const [c] = await getChargeRows(db, { matchId, playerId, kind: "match_fee" });
  return c ?? null;
}

/**
 * needsApproval for a change tool: builds the preview and sends it to the chat. An input that
 * cannot work (unknown id, nothing to change) skips approval so `execute` reports the problem.
 */
function previewThen<I>(writer: UIMessageStreamWriter, build: (input: I) => Promise<Preview>) {
  return async (input: I, { toolCallId }: { toolCallId: string }) => {
    let preview: Preview;
    try {
      preview = await build(input);
    } catch (e) {
      preview = { title: "Cannot do this", lines: [], error: (e as Error).message };
    }
    writer.write({ type: "data-preview", id: toolCallId, data: preview });
    return !preview.error;
  };
}

export function adminTools(ctx: AdminToolContext) {
  const { db, actor, writer } = ctx;
  // Admins see balances whatever the public setting says
  const base = publicTools({ db, settings: { ...ctx.settings, public_show_balances: true } });

  return {
    ...base,

    /* ---------- Read ---------- */

    financeOverview: tool({
      description: "Team money: total charged, collected, outstanding, advance credit, income, expenses, fund balance, money per cash holder, and per month.",
      inputSchema: z.object({}),
      execute: async () => {
        const r = await getRevenueSummary(db);
        const fmt = (n: number) => rupees(n);
        return {
          charged: fmt(r.charged),
          collected: fmt(r.collected),
          outstanding: fmt(r.outstanding),
          advanceCredit: fmt(r.credit),
          income: fmt(r.income),
          expenses: fmt(r.expenses),
          fundBalance: fmt(r.fundBalance),
          holders: r.holders.map((h) => ({ name: h.name, received: fmt(h.received), income: fmt(h.income), spent: fmt(h.spent), holds: fmt(h.balance) })),
          monthly: r.monthly.map((m) => ({ month: m.month, charged: fmt(m.charged), collected: fmt(m.collected), income: fmt(m.income), expenses: fmt(m.expenses) })),
        };
      },
    }),

    balances: tool({
      description: "Every player's all-time charged, paid and balance (positive = owes), with match-fee count and phone number.",
      inputSchema: z.object({ onlyOwing: z.boolean().default(false) }),
      execute: async ({ onlyOwing }) => {
        const [rows, phones] = await Promise.all([getPlayerBalances(db), db.select({ id: players.id, phone: players.phone }).from(players)]);
        return rows
          .filter((b) => !onlyOwing || b.balance > 0)
          .sort((a, b) => b.balance - a.balance)
          .map((b) => ({ playerId: b.playerId, name: b.name, member: b.isMember, matchFees: b.matchFees, charged: rupees(b.charged), paid: rupees(b.paid), balance: b.balance, phone: phones.find((p) => p.id === b.playerId)?.phone ?? null }));
      },
    }),

    charges: tool({
      description: "Individual charges (match fees, collections, adjustments) with paid / due / status. Filter by month, match, player or status.",
      inputSchema: z.object({
        month: month.optional(),
        matchId: id.optional(),
        playerId: id.optional(),
        status: z.enum(["due", "paid", "unpaid", "partial", "waived"]).optional().describe("due = unpaid or partly paid"),
      }),
      execute: async (f) => {
        const rows = await getChargeRows(db, f);
        return {
          count: rows.length,
          totalDue: rupees(rows.reduce((s, r) => s + r.due, 0)),
          rows: rows.slice(0, 80).map((r) => ({ chargeId: r.chargeId, date: r.chargeDate, player: r.playerName, playerId: r.playerId, for: r.description, matchId: r.matchId, amount: r.amount, paid: r.paid, due: r.due, status: r.status })),
          truncated: rows.length > 80,
        };
      },
    }),

    matchFees: tool({
      description: "Per played match: chargeable or not, fee, players charged, collected and due.",
      inputSchema: z.object({ month: month.optional() }),
      execute: async ({ month: m }) =>
        (await getMatchFinanceSummaries(db, m ? { month: m } : {})).map((r) => ({
          matchId: r.matchId,
          date: formatDate(r.startTime),
          opponent: r.opponent,
          type: r.kind,
          chargeable: r.chargeable,
          fee: r.feePerPlayer,
          playersCharged: r.players,
          charged: r.charged,
          paid: r.paid,
          due: r.due,
        })),
    }),

    payments: tool({
      description: "Payments received, newest first. Filter by player or month.",
      inputSchema: z.object({ playerId: id.optional(), month: month.optional(), limit: z.number().int().min(1).max(100).default(30) }),
      execute: async ({ playerId, month: m, limit }) => {
        const where = [];
        if (playerId) where.push(eq(payments.playerId, playerId));
        if (m) {
          const r = monthDateRange(m);
          where.push(gte(payments.paidOn, r.from), lte(payments.paidOn, r.to));
        }
        const rows = await db
          .select({ p: payments, name: players.name, holder: cashHolders.name })
          .from(payments)
          .innerJoin(players, eq(players.id, payments.playerId))
          .leftJoin(cashHolders, eq(cashHolders.id, payments.holderId))
          .where(where.length ? and(...where) : undefined)
          .orderBy(desc(payments.paidOn), desc(payments.createdAt))
          .limit(limit);
        return rows.map(({ p, name, holder: h }) => ({ date: p.paidOn, player: name, amount: p.amount, mode: p.mode, holder: h, reference: p.reference, note: p.note }));
      },
    }),

    expensesAndIncome: tool({
      description: "Team expenses (balls, ground, equipment…) and other income (sponsorship, prize money…), optionally for one month.",
      inputSchema: z.object({ month: month.optional() }),
      execute: async ({ month: m }) => {
        const r = m ? monthDateRange(m) : null;
        const [e, i] = await Promise.all([
          db.select().from(expenses).where(r ? and(gte(expenses.spentOn, r.from), lte(expenses.spentOn, r.to)) : undefined).orderBy(desc(expenses.spentOn)),
          db.select().from(income).where(r ? and(gte(income.receivedOn, r.from), lte(income.receivedOn, r.to)) : undefined).orderBy(desc(income.receivedOn)),
        ]);
        return {
          expenses: e.map((x) => ({ date: x.spentOn, category: x.category, description: x.description, amount: x.amount, paidBy: x.paidBy })),
          totalExpenses: rupees(e.reduce((s, x) => s + x.amount, 0)),
          income: i.map((x) => ({ date: x.receivedOn, category: x.category, description: x.description, amount: x.amount })),
          totalIncome: rupees(i.reduce((s, x) => s + x.amount, 0)),
        };
      },
    }),

    dataChecks: tool({
      description: "Problems found in the data after the last sync (unscored fixtures, missing players, fee mismatches, regular guests, big dues).",
      inputSchema: z.object({}),
      execute: async () => runSyncChecks(db),
    }),

    /* ---------- Changes (admin confirms each one) ---------- */

    markFeesPaid: tool({
      description: "Mark match fees as paid for one match: the listed players, or everyone still unpaid if playerIds is left out.",
      inputSchema: z.object({ matchId: id, playerIds: z.array(id).optional(), mode, holder, paidOn: isoDate.optional() }),
      needsApproval: previewThen(writer, async ({ matchId, playerIds, mode: m, holder: h, paidOn }) => {
        const { label } = await matchLabel(matchId);
        const due = (await getChargeRows(db, { matchId, kind: "match_fee", status: "due" })).filter((c) => !playerIds || playerIds.includes(c.playerId));
        if (due.length === 0) throw new Error(`Nobody has an unpaid fee for the match ${label}`);
        const hold = await findHolder(db, h);
        const missing = (playerIds ?? []).filter((p) => !due.some((c) => c.playerId === p));
        return {
          title: `Mark ${due.length} fee${due.length > 1 ? "s" : ""} paid · ${label}`,
          lines: [...due.map((c) => `${c.playerName} — ${rupees(c.due)}`), `Total ${rupees(due.reduce((s, c) => s + c.due, 0))} · ${m.toUpperCase()}${hold ? ` · held by ${hold.name}` : ""} · ${formatDate(paidOn ?? todayIst())}`],
          warnings: missing.length ? [`${missing.length} of the players asked for have nothing unpaid in this match`] : undefined,
        };
      }),
      execute: async ({ matchId, playerIds, mode: m, holder: h, paidOn }) =>
        change(async (tx) => {
          const hold = await findHolder(tx, h);
          const due = (await getChargeRows(tx, { matchId, kind: "match_fee", status: "due" })).filter((c) => !playerIds || playerIds.includes(c.playerId));
          let total = 0;
          for (const c of due) {
            const p = await markChargePaid(tx, c.chargeId, { mode: m, holderId: hold?.id ?? null, paidOn, actor });
            if (p) total += p.amount;
          }
          await audit({ actor, action: "ai.match.mark_paid", entity: "match", entityId: matchId, after: { count: due.length, total, mode: m } }, tx);
          return { done: true, marked: due.map((c) => c.playerName), total: rupees(total) };
        }),
    }),

    markFeeUnpaid: tool({
      description: "Undo a paid match fee (one player, one match). The payment made by ticking 'paid' is removed.",
      inputSchema: z.object({ matchId: id, playerId: id }),
      needsApproval: previewThen(writer, async ({ matchId, playerId }) => {
        const [{ label }, name, c] = await Promise.all([matchLabel(matchId), playerName(playerId), feeCharge(db, matchId, playerId)]);
        if (!c || c.paid === 0) throw new Error(`${name} has no paid fee for the match ${label}`);
        return { title: `Mark unpaid · ${name} · ${label}`, lines: [`${rupees(c.paid)} paid → unpaid`] };
      }),
      execute: async ({ matchId, playerId }) =>
        change(async (tx) => {
          const c = await feeCharge(tx, matchId, playerId);
          if (!c) throw new Error("No match fee for this player in this match");
          await markChargeUnpaid(tx, c.chargeId);
          await audit({ actor, action: "ai.charge.mark_unpaid", entity: "charge", entityId: c.chargeId }, tx);
          return { done: true };
        }),
    }),

    setPlayed: tool({
      description: "Mark a player as played / did not play in a match. Changes their match fee (members only).",
      inputSchema: z.object({ matchId: id, playerId: id, played: z.boolean() }),
      needsApproval: previewThen(writer, async ({ matchId, playerId, played }) => {
        const [{ label, match }, name] = await Promise.all([matchLabel(matchId), playerName(playerId)]);
        return {
          title: `${name} ${played ? "played" : "did not play"} · ${label}`,
          lines: [match.chargeable ? (played ? `Adds a ₹${match.feePerPlayer} match fee (members only)` : "Removes their unpaid match fee") : "This match is not charged, so no fee changes"],
        };
      }),
      execute: async ({ matchId, playerId, played }) =>
        change(async (tx) => {
          const [existing] = await tx.select().from(matchPlayers).where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, playerId)));
          if (existing) await tx.update(matchPlayers).set({ played, adminLocked: true }).where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, playerId)));
          else await tx.insert(matchPlayers).values({ matchId, playerId, played, source: "admin", adminLocked: true });
          const result = await reconcileMatchCharges(tx, matchId);
          await audit({ actor, action: played ? "ai.match.player.played" : "ai.match.player.not_played", entity: "match", entityId: matchId, after: { playerId, ...result } }, tx);
          return { done: true, ...result };
        }),
    }),

    waiveFee: tool({
      description: "Waive (or un-waive) one player's match fee for one match, e.g. they came only to field.",
      inputSchema: z.object({ matchId: id, playerId: id, waived: z.boolean() }),
      needsApproval: previewThen(writer, async ({ matchId, playerId, waived }) => {
        const [{ label }, name, c] = await Promise.all([matchLabel(matchId), playerName(playerId), feeCharge(db, matchId, playerId)]);
        if (!c) throw new Error(`${name} has no match fee for the match ${label}`);
        return { title: `${waived ? "Waive" : "Charge again"} ${name}'s fee · ${label}`, lines: [`${rupees(c.amount)} ${waived ? "will not be owed" : "will be owed again"}`] };
      }),
      execute: async ({ matchId, playerId, waived }) =>
        change(async (tx) => {
          const c = await feeCharge(tx, matchId, playerId);
          if (!c) throw new Error("No match fee for this player in this match");
          await setChargeWaived(tx, c.chargeId, waived);
          await audit({ actor, action: waived ? "ai.charge.waive" : "ai.charge.unwaive", entity: "charge", entityId: c.chargeId }, tx);
          return { done: true };
        }),
    }),

    recordPayment: tool({
      description: "Record money received from a player (lump sum). It settles their oldest unpaid charges first; extra becomes credit.",
      inputSchema: z.object({
        playerId: id,
        amount: z.number().int().min(1).max(100000),
        mode,
        holder,
        paidOn: isoDate.optional(),
        reference: z.string().max(100).optional().describe("UPI / bank reference number"),
        note: z.string().max(200).optional(),
      }),
      needsApproval: previewThen(writer, async ({ playerId, amount, mode: m, holder: h, paidOn, reference }) => {
        const [name, hold, b] = await Promise.all([playerName(playerId), findHolder(db, h), getPlayerBalances(db).then((all) => all.find((x) => x.playerId === playerId))]);
        const owes = Math.max(b?.balance ?? 0, 0);
        return {
          title: `Record ${rupees(amount)} from ${name}`,
          lines: [`${m.toUpperCase()}${hold ? ` · held by ${hold.name}` : ""} · ${formatDate(paidOn ?? todayIst())}${reference ? ` · ref ${reference}` : ""}`, `Owes ${rupees(owes)} now → ${amount >= owes ? `${rupees(0)}${amount > owes ? ` (+${rupees(amount - owes)} credit)` : ""}` : rupees(owes - amount)}`],
          warnings: owes === 0 ? [`${name} owes nothing; this becomes advance credit`] : undefined,
        };
      }),
      execute: async ({ playerId, amount, mode: m, holder: h, paidOn, reference, note }) =>
        change(async (tx) => {
          const hold = await findHolder(tx, h);
          const p = await recordPayment(tx, playerId, amount, { mode: m, holderId: hold?.id ?? null, paidOn, reference: reference ?? null, note: note ?? null, actor });
          await audit({ actor, action: "ai.payment.record", entity: "payment", entityId: p.id, after: p }, tx);
          return { done: true, paymentId: p.id };
        }),
    }),

    addExpense: tool({
      description: "Record a team expense paid from team money.",
      inputSchema: z.object({
        spentOn: isoDate.optional().describe("Default today"),
        category: z.enum(["balls", "ground", "equipment", "tournament_fee", "food", "jersey", "other"]),
        description: z.string().min(2).max(200),
        amount: z.number().int().min(1).max(1000000),
        mode,
        holder: holder.describe("Cash holder whose money paid for it"),
        paidBy: z.string().max(100).optional(),
      }),
      needsApproval: previewThen(writer, async ({ spentOn, category, description, amount, mode: m, holder: h }) => {
        const hold = await findHolder(db, h);
        return { title: `Add expense ${rupees(amount)} · ${description}`, lines: [`${category.replace("_", " ")} · ${m.toUpperCase()}${hold ? ` · from ${hold.name}` : ""} · ${formatDate(spentOn ?? todayIst())}`] };
      }),
      execute: async ({ spentOn, holder: h, ...values }) =>
        change(async (tx) => {
          const hold = await findHolder(tx, h);
          const [e] = await tx.insert(expenses).values({ ...values, spentOn: spentOn ?? todayIst(), holderId: hold?.id ?? null, paidBy: values.paidBy ?? null, createdBy: actor }).returning();
          await audit({ actor, action: "ai.expense.create", entity: "expense", entityId: e.id, after: e }, tx);
          return { done: true };
        }),
    }),

    setMatchFee: tool({
      description: "Change whether a played match is charged, its fee per player, or individual / tournament. Recalculates everyone's fee.",
      inputSchema: z.object({ matchId: id, chargeable: z.boolean().optional(), feePerPlayer: z.number().int().min(0).max(10000).optional(), kind: z.enum(["individual", "tournament"]).optional() }),
      needsApproval: previewThen(writer, async ({ matchId, chargeable, feePerPlayer, kind }) => {
        const { label, match } = await matchLabel(matchId);
        const lines = [
          chargeable !== undefined && chargeable !== match.chargeable ? `Charged: ${match.chargeable ? "yes" : "no"} → ${chargeable ? "yes" : "no"}` : null,
          feePerPlayer !== undefined && feePerPlayer !== match.feePerPlayer ? `Fee: ${rupees(match.feePerPlayer)} → ${rupees(feePerPlayer)} per player` : null,
          kind && kind !== match.kind ? `Type: ${match.kind} → ${kind}` : null,
        ].filter((l): l is string => Boolean(l));
        if (lines.length === 0) throw new Error("Nothing would change");
        return { title: `Change match fee settings · ${label}`, lines, warnings: ["Paid or hand-edited fees are kept as they are"] };
      }),
      execute: async ({ matchId, chargeable, feePerPlayer, kind }) =>
        change(async (tx) => {
          const [m] = await tx.select().from(matches).where(eq(matches.id, matchId));
          if (!m) throw new Error("No match with that id");
          await tx
            .update(matches)
            .set({ chargeable: chargeable ?? m.chargeable, feePerPlayer: feePerPlayer ?? m.feePerPlayer, kind: kind ?? m.kind, financeLocked: true, updatedAt: sql`now()` })
            .where(eq(matches.id, matchId));
          const result = await reconcileMatchCharges(tx, matchId);
          await audit({ actor, action: "ai.match.finance.update", entity: "match", entityId: matchId, before: { chargeable: m.chargeable, feePerPlayer: m.feePerPlayer, kind: m.kind }, after: { chargeable, feePerPlayer, kind, ...result } }, tx);
          return { done: true, ...result };
        }),
    }),

    findPlayerByName: tool({
      description: "Search players by part of their name (English letters).",
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async ({ query }) =>
        (await db.select({ id: players.id, name: players.name, phone: players.phone, isMember: players.isMember }).from(players).where(ilike(players.name, `%${query}%`))).map((p) => ({
          playerId: p.id,
          name: p.name,
          member: p.isMember,
          phone: p.phone,
        })),
    }),
  };
}
