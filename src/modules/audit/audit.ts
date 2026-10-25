import "server-only";
import { getDb, type Executor } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(
  entry: { actor: string; action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown },
  db: Executor = getDb(),
) {
  await db.insert(auditLog).values({
    actor: entry.actor,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
  });
}
