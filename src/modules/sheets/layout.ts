import type { sheets_v4 } from "@googleapis/sheets";

/**
 * Sheet layout shared by the Google Sheet sync and the Excel export: tabs are described as
 * tables with typed columns, and the formatting (header colours, ₹ formats, filters, green/red
 * highlights) is derived from the column kinds. Pure: no API calls here.
 */

export type Cell = string | number;

/**
 * - money: ₹ amount · in: money received (green) · out: money spent (red)
 * - due: amount owed, red when > 0, green when 0 · balance: red when > 0 (unpaid), green otherwise
 * - fee: a match-fee cell such as "Paid 50" / "Due 50" / "Part 20/50" / "Waived"
 * - status: a word from STATUS_TONE · date: "YYYY-MM-DD", written as a real date
 */
export type ColumnKind = "text" | "number" | "date" | "money" | "in" | "out" | "due" | "balance" | "fee" | "status";

export type Column = { header: string; width: number; kind?: ColumnKind; note?: string };
export type Table = { title?: string; columns: Column[]; rows: Cell[][]; totals?: Cell[] };
/** The first table is the main one and gets the filter. */
export type TabSpec = { name: string; heading: string; color: string; freezeColumns?: number; tables: Table[] };

export const PALETTE = {
  brand: "#9B1B1F",
  brandText: "#FFFFFF",
  band: "#F8F4F4",
  totals: "#F1E3E3",
  info: "#6B6B6B",
  good: { bg: "#D9F2E1", fg: "#13693A" },
  bad: { bg: "#FBDCD9", fg: "#B3261E" },
  warn: { bg: "#FFF0C7", fg: "#7A5300" },
  muted: { bg: "#ECECEC", fg: "#616161" },
} as const;

export type Tone = "good" | "bad" | "warn" | "muted";

export const STATUS_TONE: Record<string, Tone> = {
  Paid: "good",
  Clear: "good",
  Credit: "good",
  Yes: "good",
  Due: "bad",
  Unpaid: "bad",
  Partial: "warn",
  Waived: "muted",
  No: "muted",
};

/** Prefix of a fee cell → tone. */
export const FEE_TONE: [prefix: string, tone: Tone][] = [
  ["Paid", "good"],
  ["Due", "bad"],
  ["Part", "warn"],
  ["Waived", "muted"],
];

export const MONEY_KINDS: ColumnKind[] = ["money", "in", "out", "due", "balance"];
export const MONEY_FORMAT = '"₹"#,##0;-"₹"#,##0';
export const DATE_FORMAT = "dd mmm yyyy";

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/* ---------- Placement ---------- */

export type Placed = {
  table: Table;
  titleRow?: number;
  headerRow: number;
  /** First body row */
  firstRow: number;
  /** One past the last body row */
  endRow: number;
  totalsRow?: number;
};

/** Row 0 heading, row 1 "updated" note, then the main table; extra tables follow after a blank row. */
export function layoutTab(tab: TabSpec, updated: string): { grid: Cell[][]; placed: Placed[] } {
  const grid: Cell[][] = [[tab.heading], [updated]];
  const placed: Placed[] = [];
  tab.tables.forEach((table, i) => {
    let titleRow: number | undefined;
    if (i > 0) {
      grid.push([]);
      if (table.title) {
        titleRow = grid.length;
        grid.push([table.title]);
      }
    }
    const headerRow = grid.length;
    grid.push(table.columns.map((c) => c.header));
    const firstRow = grid.length;
    for (const r of table.rows) grid.push(r.map((v, c) => toSheetValue(v, table.columns[c]?.kind)));
    const endRow = grid.length;
    let totalsRow: number | undefined;
    if (table.totals) {
      totalsRow = grid.length;
      grid.push(table.totals);
    }
    placed.push({ table, titleRow, headerRow, firstRow, endRow, totalsRow });
  });
  return { grid, placed };
}

/** Days since 1899-12-30: how Sheets and Excel store dates. */
export function dateSerial(iso: string): number {
  return Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function toSheetValue(v: Cell, kind?: ColumnKind): Cell {
  if (kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dateSerial(v);
  return v;
}

/* ---------- Google Sheets requests ---------- */

type Request = sheets_v4.Schema$Request;
type Range = sheets_v4.Schema$GridRange;

function rgb(hex: string): sheets_v4.Schema$Color {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

const toneFormat = (tone: Tone): sheets_v4.Schema$CellFormat => ({
  backgroundColor: rgb(PALETTE[tone].bg),
  textFormat: { foregroundColor: rgb(PALETTE[tone].fg), bold: true },
});

function rule(range: Range, type: string, values: string[], tone: Tone): Request {
  return {
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [range],
        booleanRule: { condition: { type, values: values.map((userEnteredValue) => ({ userEnteredValue })) }, format: toneFormat(tone) },
      },
    },
  };
}

function format(range: Range, cell: sheets_v4.Schema$CellFormat, fields: string): Request {
  return { repeatCell: { range, cell: { userEnteredFormat: cell }, fields: `userEnteredFormat(${fields})` } };
}

/** Removes everything a previous sync left on a managed tab: values, formats, notes, rules, bands, filter. */
export function resetRequests(sheet: sheets_v4.Schema$Sheet): Request[] {
  const sheetId = sheet.properties!.sheetId!;
  const reqs: Request[] = [];
  if (sheet.basicFilter) reqs.push({ clearBasicFilter: { sheetId } });
  for (const b of sheet.bandedRanges ?? []) reqs.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } });
  for (let i = (sheet.conditionalFormats?.length ?? 0) - 1; i >= 0; i--) reqs.push({ deleteConditionalFormatRule: { sheetId, index: i } });
  reqs.push({ unmergeCells: { range: { sheetId } } });
  reqs.push({ updateCells: { range: { sheetId }, fields: "userEnteredValue,userEnteredFormat,note" } });
  reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS" }, properties: { pixelSize: 21 }, fields: "pixelSize" } });
  return reqs;
}

/** Formatting for one tab after its values are written. */
export function formatRequests(sheetId: number, tab: TabSpec, placed: Placed[], index: number): Request[] {
  const reqs: Request[] = [];
  const main = placed[0];
  const columnCount = Math.max(...tab.tables.map((t) => t.columns.length));

  reqs.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        index,
        tabColorStyle: { rgbColor: rgb(tab.color) },
        gridProperties: { frozenRowCount: main.headerRow + 1, frozenColumnCount: tab.freezeColumns ?? 0 },
      },
      fields: "index,tabColorStyle,gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
    },
  });

  // Heading and "updated" line
  reqs.push(format({ sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, { textFormat: { bold: true, fontSize: 16, foregroundColor: rgb(PALETTE.brand) } }, "textFormat"));
  reqs.push(format({ sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }, { textFormat: { italic: true, fontSize: 9, foregroundColor: rgb(PALETTE.info) } }, "textFormat"));
  reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 34 }, fields: "pixelSize" } });

  // Column widths: widest column definition at each position
  for (let c = 0; c < columnCount; c++) {
    const width = Math.max(...tab.tables.map((t) => t.columns[c]?.width ?? 0));
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: c, endIndex: c + 1 }, properties: { pixelSize: width * 7 + 10 }, fields: "pixelSize" } });
  }

  for (const p of placed) {
    const cols = p.table.columns;
    const span = { startColumnIndex: 0, endColumnIndex: cols.length };

    if (p.titleRow !== undefined) {
      reqs.push(format({ sheetId, startRowIndex: p.titleRow, endRowIndex: p.titleRow + 1, startColumnIndex: 0, endColumnIndex: 1 }, { textFormat: { bold: true, fontSize: 12, foregroundColor: rgb(PALETTE.brand) } }, "textFormat"));
    }

    // Header row
    const wraps = cols.some((c) => c.header.includes("\n"));
    reqs.push(
      format(
        { sheetId, startRowIndex: p.headerRow, endRowIndex: p.headerRow + 1, ...span },
        { textFormat: { bold: true, foregroundColor: rgb(PALETTE.brandText) }, verticalAlignment: "MIDDLE", horizontalAlignment: "CENTER", wrapStrategy: "WRAP" },
        "textFormat,verticalAlignment,horizontalAlignment,wrapStrategy",
      ),
    );
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: p.headerRow, endIndex: p.headerRow + 1 }, properties: { pixelSize: wraps ? 64 : 30 }, fields: "pixelSize" } });
    cols.forEach((c, i) => {
      if (!c.note) return;
      reqs.push({
        updateCells: {
          range: { sheetId, startRowIndex: p.headerRow, endRowIndex: p.headerRow + 1, startColumnIndex: i, endColumnIndex: i + 1 },
          rows: [{ values: [{ note: c.note }] }],
          fields: "note",
        },
      });
    });

    // Alternating row colours (header colour included)
    reqs.push({
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: p.headerRow, endRowIndex: Math.max(p.endRow, p.headerRow + 1), ...span },
          rowProperties: { headerColor: rgb(PALETTE.brand), firstBandColor: rgb("#FFFFFF"), secondBandColor: rgb(PALETTE.band) },
        },
      },
    });

    // Body + totals: number formats, alignment, static colours
    const lastRow = p.totalsRow !== undefined ? p.totalsRow + 1 : p.endRow;
    cols.forEach((c, i) => {
      const kind = c.kind ?? "text";
      const col = { startColumnIndex: i, endColumnIndex: i + 1 };
      const body = { sheetId, startRowIndex: p.firstRow, endRowIndex: lastRow, ...col };
      if (lastRow <= p.firstRow) return;
      if (MONEY_KINDS.includes(kind)) reqs.push(format(body, { numberFormat: { type: "CURRENCY", pattern: MONEY_FORMAT }, horizontalAlignment: "RIGHT" }, "numberFormat,horizontalAlignment"));
      if (kind === "date") reqs.push(format(body, { numberFormat: { type: "DATE", pattern: DATE_FORMAT }, horizontalAlignment: "LEFT" }, "numberFormat,horizontalAlignment"));
      if (kind === "number") reqs.push(format(body, { horizontalAlignment: "CENTER" }, "horizontalAlignment"));
      if (kind === "fee" || kind === "status") reqs.push(format(body, { horizontalAlignment: "CENTER" }, "horizontalAlignment"));
      if (kind === "in" || kind === "out") {
        reqs.push(format(body, { textFormat: { foregroundColor: rgb(PALETTE[kind === "in" ? "good" : "bad"].fg) } }, "textFormat.foregroundColor"));
      }

      // Green / red highlights on the body only (not the totals row)
      if (p.endRow <= p.firstRow) return;
      const range = { sheetId, startRowIndex: p.firstRow, endRowIndex: p.endRow, ...col };
      if (kind === "fee") for (const [prefix, tone] of FEE_TONE) reqs.push(rule(range, "TEXT_STARTS_WITH", [prefix], tone));
      if (kind === "status") for (const [word, tone] of Object.entries(STATUS_TONE)) reqs.push(rule(range, "TEXT_EQ", [word], tone));
      if (kind === "due") {
        reqs.push(rule(range, "NUMBER_GREATER", ["0"], "bad"));
        reqs.push(rule(range, "NUMBER_EQ", ["0"], "good"));
      }
      if (kind === "balance") {
        reqs.push(rule(range, "NUMBER_GREATER", ["0"], "bad"));
        reqs.push(rule(range, "NUMBER_LESS_THAN_EQ", ["0"], "good"));
      }
    });

    if (p.totalsRow !== undefined) {
      reqs.push(
        format(
          { sheetId, startRowIndex: p.totalsRow, endRowIndex: p.totalsRow + 1, ...span },
          {
            backgroundColor: rgb(PALETTE.totals),
            textFormat: { bold: true },
            borders: { top: { style: "SOLID_MEDIUM", colorStyle: { rgbColor: rgb(PALETTE.brand) } } },
          },
          "backgroundColor,textFormat.bold,borders",
        ),
      );
    }
  }

  // Filter buttons on the main table
  reqs.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: main.headerRow, endRowIndex: Math.max(main.endRow, main.headerRow + 1), startColumnIndex: 0, endColumnIndex: main.table.columns.length } } } });

  return reqs;
}
