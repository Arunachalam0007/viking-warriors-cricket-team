---
name: add-feature-module
description: Add a new feature to the Viking Warriors portal following the project's module pattern (schema, migration with RLS, queries, admin actions with audit, pages, docs, tests). Use for any new page, admin screen, report, or data type.
---

# Adding a feature module

1. **Schema** — add tables/columns in `src/db/schema.ts` (money = integer rupees, timestamps UTC, `created_at`). Then follow the `db-migration` skill.
2. **Module** — `src/modules/<feature>/`
   - `queries.ts`: `import "server-only"`; functions take `db: Executor = getDb()` first so tests can pass PGlite.
   - `actions.ts`: `"use server"`; every mutation is `export const x = adminAction(zodSchema, async (input, { tx, actor }) => { …; await audit({...}, tx) })`. Pass `{ syncSheet: false }` if Google Sheets is unaffected.
   - Pure rules in their own file (like `finance/rules.ts`) so they are unit-testable.
3. **Pages** — public: `src/app/(app)/<route>/page.tsx`; admin: `src/app/(app)/admin/<route>/page.tsx` (layout already enforces admin). `params`/`searchParams` are Promises. Filters live in the URL (`UrlSelect`). Add nav entries in `src/components/layout/nav-items.ts`.
4. **UI** — reuse `src/components/shared.tsx` and shadcn `src/components/ui`. Theme tokens only; check 390px phone width (no horizontal page scroll), tablet and desktop, light + dark.
5. **Sheets / Excel** — if the feature has money, add it to `src/modules/sheets/sheets.ts` (`buildTabs`) and `src/modules/export/excel.ts`.
6. **Tests** — `tests/<feature>.test.ts` using `createTestDb()` from `tests/helpers/test-db.ts`.
7. **Docs** — add `docs/pages/<feature>.html` (purpose, DB tables/columns, code files, admin flow) and link it from `docs/index.html`.
8. Verify: `npm run typecheck && npm run lint && npm test`.
