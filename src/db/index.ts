import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const globalForDb = globalThis as unknown as { __vwDb?: DB };

/**
 * DATABASE_URL:
 *  - Supabase Transaction pooler (port 6543), driven by node-postgres. Serverless-friendly: many
 *    Vercel instances share Supabase's pool. (The `postgres` driver stalled on this pooler, and the
 *    Session pooler caps clients at 15, which Vercel instances exhaust.)
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

  // Small pool per instance, idle connections released quickly. Encrypted to Supabase; its pooler
  // certificate is not in Node's default CA list, hence rejectUnauthorized: false.
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  return drizzle(pool, { schema });
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
