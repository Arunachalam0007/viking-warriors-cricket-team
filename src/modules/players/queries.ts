import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import { players, type Player } from "@/db/schema";

export function playerPhoto(p: Pick<Player, "photoUrl" | "chPhotoUrl">) {
  return p.photoUrl ?? p.chPhotoUrl ?? null;
}

export async function listPlayers(db: Executor = getDb(), opts: { membersOnly?: boolean } = {}) {
  const rows = await db
    .select()
    .from(players)
    .where(opts.membersOnly ? eq(players.isMember, true) : undefined)
    .orderBy(desc(players.isMember), desc(players.isActive), asc(players.name));
  return rows;
}

export async function getPlayer(db: Executor, id: string) {
  const [row] = await db.select().from(players).where(eq(players.id, id));
  return row ?? null;
}
