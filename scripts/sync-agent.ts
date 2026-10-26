/**
 * The CricHeroes sync helper. CricHeroes refuses cloud servers (Vercel, GitHub Actions) but not a
 * home connection, so this runs on the team's Mac and does the syncing the live site cannot:
 *   - "Sync CricHeroes now" clicks on the live site (queued in sync_runs), within ~30 seconds
 *   - the nightly 23:30 IST sync, or as soon as the Mac wakes if it was asleep then
 * Each sync is followed by a Google Sheet rebuild, as on the live site.
 *
 *   npm run sync:agent            keep running (what launchd starts; see scripts/sync-agent/)
 *   npm run sync:agent -- --once  one check, then exit
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const POLL_MS = 30_000;

const log = (...args: unknown[]) => console.log(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), "|", ...args);

async function main() {
  const { getDb } = await import("@/db");
  const queue = await import("@/modules/sync/queue");
  const { runCricheroesSync } = await import("@/modules/sync/sync");
  const { syncSheet } = await import("@/modules/sheets/sheets");
  const db = getDb();

  async function sync(trigger: "manual" | "cron", queuedRunId?: number) {
    try {
      const { runId, summary } = await runCricheroesSync(trigger, undefined, db, queuedRunId);
      log(`CricHeroes ${trigger} sync #${runId}: ${summary.matchesSeen} matches (${summary.matchesNew} new), ${summary.scorecardsFetched} scorecards, ${summary.warnings.length} warnings`);
    } catch (e) {
      log(`CricHeroes ${trigger} sync failed:`, (e as Error).message);
    }
    const sheets = await syncSheet(trigger, db).catch((e: Error) => ({ status: "failed", reason: e.message }));
    log("Google Sheet:", sheets.status, "reason" in sheets && sheets.reason ? sheets.reason : "");
  }

  async function check() {
    await queue.touchAgentHeartbeat(db);
    await queue.expireStaleRuns(db);
    for (let id = await queue.claimQueuedSync(db); id; id = await queue.claimQueuedSync(db)) {
      log(`Picked up "Sync now" request #${id}`);
      await sync("manual", id);
    }
    if (await queue.nightlyDue(db)) {
      log("Running the nightly sync");
      await sync("cron");
    }
  }

  if (process.argv.includes("--once")) {
    await check();
    process.exit(0);
  }

  log(`Sync helper started, checking every ${POLL_MS / 1000}s`);
  for (;;) {
    // A dropped connection (Wi-Fi, sleep) is logged and retried on the next check
    await check().catch((e: Error) => log("Check failed:", e.message));
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
