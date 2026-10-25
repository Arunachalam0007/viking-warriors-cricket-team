---
name: db-migration
description: Safely change the Viking Warriors database schema (Supabase Postgres via Drizzle) — new tables, columns, indexes, data backfills. Use whenever src/db/schema.ts changes.
---

# Database migrations

1. Edit `src/db/schema.ts`.
2. Generate SQL: `npm run db:generate -- --name <short_change_name>`. Review `drizzle/NNNN_<name>.sql` by hand.
3. **New table?** Append to the generated file:
   `ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;` — Supabase exposes `public` tables over REST; RLS with no policies keeps them closed.
4. Data backfills or seeds: `npm run db:generate -- --custom --name <name>` and write idempotent SQL (`ON CONFLICT DO NOTHING`, `WHERE … IS NULL`).
5. Never edit a migration that has already been applied to production; add a new one.
6. Destructive changes (drop/rename column) need two steps: deploy code that no longer uses it, then drop.
7. Test: `npm test` runs every migration on a fresh in-memory PGlite. Then `npm run db:migrate` locally (`pglite:`) and against Supabase using `DIRECT_DATABASE_URL` (port 5432, not the 6543 pooler).
8. Money stays integer rupees; timestamps `timestamptz`; dates that are calendar days (IST) are `date` strings.
