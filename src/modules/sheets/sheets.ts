import "server-only";
import { auth, sheets as sheetsApi, type sheets_v4 } from "@googleapis/sheets";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { cashHolders, collections, expenses, income, matches, payments, players, syncRuns } from "@/db/schema";
import { formatMonth, istDate, monthsBetween, todayIst } from "@/lib/dates";
import { getChargeRows, getPlayerBalances, getRevenueSummary, type ChargeRow } from "@/modules/finance/queries";
import { getSettings, sheetIdFromUrl } from "@/modules/settings/settings";

type Grid = (string | number)[][];

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

/* ---------- Tab builders (pure data → grid) ---------- */

const cellFor = (c: ChargeRow) => {
  if (c.waived) return "Waived";
  if (c.status === "paid") return `Paid ${c.amount}`;
  if (c.status === "partial") return `Part ${c.paid}/${c.amount}`;
  return `Due ${c.amount}`;
};

/** Players down, matches across — same shape as the team's old "Normal match amount split" sheet. */
function monthGrid(month: string, monthMatches: { id: string; date: string; opponent: string; ground: string | null }[], rows: ChargeRow[]): Grid {
  const fees = rows.filter((r) => r.kind === "match_fee");
  const others = rows.filter((r) => r.kind !== "match_fee");
  const playerNames = [...new Map(rows.map((r) => [r.playerId, r.playerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const header1: (string | number)[] = ["S.No", "Player", ...monthMatches.map((m) => m.date), "Other charges", "Charged", "Paid", "Due"];
  const header2: (string | number)[] = ["", "", ...monthMatches.map((m) => `vs ${m.opponent}`), "", "", "", ""];
  const header3: (string | number)[] = ["", "", ...monthMatches.map((m) => (m.ground ? `Venue: ${m.ground}` : "")), "", "", "", ""];
  const grid: Grid = [[`${formatMonth(month)} — match fees`], header1, header2, header3];

  let i = 0;
  for (const [playerId, name] of playerNames) {
    const mine = rows.filter((r) => r.playerId === playerId);
    const cells = monthMatches.map((m) => {
      const c = fees.find((f) => f.playerId === playerId && f.matchId === m.id);
      return c ? cellFor(c) : "";
    });
    const other = others.filter((r) => r.playerId === playerId).reduce((s, r) => s + (r.waived ? 0 : r.amount), 0);
    grid.push([
      ++i,
      name,
      ...cells,
      other,
      mine.reduce((s, r) => s + (r.waived ? 0 : r.amount), 0),
      mine.reduce((s, r) => s + r.paid, 0),
      mine.reduce((s, r) => s + r.due, 0),
    ]);
  }
  const total = (k: "amount" | "paid" | "due") => rows.reduce((s, r) => s + (k === "amount" && r.waived ? 0 : r[k]), 0);
  grid.push([]);
  grid.push(["", "Total", ...monthMatches.map(() => ""), "", total("amount"), total("paid"), total("due")]);
  return grid;
}

export async function buildTabs(db: DB): Promise<Map<string, Grid>> {
  const cfg = await getSettings(db);
  const tabs = new Map<string, Grid>();
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  // Summary
  const balances = await getPlayerBalances(db);
  const revenue = await getRevenueSummary(db);
  const summary: Grid = [
    [`${cfg.team_name} — finance summary`, "", "", "", `Updated ${now} IST by the team portal. Do not edit: changes are overwritten.`],
    [],
    ["Player", "Matches charged", "Charged", "Paid", "Balance (+ owes / − credit)"],
    ...balances.filter((b) => b.charged || b.paid).map((b) => [b.name, b.matchFees, b.charged, b.paid, b.balance]),
    [],
    ["Team totals"],
    ["Total charged", revenue.charged],
    ["Collected from players", revenue.collected],
    ["Outstanding dues", revenue.outstanding],
    ["Other income", revenue.income],
    ["Expenses", revenue.expenses],
    ["Fund balance", revenue.fundBalance],
    [],
    ["Cash holder", "Received", "Income", "Spent", "In hand"],
    ...revenue.holders.map((h) => [h.name, h.received, h.income, h.spent, h.balance]),
  ];
  tabs.set("Summary", summary);

  // One tab per month since finance start
  const months = monthsBetween(cfg.finance_start_date.slice(0, 7), todayIst().slice(0, 7));
  for (const month of months) {
    const rows = await getChargeRows(db, { month });
    const allMatches = await db
      .select({ id: matches.id, startTime: matches.startTime, opponent: matches.opponentName, ground: matches.ground })
      .from(matches)
      .where(and(eq(matches.chargeable, true), sql`to_char(${matches.startTime} at time zone 'Asia/Kolkata', 'YYYY-MM') = ${month}`))
      .orderBy(asc(matches.startTime));
    const monthMatches = allMatches.map((m) => ({ id: m.id, date: istDate(m.startTime), opponent: m.opponent, ground: m.ground }));
    tabs.set(formatMonth(month, true), monthGrid(month, monthMatches, rows));
  }

  // Collections (tournament shares, monthly fees…)
  const colls = await db.select().from(collections).orderBy(desc(collections.dueOn));
  const collRows = await getChargeRows(db, { kind: "collection" });
  const collGrid: Grid = [["Collection", "Type", "Due on", "Player", "Amount", "Paid", "Due", "Status"]];
  for (const c of colls) {
    for (const r of collRows.filter((x) => x.collectionId === c.id)) {
      collGrid.push([c.title, c.kind, c.dueOn, r.playerName, r.amount, r.paid, r.due, r.status]);
    }
  }
  tabs.set("Collections", collGrid);

  const holderName = new Map((await db.select().from(cashHolders)).map((h) => [h.id, h.name]));
  const pays = await db
    .select({ p: payments, name: players.name })
    .from(payments)
    .innerJoin(players, eq(players.id, payments.playerId))
    .orderBy(desc(payments.paidOn));
  tabs.set("Payments", [
    ["Date", "Player", "Amount", "Mode", "Received by", "Reference", "Note"],
    ...pays.map(({ p, name }) => [p.paidOn, name, p.amount, p.mode, p.holderId ? holderName.get(p.holderId) ?? "" : "", p.reference ?? "", p.note ?? ""]),
  ]);

  const exp = await db.select().from(expenses).orderBy(desc(expenses.spentOn));
  tabs.set("Expenses", [
    ["Date", "Category", "Description", "Amount", "Paid from", "Paid by", "Mode"],
    ...exp.map((e) => [e.spentOn, e.category, e.description, e.amount, e.holderId ? holderName.get(e.holderId) ?? "" : "", e.paidBy ?? "", e.mode]),
  ]);

  const inc = await db.select().from(income).orderBy(desc(income.receivedOn));
  tabs.set("Income", [
    ["Date", "Category", "Description", "Amount", "Received by", "Mode"],
    ...inc.map((i) => [i.receivedOn, i.category, i.description, i.amount, i.holderId ? holderName.get(i.holderId) ?? "" : "", i.mode]),
  ]);

  return tabs;
}

/* ---------- Writer ---------- */

/** Rewrites every managed tab. Tabs the app does not manage are left alone. */
export async function writeSheet(db: DB = getDb()) {
  const cfg = await getSettings(db);
  const spreadsheetId = sheetIdFromUrl(cfg.google_sheet_url);
  if (!spreadsheetId) throw new Error("Google Sheet URL is not set in Settings");
  if (!sheetsConfigured()) throw new Error("Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)");

  const api = client();
  const tabs = await buildTabs(db);

  const meta = await api.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const existing = new Map((meta.data.sheets ?? []).map((s) => [s.properties!.title!, s.properties!.sheetId!]));

  const missing = [...tabs.keys()].filter((t) => !existing.has(t));
  if (missing.length) {
    const res = await api.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
    });
    for (const reply of res.data.replies ?? []) {
      const p = reply.addSheet?.properties;
      if (p?.title) existing.set(p.title, p.sheetId!);
    }
  }

  const q = (t: string) => `'${t.replace(/'/g, "''")}'`;
  await api.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: [...tabs.keys()].map((t) => `${q(t)}!A:ZZ`) } });
  await api.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [...tabs.entries()].map(([t, grid]) => ({ range: `${q(t)}!A1`, values: grid })),
    },
  });

  // Bold, frozen header rows
  await api.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [...tabs.keys()].flatMap((t) => {
        const sheetId = existing.get(t)!;
        const headerRows = t === "Summary" ? 1 : /^\w{3,4} \d{4}$/.test(t) ? 4 : 1;
        return [
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: headerRows } }, fields: "gridProperties.frozenRowCount" } },
          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: headerRows }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
        ];
      }),
    },
  });

  return { spreadsheetId, tabs: [...tabs.keys()] };
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
