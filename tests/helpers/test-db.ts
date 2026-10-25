import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { join } from "node:path";
import { setDb, type DB } from "@/db";
import * as schema from "@/db/schema";

/** Fresh in-memory Postgres with all migrations applied. */
export async function createTestDb(): Promise<DB> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
  const typed = db as unknown as DB;
  setDb(typed);
  return typed;
}
