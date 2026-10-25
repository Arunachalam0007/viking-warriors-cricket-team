/**
 * Applies SQL migrations in ./drizzle.
 *   npm run db:migrate          (uses DIRECT_DATABASE_URL, else DATABASE_URL)
 * Works for Supabase Postgres and for local `pglite:` databases.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (and DIRECT_DATABASE_URL for Supabase) in .env.local");

  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(url.slice("pglite:".length));
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    await client.close();
  } else {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    await client.end();
  }
  console.log("Migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
