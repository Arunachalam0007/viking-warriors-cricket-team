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
 *  - Supabase pooler (transaction mode, port 6543) in production
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

  const client = postgres(url, { prepare: false, max: 5 });
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
