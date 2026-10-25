/**
 * Runs the CricHeroes sync from the command line (same code as the nightly job).
 *   npm run sync
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { runCricheroesSync } = await import("@/modules/sync/sync");
  const { summary } = await runCricheroesSync("manual");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
