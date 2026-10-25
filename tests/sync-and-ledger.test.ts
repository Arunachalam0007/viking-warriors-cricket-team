import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { charges, matches, matchPlayers, payments, players } from "@/db/schema";
import { parseScorecard, parseTeamMatches, parseTeamMembers } from "@/modules/cricheroes/parser";
import {
  markChargePaid,
  markChargeUnpaid,
  reconcileMatchCharges,
  recordPayment,
  setChargeAmount,
  setChargeWaived,
} from "@/modules/finance/ledger";
import { getPlayerBalances } from "@/modules/finance/queries";
import { runCricheroesSync, type SyncSource } from "@/modules/sync/sync";
import { createTestDb } from "./helpers/test-db";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

// Offline CricHeroes: the saved pages. Matches without a saved scorecard reuse the 18 Oct one.
const fixtureSource: SyncSource = {
  teamMatches: async () => parseTeamMatches(fixture("team-matches.html")),
  teamMembers: async () => parseTeamMembers(fixture("team-members.html")),
  scorecard: async (id) =>
    parseScorecard(fixture(id === 27350036 ? "scorecard-27350036-abandoned.html" : "scorecard-27751784.html")),
};

let db: DB;
beforeEach(async () => {
  db = await createTestDb();
});

describe("CricHeroes sync", () => {
  it("imports October matches and charges ₹50 to members who played individual matches", async () => {
    const { summary } = await runCricheroesSync("manual", fixtureSource, db);

    // 7 matches from 1 Oct 2026 (6 played + 1 upcoming tournament match)
    expect(summary.matchesSeen).toBe(7);
    const all = await db.select().from(matches);
    const upcoming = all.find((m) => m.cricheroesMatchId === 27667199)!;
    expect(upcoming.kind).toBe("tournament");
    expect(upcoming.chargeable).toBe(false);

    const played = all.filter((m) => m.status === "past");
    expect(played).toHaveLength(6);
    expect(played.every((m) => m.chargeable && m.feePerPlayer === 50)).toBe(true);

    const fees = await db.select().from(charges);
    expect(fees.length).toBeGreaterThan(0);
    expect(fees.every((c) => c.amount === 50 && c.kind === "match_fee")).toBe(true);

    // Guests (players not in the CricHeroes squad) are never charged
    const guests = await db.select().from(players).where(eq(players.isMember, false));
    const guestIds = new Set(guests.map((g) => g.id));
    expect(fees.some((c) => guestIds.has(c.playerId))).toBe(false);

    // Running the sync again does not double-charge
    await runCricheroesSync("manual", fixtureSource, db);
    expect((await db.select().from(charges)).length).toBe(fees.length);
  });

  it("respects admin locks on matches", async () => {
    await runCricheroesSync("manual", fixtureSource, db);
    const [m] = await db.select().from(matches).where(eq(matches.cricheroesMatchId, 27751784));
    await db.update(matches).set({ chargeable: false, financeLocked: true }).where(eq(matches.id, m.id));
    await reconcileMatchCharges(db, m.id);
    expect((await db.select().from(charges).where(eq(charges.matchId, m.id))).length).toBe(0);

    await runCricheroesSync("manual", fixtureSource, db);
    const [after] = await db.select().from(matches).where(eq(matches.id, m.id));
    expect(after.chargeable).toBe(false);
    expect((await db.select().from(charges).where(eq(charges.matchId, m.id))).length).toBe(0);
  });

  it("removes a charge when admin marks a player as not played", async () => {
    await runCricheroesSync("manual", fixtureSource, db);
    const [c] = await db.select().from(charges).limit(1);
    await db
      .update(matchPlayers)
      .set({ played: false, adminLocked: true })
      .where(and(eq(matchPlayers.matchId, c.matchId!), eq(matchPlayers.playerId, c.playerId)));
    await reconcileMatchCharges(db, c.matchId!);
    expect((await db.select().from(charges).where(eq(charges.id, c.id))).length).toBe(0);
  });
});

describe("ledger", () => {
  async function seedPlayerWithCharges(n: number) {
    const [p] = await db.insert(players).values({ name: "Test Player", isMember: true }).returning();
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const [c] = await db
        .insert(charges)
        .values({
          playerId: p.id,
          kind: "adjustment",
          chargeDate: `2026-10-0${i + 1}`,
          description: `Fee ${i + 1}`,
          amount: 50,
        })
        .returning();
      ids.push(c.id);
    }
    return { playerId: p.id, chargeIds: ids };
  }

  it("lump payment settles oldest charges first and keeps the rest as credit", async () => {
    const { playerId } = await seedPlayerWithCharges(3);
    await recordPayment(db, playerId, 120, { actor: "test" });
    const [bal] = (await getPlayerBalances(db)).filter((b) => b.playerId === playerId);
    expect(bal.charged).toBe(150);
    expect(bal.paid).toBe(120);
    expect(bal.balance).toBe(30);
  });

  it("credit is applied automatically to new charges", async () => {
    const { playerId } = await seedPlayerWithCharges(1);
    await recordPayment(db, playerId, 100, { actor: "test" });
    const [c] = await db
      .insert(charges)
      .values({ playerId, kind: "adjustment", chargeDate: "2026-10-09", description: "Later", amount: 50 })
      .returning();
    const { applyCredit } = await import("@/modules/finance/ledger");
    await applyCredit(db, playerId);
    const [bal] = (await getPlayerBalances(db)).filter((b) => b.playerId === playerId);
    expect(bal.balance).toBe(0);
    expect(c.id).toBeTruthy();
  });

  it("mark paid / unpaid on a single charge", async () => {
    const { playerId, chargeIds } = await seedPlayerWithCharges(2);
    await markChargePaid(db, chargeIds[1], { actor: "test", mode: "cash" });
    let [bal] = (await getPlayerBalances(db)).filter((b) => b.playerId === playerId);
    expect(bal.balance).toBe(50);
    await markChargeUnpaid(db, chargeIds[1]);
    [bal] = (await getPlayerBalances(db)).filter((b) => b.playerId === playerId);
    expect(bal.balance).toBe(100);
    expect((await db.select().from(payments)).length).toBe(0);
  });

  it("waiving and custom amounts change what is owed", async () => {
    const { playerId, chargeIds } = await seedPlayerWithCharges(2);
    await setChargeWaived(db, chargeIds[0], true);
    await setChargeAmount(db, chargeIds[1], 30);
    const [bal] = (await getPlayerBalances(db)).filter((b) => b.playerId === playerId);
    expect(bal.charged).toBe(30);
    expect(bal.balance).toBe(30);
  });
});
