import "server-only";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import { settings, syncRuns } from "@/db/schema";

/**
 * CricHeroes sits behind Cloudflare, which shows a robot check to every cloud server (Vercel, GitHub
 * Actions) but lets a home connection through. So on Vercel the sync is not run in place: the
 * "Sync now" button queues a request in `sync_runs`, and the sync helper on the team's Mac
 * (scripts/sync-agent.ts) picks it up, runs it and writes the result back. The helper also runs
 * the nightly 23:30 IST sync, catching up when the Mac wakes if it was asleep.
 *
 * CRICHEROES_SYNC_VIA=agent | direct overrides the default (agent on Vercel, direct elsewhere).
 */
export function syncViaAgent() {
  const via = process.env.CRICHEROES_SYNC_VIA ?? (process.env.VERCEL ? "agent" : "direct");
  return via === "agent";
}

/** A run left "running" this long was cut off (Mac slept or the helper stopped). */
const STALE_MINUTES = 20;
/** A queued request nobody picked up in this long is dropped, so an old click never fires days later. */
const QUEUE_EXPIRY_HOURS = 6;
/** Settings row the helper touches on every check, so admins can see it is alive. */
const HEARTBEAT_KEY = "sync_agent_seen_at";

/** Queues a CricHeroes sync for the helper. A request already waiting is reused. */
export async function requestCricheroesSync(db: Executor = getDb()) {
  const [waiting] = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, "cricheroes"), inArray(syncRuns.status, ["queued", "running"])))
    .limit(1);
  if (waiting) return { runId: waiting.id, alreadyQueued: true };
  const [run] = await db.insert(syncRuns).values({ kind: "cricheroes", trigger: "manual", status: "queued" }).returning({ id: syncRuns.id });
  return { runId: run.id, alreadyQueued: false };
}

/** Takes the oldest queued request, marking it running. Safe if two helpers ever run at once. */
export async function claimQueuedSync(db: Executor = getDb()): Promise<number | null> {
  const { rows } = await db.execute<{ id: number }>(sql`
    update ${syncRuns} set status = 'running', started_at = now()
    where id = (
      select id from ${syncRuns}
      where kind = 'cricheroes' and status = 'queued'
      order by id limit 1
      for update skip locked
    )
    returning id`);
  return rows[0]?.id ?? null;
}

/** Closes runs that were cut off or never picked up. */
export async function expireStaleRuns(db: Executor = getDb()) {
  await db
    .update(syncRuns)
    .set({ status: "failed", finishedAt: sql`now()`, error: "The sync helper stopped before finishing (the Mac may have gone to sleep). It will run again." })
    .where(and(eq(syncRuns.status, "running"), lt(syncRuns.startedAt, sql`now() - make_interval(mins => ${STALE_MINUTES})`)));
  await db
    .update(syncRuns)
    .set({ status: "skipped", finishedAt: sql`now()`, error: `No sync helper picked this up within ${QUEUE_EXPIRY_HOURS} hours — is the Mac on?` })
    .where(and(eq(syncRuns.status, "queued"), lt(syncRuns.startedAt, sql`now() - make_interval(hours => ${QUEUE_EXPIRY_HOURS})`)));
}

/** The latest 23:30 IST (18:00 UTC) at or before `now`. */
export function lastNightlySlot(now = new Date()) {
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18, 0));
  if (slot > now) slot.setUTCDate(slot.getUTCDate() - 1);
  return slot;
}

/**
 * True when the nightly sync for the latest 23:30 IST slot has not succeeded yet. A failed try is
 * retried after 30 minutes, at most 3 times per night.
 */
export async function nightlyDue(db: Executor = getDb(), now = new Date()) {
  const tries = await db
    .select({ status: syncRuns.status, startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, "cricheroes"), eq(syncRuns.trigger, "cron"), gte(syncRuns.startedAt, lastNightlySlot(now))))
    .orderBy(desc(syncRuns.startedAt));
  if (tries.some((t) => t.status === "success" || t.status === "running")) return false;
  if (tries.length >= 3) return false;
  return !tries[0] || now.getTime() - tries[0].startedAt.getTime() > 30 * 60_000;
}

export async function touchAgentHeartbeat(db: Executor = getDb()) {
  const value = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key: HEARTBEAT_KEY, value, updatedBy: "sync-agent" })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
}

/** When the helper last checked in (null if never), and whether that was recent enough to call it online. */
export async function agentStatus(db: Executor = getDb()) {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, HEARTBEAT_KEY));
  const lastSeen = typeof row?.value === "string" ? new Date(row.value) : null;
  return { lastSeen, online: lastSeen !== null && Date.now() - lastSeen.getTime() < 3 * 60_000 };
}
