/**
 * Brings the AI texts up to date (match summaries, write-ups, player insights, check summary).
 * Same code as after each sync and the nightly job.
 *   npm run ai:jobs              up to 25 texts
 *   npm run ai:jobs -- 60        up to 60 texts (first fill)
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const { runAiJobs } = await import("@/modules/ai/generate");
  const maxCalls = Number(process.argv[2]) || undefined;
  console.log(JSON.stringify(await runAiJobs(undefined, { maxCalls }), null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
