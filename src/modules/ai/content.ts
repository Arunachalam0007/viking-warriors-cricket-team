import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import { aiContent } from "@/db/schema";
import type { Lang } from "./prompts";

export type AiKind = "match_summary" | "period_writeup" | "player_insight" | "sync_check";

/** Stable hash of the facts a text was written from (key order does not matter). */
export function factsHash(facts: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)])) : v;
  return createHash("sha256").update(JSON.stringify(stable(facts))).digest("hex").slice(0, 16);
}

export type AiText = { lang: Lang; title: string | null; body: string; model: string | null; edited: boolean; updatedAt: Date };

/** Both languages of one subject, for the page that shows it (hidden texts are left out). */
export async function getAiTexts(db: Executor, kind: AiKind, subjectId: string): Promise<AiText[]> {
  const rows = await db
    .select()
    .from(aiContent)
    .where(and(eq(aiContent.kind, kind), eq(aiContent.subjectId, subjectId), eq(aiContent.hidden, false)));
  return rows.map((r) => ({ lang: r.lang as Lang, title: r.title, body: r.body, model: r.model, edited: r.edited, updatedAt: r.updatedAt }));
}

/** Returns the stored rows of a subject, keyed by language (for deciding whether to regenerate). */
export async function storedRows(db: Executor, kind: AiKind, subjectIds: string[]) {
  if (subjectIds.length === 0) return [];
  return db.select().from(aiContent).where(and(eq(aiContent.kind, kind), inArray(aiContent.subjectId, subjectIds)));
}

/** Saves a generated text unless an admin edited it. */
export async function saveAiText(
  db: Executor,
  row: { kind: AiKind; subjectId: string; lang: Lang; title: string | null; body: string; factsHash: string; provider: string | null; model: string | null },
) {
  await db
    .insert(aiContent)
    .values(row)
    .onConflictDoUpdate({
      target: [aiContent.kind, aiContent.subjectId, aiContent.lang],
      set: { title: row.title, body: row.body, factsHash: row.factsHash, provider: row.provider, model: row.model, updatedAt: sql`now()` },
      setWhere: eq(aiContent.edited, false),
    });
}

export async function listAiContent(db: Executor = getDb(), limit = 200) {
  return db.select().from(aiContent).orderBy(desc(aiContent.updatedAt)).limit(limit);
}
