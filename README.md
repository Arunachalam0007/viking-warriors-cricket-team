# Viking Warriors Team Portal

Public site and admin portal for the **Viking Warriors** cricket team ([CricHeroes team 2921535](https://cricheroes.com/team-profile/2921535/Viking-Warriors)).

- **Public:** dashboard, player profiles, weekly / monthly / season leaderboards, matches, match-fee finance with Excel export, reports.
- **Admin (login):** match fees per match and per player (paid / not paid / waived / custom amount), payments, tournament & monthly collections, expenses & income, cash holders, revenue overview, player photos / phones / names, settings, sync logs and audit trail.
- **Nightly sync** from CricHeroes at 23:30 IST. Finance is mirrored month-wise into Google Sheets.

Docs: open [`docs/index.html`](docs/index.html) in a browser.

## Stack (all free tiers)
Next.js 16 · TypeScript · Tailwind + shadcn/ui · Supabase Postgres + Auth + Storage · Drizzle ORM · Vercel (hosting + cron) · Google Sheets API · ExcelJS.

## Run locally (no accounts needed)
```bash
npm install
cp .env.example .env.local
# in .env.local set:
#   DATABASE_URL="pglite:./.pglite"
#   DEV_ADMIN_EMAIL="arunsha0007@gmail.com"
npm run db:migrate
npm run sync        # pulls real data from CricHeroes
npm run dev         # http://localhost:3000
```

## Production setup
1. **Supabase**: create a project. Copy the **Transaction pooler** connection string (port 6543) into `DATABASE_URL` and the **Session pooler** one (port 5432) into `DIRECT_DATABASE_URL`, the project URL, publishable key and secret key into `.env.local`.
   - Auth → URL configuration: Site URL = your Vercel URL; add `https://<your-domain>/auth/callback` to redirect URLs.
2. `npm run db:migrate` — creates tables, enables RLS, seeds admin `arunsha0007@gmail.com` and cash holder `Rahul`.
3. **Google Sheets**: Google Cloud → enable *Google Sheets API* → create a service account → JSON key. Put `client_email` / `private_key` in env. **Share the sheet with the service account email as Editor.**
4. **Vercel**: import the GitHub repo, add every variable from `.env.example`, deploy. `vercel.json` sets region `sin1` (next to the Supabase project in Singapore; change both together) and the nightly cron (`CRON_SECRET` protects it).
5. Log in at `/login` with the admin email, open **Admin → Sync & logs → Sync now**.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / server |
| `npm test` | Parser, sync and ledger tests (in-memory Postgres) |
| `npm run typecheck` / `lint` | Type and lint checks |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run sync` | Run the CricHeroes sync once |
