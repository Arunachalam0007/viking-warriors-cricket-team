import { NextResponse, type NextRequest } from "next/server";
import { syncSheet } from "@/modules/sheets/sheets";
import { syncViaAgent } from "@/modules/sync/queue";
import { runCricheroesSync } from "@/modules/sync/sync";

// Vercel Cron: 18:00 UTC = 23:30 IST (see vercel.json). Hobby plan runs it within that hour.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result: Record<string, unknown> = {};
  if (syncViaAgent()) {
    // CricHeroes refuses Vercel; the sync helper on the team's Mac runs the nightly sync (queue.ts)
    result.cricheroes = { skipped: "run by the sync helper" };
  } else {
    try {
      result.cricheroes = (await runCricheroesSync("cron")).summary;
    } catch (e) {
      result.cricheroes = { error: (e as Error).message };
    }
  }
  // The sheet is rebuilt nightly even if CricHeroes failed, so manual edits made in the app are mirrored.
  result.sheets = await syncSheet("cron");

  const failed = typeof result.cricheroes === "object" && result.cricheroes !== null && "error" in result.cricheroes;
  return NextResponse.json(result, { status: failed ? 500 : 200 });
}
