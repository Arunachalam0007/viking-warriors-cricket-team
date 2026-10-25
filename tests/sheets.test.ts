import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScorecard, parseTeamMatches, parseTeamMembers } from "@/modules/cricheroes/parser";
import { dateSerial, formatRequests, layoutTab, resetRequests, type TabSpec } from "@/modules/sheets/layout";
import { buildTabs } from "@/modules/sheets/sheets";
import { runCricheroesSync } from "@/modules/sync/sync";
import { createTestDb } from "./helpers/test-db";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

async function syncedTabs() {
  const db = await createTestDb();
  await runCricheroesSync(
    "manual",
    {
      teamMatches: async () => parseTeamMatches(fixture("team-matches.html")),
      teamMembers: async () => parseTeamMembers(fixture("team-members.html")),
      scorecard: async () => parseScorecard(fixture("scorecard-27751784.html")),
    },
    db,
  );
  return buildTabs(db);
}

describe("Google Sheet tabs", () => {
  it("builds Summary, a month tab per month and ledger tabs", async () => {
    const tabs = await syncedTabs();
    const names = tabs.map((t) => t.name);
    expect(names[0]).toBe("Summary");
    expect(names).toEqual(expect.arrayContaining(["Collections", "Payments", "Expenses", "Income"]));

    const oct = tabs.find((t) => /Oct/.test(t.name))!;
    const table = oct.tables[0];
    // S.No, Player, 6 chargeable October matches, Other, Charged, Paid, Due, Status
    expect(table.columns.map((c) => c.header).slice(0, 2)).toEqual(["S.No", "Player"]);
    expect(table.columns.length).toBe(2 + 6 + 5);
    expect(table.columns[2].header).toMatch(/^\d{2} Oct\nvs /);
    expect(table.rows.every((r) => r[r.length - 1] === "Unpaid" || r[r.length - 1] === "Clear")).toBe(true);
    expect(table.totals![1]).toBe("Total");
    expect(Number(table.totals![table.totals!.length - 2])).toBeGreaterThan(0);
  });

  it("lays out one header row per table, with filters and green/red rules", async () => {
    const summary = (await syncedTabs())[0];
    const { grid, placed } = layoutTab(summary, "Updated now");
    expect(grid[0][0]).toMatch(/finance summary/);
    expect(grid[placed[0].headerRow][0]).toBe("Player");
    expect(placed[1].titleRow).toBeDefined();

    const reqs = formatRequests(7, summary, placed, 0);
    const filter = reqs.find((r) => r.setBasicFilter)!.setBasicFilter!.filter!.range!;
    expect(filter.startRowIndex).toBe(placed[0].headerRow);
    expect(filter.endRowIndex).toBe(placed[0].endRow);
    const rules = reqs.filter((r) => r.addConditionalFormatRule).map((r) => r.addConditionalFormatRule!.rule!.booleanRule!.condition!);
    expect(rules).toEqual(expect.arrayContaining([expect.objectContaining({ type: "NUMBER_GREATER" }), expect.objectContaining({ type: "TEXT_EQ" })]));
    expect(reqs.filter((r) => r.addBanding)).toHaveLength(3);
  });

  it("writes dates as real date serials and clears old rules before re-formatting", () => {
    expect(dateSerial("1899-12-31")).toBe(1);
    expect(dateSerial("2026-10-04")).toBe(46299);

    const tab: TabSpec = { name: "Payments", heading: "Payments", color: "#000000", tables: [{ columns: [{ header: "Date", width: 12, kind: "date" }], rows: [["2026-10-04"]] }] };
    expect(layoutTab(tab, "").grid[3][0]).toBe(46299);

    const reset = resetRequests({ properties: { sheetId: 3 }, basicFilter: {}, bandedRanges: [{ bandedRangeId: 11 }], conditionalFormats: [{}, {}] });
    expect(reset[0]).toEqual({ clearBasicFilter: { sheetId: 3 } });
    expect(reset[1]).toEqual({ deleteBanding: { bandedRangeId: 11 } });
    // highest index first so the remaining indexes stay valid
    expect(reset.slice(2, 4)).toEqual([{ deleteConditionalFormatRule: { sheetId: 3, index: 1 } }, { deleteConditionalFormatRule: { sheetId: 3, index: 0 } }]);
  });
});
