import "server-only";
import { auth, sheets as sheetsApi, type sheets_v4 } from "@googleapis/sheets";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { cashHolders, collections, expenses, income, matches, payments, players, syncRuns } from "@/db/schema";
import { formatDate, formatMonth, istDate, monthsBetween, todayIst } from "@/lib/dates";
import { getChargeRows, getPlayerBalances, getRevenueSummary, type ChargeRow } from "@/modules/finance/queries";
import { getSettings, sheetIdFromUrl } from "@/modules/settings/settings";
import { formatRequests, layoutTab, PALETTE, resetRequests, titleCase, type Cell, type Column, type TabSpec } from "./layout";

export function sheetsConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

function client(): sheets_v4.Sheets {
  const jwt = new auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return sheetsApi({ version: "v4", auth: jwt });
}

/* ---------- Tab builders (data → tables; layout.ts turns them into cells and formatting) ---------- */

const feeCell = (c: ChargeRow) => {
  if (c.waived) return "Waived";
  if (c.status === "paid") return `Paid ${c.amount}`;
  if (c.status === "partial") return `Part ${c.paid}/${c.amount}`;
  return `Due ${c.amount}`;
};

const balanceStatus = (balance: number) => (balance > 0 ? "Unpaid" : balance < 0 ? "Credit" : "Clear");
const sumOf = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0);

/** Players down, matches across — same shape as the team's old "Normal match amount split" sheet. */
function monthTab(month: string, monthMatches: { id: string; date: string; opponent: string; ground: string | null }[], rows: ChargeRow[]): TabSpec {
  const fees = rows.filter((r) => r.kind === "match_fee");
  const others = rows.filter((r) => r.kind !== "match_fee");
  const charged = (r: ChargeRow) => (r.waived ? 0 : r.amount);
  const playerNames = [...new Map(rows.map((r) => [r.playerId, r.playerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const columns: Column[] = [
    { header: "S.No", width: 5, kind: "number" },
    { header: "Player", width: 22 },
    ...monthMatches.map((m): Column => ({
      header: `${formatDate(m.date, { day: "2-digit", month: "short" })}\nvs ${m.opponent}`,
      width: 16,
      kind: "fee",
      note: m.ground ? `Venue: ${m.ground}` : undefined,
    })),
    { header: "Other charges", width: 11, kind: "money" },
    { header: "Charged", width: 11, kind: "money" },
    { header: "Paid", width: 11, kind: "in" },
    { header: "Due", width: 11, kind: "due" },
    { header: "Status", width: 9, kind: "status" },
  ];

  const body: Cell[][] = playerNames.map(([playerId, name], i) => {
    const mine = rows.filter((r) => r.playerId === playerId);
    const due = sumOf(mine, (r) => r.due);
    return [
      i + 1,
      name,
      ...monthMatches.map((m) => {
        const c = fees.find((f) => f.playerId === playerId && f.matchId === m.id);
        return c ? feeCell(c) : "";
      }),
      sumOf(others.filter((r) => r.playerId === playerId), charged),
      sumOf(mine, charged),
      sumOf(mine, (r) => r.paid),
      due,
      due > 0 ? "Unpaid" : "Clear",
    ];
  });

  // Per match: "paid of charged" so the admin sees which matches still have money out
  const perMatch = monthMatches.map((m) => {
    const mine = fees.filter((f) => f.matchId === m.id);
    return `${sumOf(mine, (r) => r.paid)} of ${sumOf(mine, charged)}`;
  });
  const totals: Cell[] = ["", "Total", ...perMatch, sumOf(others, charged), sumOf(rows, charged), sumOf(rows, (r) => r.paid), sumOf(rows, (r) => r.due), ""];

  return { name: formatMonth(month, true), heading: `${formatMonth(month)} — match fees`, color: "#2E7D4F", freezeColumns: 2, tables: [{ columns, rows: body, totals }] };
}

export async function buildTabs(db: DB): Promise<TabSpec[]> {
  const cfg = await getSettings(db);
  const tabs: TabSpec[] = [];

  // Summary
  const balances = (await getPlayerBalances(db)).filter((b) => b.charged || b.paid);
  const revenue = await getRevenueSummary(db);
  tabs.push({
    name: "Summary",
    heading: `${cfg.team_name} — finance summary`,
    color: PALETTE.brand,
    tables: [
      {
        columns: [
          { header: "Player", width: 24 },
          { header: "Matches charged", width: 10, kind: "number" },
          { header: "Charged", width: 11, kind: "money" },
          { header: "Paid", width: 11, kind: "in" },
          { header: "Balance\n(+ unpaid / − credit)", width: 14, kind: "balance" },
          { header: "Status", width: 9, kind: "status" },
        ],
        rows: balances.map((b) => [b.name, b.matchFees, b.charged, b.paid, b.balance, balanceStatus(b.balance)]),
        totals: ["Total", sumOf(balances, (b) => b.matchFees), sumOf(balances, (b) => b.charged), sumOf(balances, (b) => b.paid), sumOf(balances, (b) => b.balance), ""],
      },
      {
        title: "Team totals",
        columns: [
          { header: "Item", width: 24 },
          { header: "Amount", width: 12, kind: "money" },
        ],
        rows: [
          ["Total charged", revenue.charged],
          ["Collected from players", revenue.collected],
          ["Outstanding dues", revenue.outstanding],
          ["Other income", revenue.income],
          ["Expenses", revenue.expenses],
        ],
        totals: ["Fund balance", revenue.fundBalance],
      },
      {
        title: "Cash holders",
        columns: [
          { header: "Holder", width: 24 },
          { header: "Received", width: 12, kind: "in" },
          { header: "Income", width: 11, kind: "in" },
          { header: "Spent", width: 11, kind: "out" },
          { header: "In hand", width: 14, kind: "money" },
        ],
        rows: revenue.holders.map((h) => [h.name, h.received, h.income, h.spent, h.balance]),
      },
    ],
  });

  // One tab per month since finance start, newest first
  const months = monthsBetween(cfg.finance_start_date.slice(0, 7), todayIst().slice(0, 7)).reverse();
  for (const month of months) {
    const rows = await getChargeRows(db, { month });
    const allMatches = await db
      .select({ id: matches.id, startTime: matches.startTime, opponent: matches.opponentName, ground: matches.ground })
      .from(matches)
      .where(and(eq(matches.chargeable, true), sql`to_char(${matches.startTime} at time zone 'Asia/Kolkata', 'YYYY-MM') = ${month}`))
      .orderBy(asc(matches.startTime));
    const monthMatches = allMatches.map((m) => ({ id: m.id, date: istDate(m.startTime), opponent: m.opponent, ground: m.ground }));
    tabs.push(monthTab(month, monthMatches, rows));
  }

  // Collections (tournament shares, monthly fees…)
  const colls = await db.select().from(collections).orderBy(desc(collections.dueOn));
  const collRows = await getChargeRows(db, { kind: "collection" });
  const collBody = colls.flatMap((c) =>
    collRows.filter((x) => x.collectionId === c.id).map((r): Cell[] => [c.title, titleCase(c.kind), c.dueOn, r.playerName, r.waived ? 0 : r.amount, r.paid, r.due, titleCase(r.status)]),
  );
  tabs.push({
    name: "Collections",
    heading: "Collections — tournament shares and other team collections",
    color: "#5F6368",
    tables: [
      {
        columns: [
          { header: "Collection", width: 26 },
          { header: "Type", width: 14 },
          { header: "Due on", width: 12, kind: "date" },
          { header: "Player", width: 22 },
          { header: "Amount", width: 11, kind: "money" },
          { header: "Paid", width: 11, kind: "in" },
          { header: "Due", width: 11, kind: "due" },
          { header: "Status", width: 9, kind: "status" },
        ],
        rows: collBody,
        totals: collBody.length ? ["Total", "", "", "", sumOf(collBody, (r) => Number(r[4])), sumOf(collBody, (r) => Number(r[5])), sumOf(collBody, (r) => Number(r[6])), ""] : undefined,
      },
    ],
  });

  const holderName = new Map((await db.select().from(cashHolders)).map((h) => [h.id, h.name]));
  const holder = (id: string | null) => (id ? (holderName.get(id) ?? "") : "");

  const pays = await db
    .select({ p: payments, name: players.name })
    .from(payments)
    .innerJoin(players, eq(players.id, payments.playerId))
    .orderBy(desc(payments.paidOn));
  tabs.push({
    name: "Payments",
    heading: "Payments received from players",
    color: "#5F6368",
    tables: [
      {
        columns: [
          { header: "Date", width: 12, kind: "date" },
          { header: "Player", width: 22 },
          { header: "Amount", width: 11, kind: "in" },
          { header: "Mode", width: 10 },
          { header: "Received by", width: 14 },
          { header: "Reference", width: 18 },
          { header: "Note", width: 30 },
        ],
        rows: pays.map(({ p, name }) => [p.paidOn, name, p.amount, titleCase(p.mode), holder(p.holderId), p.reference ?? "", p.note ?? ""]),
        totals: pays.length ? ["Total", "", sumOf(pays, ({ p }) => p.amount), "", "", "", ""] : undefined,
      },
    ],
  });

  const exp = await db.select().from(expenses).orderBy(desc(expenses.spentOn));
  tabs.push({
    name: "Expenses",
    heading: "Team expenses",
    color: "#5F6368",
    tables: [
      {
        columns: [
          { header: "Date", width: 12, kind: "date" },
          { header: "Category", width: 14 },
          { header: "Description", width: 32 },
          { header: "Amount", width: 11, kind: "out" },
          { header: "Paid from", width: 14 },
          { header: "Paid by", width: 14 },
          { header: "Mode", width: 10 },
        ],
        rows: exp.map((e) => [e.spentOn, titleCase(e.category), e.description, e.amount, holder(e.holderId), e.paidBy ?? "", titleCase(e.mode)]),
        totals: exp.length ? ["Total", "", "", sumOf(exp, (e) => e.amount), "", "", ""] : undefined,
      },
    ],
  });

  const inc = await db.select().from(income).orderBy(desc(income.receivedOn));
  tabs.push({
    name: "Income",
    heading: "Other income",
    color: "#5F6368",
    tables: [
      {
        columns: [
          { header: "Date", width: 12, kind: "date" },
          { header: "Category", width: 14 },
          { header: "Description", width: 32 },
          { header: "Amount", width: 11, kind: "in" },
          { header: "Received by", width: 14 },
          { header: "Mode", width: 10 },
        ],
        rows: inc.map((i) => [i.receivedOn, titleCase(i.category), i.description, i.amount, holder(i.holderId), titleCase(i.mode)]),
        totals: inc.length ? ["Total", "", "", sumOf(inc, (i) => i.amount), "", ""] : undefined,
      },
    ],
  });

  return tabs;
}

/* ---------- Writer ---------- */

/** Rewrites every managed tab: clear, write values, then format. Tabs the app does not manage are left alone. */
export async function writeSheet(db: DB = getDb()) {
  const cfg = await getSettings(db);
  const spreadsheetId = sheetIdFromUrl(cfg.google_sheet_url);
  if (!spreadsheetId) throw new Error("Google Sheet URL is not set in Settings");
  if (!sheetsConfigured()) throw new Error("Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)");

  const api = client();
  const tabs = await buildTabs(db);
  const updated = `Updated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST by the team portal · Use the filter buttons in the red header row · Do not edit: changes are overwritten on the next sync`;
  const laid = tabs.map((tab) => ({ tab, ...layoutTab(tab, updated) }));

  const fields = "sheets(properties(sheetId,title,gridProperties),basicFilter,bandedRanges(bandedRangeId),conditionalFormats)";
  const meta = await api.spreadsheets.get({ spreadsheetId, fields });
  const existing = new Map((meta.data.sheets ?? []).map((s) => [s.properties!.title!, s]));

  // Create missing tabs, big enough for their content
  const missing = laid.filter(({ tab }) => !existing.has(tab.name));
  if (missing.length) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: missing.map(({ tab }) => ({ addSheet: { properties: { title: tab.name } } })) },
    });
    const again = await api.spreadsheets.get({ spreadsheetId, fields });
    for (const s of again.data.sheets ?? []) existing.set(s.properties!.title!, s);
  }

  // Clear old content/formatting and make sure every grid is large enough
  const resets = laid.flatMap(({ tab, grid }) => {
    const sheet = existing.get(tab.name)!;
    const g = sheet.properties!.gridProperties ?? {};
    const rows = Math.max(g.rowCount ?? 0, grid.length + 20);
    const cols = Math.max(g.columnCount ?? 0, Math.max(...grid.map((r) => r.length)) + 2);
    return [
      ...resetRequests(sheet),
      { updateSheetProperties: { properties: { sheetId: sheet.properties!.sheetId!, gridProperties: { rowCount: rows, columnCount: cols, frozenRowCount: 0, frozenColumnCount: 0 } }, fields: "gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount)" } },
    ];
  });
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: resets } });

  const q = (t: string) => `'${t.replace(/'/g, "''")}'`;
  await api.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      // RAW: player-entered text is never interpreted as a formula
      valueInputOption: "RAW",
      data: laid.map(({ tab, grid }) => ({ range: `${q(tab.name)}!A1`, values: grid })),
    },
  });

  await api.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: laid.flatMap(({ tab, placed }, i) => formatRequests(existing.get(tab.name)!.properties!.sheetId!, tab, placed, i)),
    },
  });

  return { spreadsheetId, tabs: tabs.map((t) => t.name) };
}

const DEBOUNCE_MS = 5_000;

/**
 * Runs a sheet sync, recorded in sync_runs. Called after admin changes (via `after()`) and nightly.
 * Rapid successive changes collapse into one write: each request waits briefly and steps aside
 * if a newer request arrived meanwhile.
 */
export async function syncSheet(trigger: "cron" | "manual" | "change", db: DB = getDb()) {
  const cfg = await getSettings(db);
  if (!sheetsConfigured() || !sheetIdFromUrl(cfg.google_sheet_url)) {
    return { status: "skipped" as const, reason: "Google Sheets is not configured" };
  }

  const [run] = await db.insert(syncRuns).values({ kind: "sheets", trigger, status: "queued" }).returning();
  if (trigger === "change") {
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
    const newer = await db
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(and(eq(syncRuns.kind, "sheets"), gt(syncRuns.id, run.id), inArray(syncRuns.status, ["queued", "running"])));
    if (newer.length) {
      await db.update(syncRuns).set({ status: "skipped", finishedAt: sql`now()` }).where(eq(syncRuns.id, run.id));
      return { status: "skipped" as const, reason: "A newer sheet sync is pending" };
    }
  }

  await db.update(syncRuns).set({ status: "running" }).where(eq(syncRuns.id, run.id));
  try {
    const result = await writeSheet(db);
    await db
      .update(syncRuns)
      .set({ status: "success", finishedAt: sql`now()`, summary: result as never })
      .where(eq(syncRuns.id, run.id));
    return { status: "success" as const, ...result };
  } catch (e) {
    const message = describeGoogleError(e);
    await db.update(syncRuns).set({ status: "failed", finishedAt: sql`now()`, error: message }).where(eq(syncRuns.id, run.id));
    return { status: "failed" as const, reason: message };
  }
}

function describeGoogleError(e: unknown): string {
  const err = e as { code?: number; message?: string };
  if (err.code === 403) {
    return `Permission denied. Share the Google Sheet with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} as Editor.`;
  }
  if (err.code === 404) return "Google Sheet not found. Check the Sheet URL in Settings.";
  return err.message ?? String(e);
}
