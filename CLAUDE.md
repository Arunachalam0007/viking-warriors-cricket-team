@AGENTS.md

# Viking Warriors Team Portal

Next.js 16 (App Router) + Supabase Postgres (Drizzle ORM) + Supabase Auth. Public team site and a login-protected admin portal for match-fee finance. Data comes from CricHeroes (team 2921535) via a nightly sync; finance is mirrored one-way to Google Sheets.

Full docs: `docs/index.html` (architecture) and `docs/pages/*.html` (one per page/feature).

## Commands
- `npm run dev` — dev server. Local DB without Supabase: `DATABASE_URL="pglite:./.pglite"` and `DEV_ADMIN_EMAIL=...` in `.env.local`
- `npm run db:migrate` — apply `drizzle/*.sql`; `npm run db:generate -- --name <change>` after editing `src/db/schema.ts`
- `npm run sync` — run the CricHeroes sync locally (same code as the nightly cron)
- `npm test` — vitest (parser against saved CricHeroes pages in `tests/fixtures`, sync + ledger on in-memory PGlite)
- `npm run typecheck`, `npm run lint`

## Architecture rules (do not break)
1. **Postgres is the single source of truth.** CricHeroes feeds it; Google Sheets and Excel are generated copies. Never read CricHeroes on page views.
2. **Admin edits win over the sync.** `matches.finance_locked`, `match_players.admin_locked`, `charges.admin_locked`, `players.name_locked` must be respected by any sync code.
3. **Money is whole rupees (integer).** No floats. Balance = Σ non-waived charges − Σ payments. Payments settle charges through `payment_allocations`; unallocated money is credit applied by `applyCredit()`.
4. **Every admin mutation goes through `adminAction()`** (`src/lib/action.ts`): admin check, zod validation, one transaction, `audit()` entry, `refresh()`, debounced Google Sheet sync.
5. **Fee rule** (`src/modules/finance/rules.ts`): ₹`match_fee` per *member* for *past* (completed or abandoned) *individual* matches on/after `finance_start_date`. Tournaments, upcoming matches and guests are never auto-charged.
6. Dates: store UTC, group by **Asia/Kolkata** (`src/lib/dates.ts`).
7. RLS is enabled on every table with no policies (Supabase REST is closed); the server connects as the DB owner. New tables need `ENABLE ROW LEVEL SECURITY` in their migration.
8. Correlated SQL subqueries must use explicit table-qualified names (drizzle drops the table prefix in single-table selects).
9. **Every admin `page.tsx` calls `await requireAdmin()` first.** Layouts and pages render in parallel, so the check in `admin/layout.tsx` alone leaks page data. The proxy redirect is only optimistic.
10. Phone numbers, payments screenshots, audit log, expenses/income and cash holders are admin-only.

## Layout
- `src/modules/<feature>/` — `queries.ts` (reads), `actions.ts` ("use server" mutations), domain logic
- `src/app/(app)/` — public pages; `src/app/(app)/admin/` — admin pages (layout calls `requireAdmin()`)
- `src/app/api/cron/nightly` — Vercel Cron 18:00 UTC (23:30 IST); `src/app/api/export/finance` — Excel
- `src/modules/cricheroes/parser.ts` — the only place that knows CricHeroes page structure

## Phase 2 (not built yet — wait for the owner)
AI features and chatbot, WhatsApp reminders (rows go to `notification_outbox`).
