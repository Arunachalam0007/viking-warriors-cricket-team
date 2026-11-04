import "server-only";
import { createHash } from "node:crypto";
import type { Executor } from "@/db";
import { aiUsage } from "@/db/schema";

/*
 * Public questions are counted (one ai_usage row with model = "question") for Admin → AI, but not
 * limited: when Gemini's free quota runs out the chat moves to Groq (models.ts). Visitors are a
 * salted hash of their IP address, never the address itself.
 */

export function visitorId(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`${process.env.CRON_SECRET ?? "vw"}:${ip}`).digest("hex").slice(0, 24);
}

export async function countQuestion(db: Executor, client: string) {
  await db.insert(aiUsage).values({ feature: "chat_public", provider: "-", model: "question", ok: true, client });
}
