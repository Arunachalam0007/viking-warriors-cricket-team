import "server-only";
import ExcelJS from "exceljs";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cashHolders, expenses, income, payments, players } from "@/db/schema";
import { formatMonth } from "@/lib/dates";
import {
  getChargeRows,
  getMatchFinanceSummaries,
  getPlayerBalances,
  summarizeByPlayer,
  type FinanceFilter,
} from "@/modules/finance/queries";

const MONEY = '"₹"#,##0';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F5A46" } };

function addSheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number; money?: boolean }[], rows: Record<string, unknown>[], totals?: Record<string, unknown>) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.money ? { numFmt: MONEY } : {} }));
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle" };
  });
  ws.addRows(rows);
  if (totals) {
    const row = ws.addRow(totals);
    row.font = { bold: true };
    row.border = { top: { style: "thin" } };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

export function filterLabel(f: FinanceFilter) {
  if (f.month) return formatMonth(f.month);
  if (f.from || f.to) return `${f.from ?? "start"} to ${f.to ?? "today"}`;
  return "All time";
}

/** Finance workbook. `admin` adds payments, expenses and income sheets. */
export async function buildFinanceWorkbook(filter: FinanceFilter, opts: { admin: boolean; showBalances: boolean }) {
  const db = getDb();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Viking Warriors";
  wb.created = new Date();

  const rows = await getChargeRows(db, filter);
  const byPlayer = summarizeByPlayer(rows);
  const balances = new Map((await getPlayerBalances(db)).map((b) => [b.playerId, b.balance]));
  const sum = (key: "charged" | "paid" | "due") => byPlayer.reduce((s, p) => s + p[key], 0);

  if (opts.showBalances || opts.admin) {
    addSheet(
      wb,
      "By player",
      [
        { header: "Player", key: "name", width: 24 },
        { header: "Matches", key: "matches", width: 10 },
        { header: "Charged", key: "charged", width: 12, money: true },
        { header: "Paid", key: "paid", width: 12, money: true },
        { header: "Due (this period)", key: "due", width: 16, money: true },
        { header: "Overall balance", key: "balance", width: 16, money: true },
      ],
      byPlayer.map((p) => ({ ...p, balance: balances.get(p.playerId) ?? 0 })),
      { name: "Total", matches: byPlayer.reduce((s, p) => s + p.matches, 0), charged: sum("charged"), paid: sum("paid"), due: sum("due") },
    );
  }

  const matchRows = await getMatchFinanceSummaries(db, filter);
  addSheet(
    wb,
    "By match",
    [
      { header: "Date", key: "date", width: 14 },
      { header: "Opponent", key: "opponent", width: 28 },
      { header: "Type", key: "kind", width: 12 },
      { header: "Charged?", key: "chargeable", width: 10 },
      { header: "Fee / player", key: "fee", width: 12, money: true },
      { header: "Players", key: "players", width: 10 },
      { header: "Charged", key: "charged", width: 12, money: true },
      { header: "Paid", key: "paid", width: 12, money: true },
      { header: "Due", key: "due", width: 12, money: true },
    ],
    matchRows.map((m) => ({
      date: m.startTime.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
      opponent: m.opponent,
      kind: m.kind,
      chargeable: m.chargeable ? "Yes" : "No",
      fee: m.feePerPlayer,
      players: m.players,
      charged: m.charged,
      paid: m.paid,
      due: m.due,
    })),
    {
      opponent: "Total",
      charged: matchRows.reduce((s, m) => s + m.charged, 0),
      paid: matchRows.reduce((s, m) => s + m.paid, 0),
      due: matchRows.reduce((s, m) => s + m.due, 0),
    },
  );

  if (opts.showBalances || opts.admin) {
    addSheet(
      wb,
      "Charges",
      [
        { header: "Date", key: "chargeDate", width: 12 },
        { header: "Player", key: "playerName", width: 24 },
        { header: "Description", key: "description", width: 34 },
        { header: "Amount", key: "amount", width: 10, money: true },
        { header: "Paid", key: "paid", width: 10, money: true },
        { header: "Due", key: "due", width: 10, money: true },
        { header: "Status", key: "status", width: 10 },
      ],
      rows.map((r) => ({ ...r })),
    );
  }

  if (opts.admin) {
    const holderName = new Map((await db.select().from(cashHolders)).map((h) => [h.id, h.name]));
    const pays = await db
      .select({ p: payments, name: players.name })
      .from(payments)
      .innerJoin(players, eq(players.id, payments.playerId))
      .orderBy(desc(payments.paidOn));
    addSheet(
      wb,
      "Payments",
      [
        { header: "Date", key: "paidOn", width: 12 },
        { header: "Player", key: "name", width: 24 },
        { header: "Amount", key: "amount", width: 12, money: true },
        { header: "Mode", key: "mode", width: 10 },
        { header: "Received by", key: "holder", width: 16 },
        { header: "Reference", key: "reference", width: 20 },
        { header: "Note", key: "note", width: 30 },
      ],
      pays.map(({ p, name }) => ({ ...p, name, holder: p.holderId ? holderName.get(p.holderId) : "" })),
    );
    const exp = await db.select().from(expenses).orderBy(desc(expenses.spentOn));
    addSheet(
      wb,
      "Expenses",
      [
        { header: "Date", key: "spentOn", width: 12 },
        { header: "Category", key: "category", width: 14 },
        { header: "Description", key: "description", width: 34 },
        { header: "Amount", key: "amount", width: 12, money: true },
        { header: "Paid from", key: "holder", width: 16 },
        { header: "Paid by", key: "paidBy", width: 16 },
        { header: "Mode", key: "mode", width: 10 },
      ],
      exp.map((e) => ({ ...e, holder: e.holderId ? holderName.get(e.holderId) : "" })),
    );
    const inc = await db.select().from(income).orderBy(desc(income.receivedOn));
    addSheet(
      wb,
      "Income",
      [
        { header: "Date", key: "receivedOn", width: 12 },
        { header: "Category", key: "category", width: 14 },
        { header: "Description", key: "description", width: 34 },
        { header: "Amount", key: "amount", width: 12, money: true },
        { header: "Received by", key: "holder", width: 16 },
      ],
      inc.map((i) => ({ ...i, holder: i.holderId ? holderName.get(i.holderId) : "" })),
    );
  }

  return wb;
}
