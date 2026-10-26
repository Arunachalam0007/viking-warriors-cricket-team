import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { syncRuns } from "@/db/schema";
import { parseScorecard, parseTeamMatches, parseTeamMembers } from "@/modules/cricheroes/parser";
import {
  agentStatus,
  claimQueuedSync,
  expireStaleRuns,
  lastNightlySlot,
  nightlyDue,
  requestCricheroesSync,
  touchAgentHeartbeat,
} from "@/modules/sync/queue";
import { runCricheroesSync, type SyncSource } from "@/modules/sync/sync";
import { createTestDb } from "./helpers/test-db";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const fixtureSource: SyncSource = {
  teamMatches: async () => parseTeamMatches(fixture("team-matches.html")),
  teamMembers: async () => parseTeamMembers(fixture("team-members.html")),
  scorecard: async () => parseScorecard(fixture("scorecard-27751784.html")),
};

let db: DB;
beforeEach(async () => {
  db = await createTestDb();
});

describe("Sync queue (live site → sync helper on the Mac)", () => {
  it("queues one request, reuses it on repeat clicks, and the helper fulfils it", async () => {
    const first = await requestCricheroesSync(db);
    const again = await requestCricheroesSync(db);
    expect(again).toEqual({ runId: first.runId, alreadyQueued: true });

    const claimed = await claimQueuedSync(db);
    expect(claimed).toBe(first.runId);
    expect(await claimQueuedSync(db)).toBeNull();

    const { runId } = await runCricheroesSync("manual", fixtureSource, db, claimed!);
    expect(runId).toBe(first.runId);
    const runs = await db.select().from(syncRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "success", trigger: "manual" });
  });

  it("fails runs cut off mid-way and drops requests nobody picked up", async () => {
    const [running] = await db
      .insert(syncRuns)
      .values({ kind: "cricheroes", trigger: "manual", status: "running", startedAt: new Date(Date.now() - 30 * 60_000) })
      .returning();
    const [queued] = await db
      .insert(syncRuns)
      .values({ kind: "cricheroes", trigger: "manual", status: "queued", startedAt: new Date(Date.now() - 7 * 3600_000) })
      .returning();
    await expireStaleRuns(db);
    const [r] = await db.select().from(syncRuns).where(eq(syncRuns.id, running.id));
    const [q] = await db.select().from(syncRuns).where(eq(syncRuns.id, queued.id));
    expect(r.status).toBe("failed");
    expect(q.status).toBe("skipped");
  });

  it("finds the latest 23:30 IST slot", () => {
    // 26 Oct 22:00 IST → slot is 25 Oct 23:30 IST; 26 Oct 23:45 IST → 26 Oct 23:30 IST
    expect(lastNightlySlot(new Date("2026-10-26T16:30:00Z")).toISOString()).toBe("2026-10-25T18:00:00.000Z");
    expect(lastNightlySlot(new Date("2026-10-26T18:15:00Z")).toISOString()).toBe("2026-10-26T18:00:00.000Z");
  });

  it("runs the nightly sync once per night, retrying a failure after 30 minutes", async () => {
    const at = (iso: string) => new Date(iso);
    expect(await nightlyDue(db, at("2026-10-26T18:05:00Z"))).toBe(true);

    await db.insert(syncRuns).values({ kind: "cricheroes", trigger: "cron", status: "failed", startedAt: at("2026-10-26T18:05:00Z") });
    expect(await nightlyDue(db, at("2026-10-26T18:20:00Z"))).toBe(false);
    expect(await nightlyDue(db, at("2026-10-26T18:40:00Z"))).toBe(true);

    await db.insert(syncRuns).values({ kind: "cricheroes", trigger: "cron", status: "success", startedAt: at("2026-10-26T18:40:00Z") });
    expect(await nightlyDue(db, at("2026-10-27T03:00:00Z"))).toBe(false);
    // The next night is due again
    expect(await nightlyDue(db, at("2026-10-27T18:01:00Z"))).toBe(true);
  });

  it("reports the helper online after a heartbeat", async () => {
    expect(await agentStatus(db)).toEqual({ lastSeen: null, online: false });
    await touchAgentHeartbeat(db);
    expect((await agentStatus(db)).online).toBe(true);
  });
});
