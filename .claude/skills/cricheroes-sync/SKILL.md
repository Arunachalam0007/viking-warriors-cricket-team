---
name: cricheroes-sync
description: Diagnose and fix the nightly CricHeroes sync when it fails, returns 0 matches, misses players or stats, or after CricHeroes changes its website. Use when sync_runs shows failures, the admin "Sync now" reports errors, or match data looks wrong.
---

# Fixing the CricHeroes sync

The sync reads public cricheroes.com pages (Next.js RSC payload embedded as `self.__next_f.push`). It never uses CricHeroes' private API key.

## Pages used
| Data | URL | Parser |
|---|---|---|
| Matches (latest 12) | `/team-profile/<teamId>/team/matches` | `parseTeamMatches` |
| Squad + photos | `/team-profile/<teamId>/team/members` | `parseTeamMembers` |
| Scorecard | `/scorecard/<matchId>/match/match/scorecard` | `parseScorecard` → `extractTeamPerformance` |

## Steps
1. Read the latest failures: `sync_runs` (admin → Sync & logs) or run `npm run sync` locally.
2. Download the failing page into a scratch folder and decode it:
   ```bash
   curl -sL -A "Mozilla/5.0" "https://cricheroes.com/team-profile/2921535/team/matches" -o page.html
   ```
   Use `decodeRscPayload()` / `parseRscObjects()` from `src/modules/cricheroes/parser.ts` to inspect the objects. Find the dict that holds the data by its keys (`match_id`+`team_a_id`, `scoreCardData`, `player_id`+`profile_photo`).
3. Update only `src/modules/cricheroes/parser.ts` (and `types.ts` if fields change). Keep the output types stable so sync, finance and stats code does not change.
4. Save the new page as a fixture in `tests/fixtures/` and extend `tests/cricheroes-parser.test.ts`. Run `npm test`.
5. Run `npm run sync` against a local `pglite:` database to confirm counts (matches, scorecards, charges).

## Rules
- Admin locks (`finance_locked`, `admin_locked`, `name_locked`) must never be overwritten.
- Re-running the sync must be idempotent (no duplicate charges) — the sync test checks this.
- Keep requests polite: a handful per run, no parallel bursts, no page-view-triggered fetching.
