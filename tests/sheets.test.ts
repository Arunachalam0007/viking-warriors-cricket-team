import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScorecard, parseTeamMatches, parseTeamMembers } from "@/modules/cricheroes/parser";
import { buildTabs } from "@/modules/sheets/sheets";
import { runCricheroesSync } from "@/modules/sync/sync";
import { createTestDb } from "./helpers/test-db";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("Google Sheet tabs", () => {
  it("builds Summary, a month tab per month and ledger tabs", async () => {
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
    const tabs = await buildTabs(db);
    expect([...tabs.keys()]).toEqual(expect.arrayContaining(["Summary", "Collections", "Payments", "Expenses", "Income"]));
    const oct = [...tabs.entries()].find(([k]) => /Oct/.test(k))!;
    expect(oct).toBeTruthy();
    const grid = oct[1];
    // header rows: title, dates, opponents, venues; then one row per charged player
    expect(grid[1][0]).toBe("S.No");
    expect(grid[1].length).toBe(2 + 6 + 4); // 6 chargeable October matches
    const totalRow = grid[grid.length - 1];
    expect(totalRow[1]).toBe("Total");
    expect(totalRow[totalRow.length - 1]).toBeGreaterThan(0);
  });
});
