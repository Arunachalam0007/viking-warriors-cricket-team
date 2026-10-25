import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const globalForDb = globalThis as unknown as { __vwDb?: DB };

/**
 * DATABASE_URL:
 *  - Supabase Session pooler (port 5432). The Transaction pooler (6543) stalls this app's
 *    parallel page queries, so it is not used.
 *  - `pglite:./.pglite` for an embedded local Postgres with no setup
 */
function connect(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");

  if (url.startsWith("pglite:")) {
    // Embedded Postgres for local development (no Supabase needed)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle: drizzlePglite } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
    const client = new PGlite(url.slice("pglite:".length) || undefined);
    return drizzlePglite(client, { schema }) as unknown as DB;
  }

  // Small pool, idle connections released quickly: each Vercel instance holds a session-pooler connection.
  const client = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  return drizzle(client, { schema });
}

export function getDb(): DB {
  if (!globalForDb.__vwDb) globalForDb.__vwDb = connect();
  return globalForDb.__vwDb;
}

/** Tests inject an in-memory PGlite database here. */
export function setDb(db: DB) {
  globalForDb.__vwDb = db;
}

export { schema };
