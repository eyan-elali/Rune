# Rune regression harness

Deterministic tests for Rune's highest-risk persistence layers: the offline
sync engine and the SQL save path, RLS and RPC contracts. It started as the
July 2026 "new page stuck at 0 server words / false conflict" incident harness
and is the Rune 2.0 Phase 0 test foundation.

It is self-contained: its dependencies live in this directory only, pinned to
exact versions. Nothing here is imported by the app, and it adds nothing to
the app's `package.json` dependencies.

## Run

```
npm --prefix tools/sync-harness install   # once
npm test                                  # from the repo root, or `npm test` in this directory
```

`npm test` builds the sync bundle, then runs every `tests/*.test.mjs` with
Node's built-in test runner (`node:test`), one file at a time. Other entry
points:

| Command | What it runs |
|---|---|
| `npm run sync` | The 20 sync scenarios only, with the original per-scenario output |
| `npm run sql` | The SQL test files only (`tests/sql-*.test.mjs`) |

## Layout

| Path | Purpose |
|---|---|
| `src/lib/supabase/baseline/production-2026-09-24.sql` (repo, `LEGACY_BASELINE`) | The Rune 1.x production baseline, loaded by the legacy SQL tests on top of the shim, so they exercise production's real tables, policies, triggers and function bodies |
| `src/lib/supabase/schema.sql` (repo, `RUNE2_SCHEMA`) | The canonical Rune 2.0 schema (baseline + migrations 013 onward), loaded by the Rune 2.0 tests |
| `build-schema.mjs` | Generates `schema.sql` (`npm run schema`; `-- --check` fails if stale; `-- --catalog <file>` also writes the built catalog for comparing a real database) |
| `sql/supabase-shim.sql` | Minimal Supabase for PGlite: roles `anon` / `authenticated` / `service_role` (BYPASSRLS), `auth.users`, `auth.uid()` / `auth.role()` / `auth.jwt()` from the same request GUCs PostgREST sets, and Supabase's default privileges on `public` |
| `lib/pg.mjs` | `createTestDb()` (fresh PGlite + shim), `withRole()` / `asUser()` (one transaction per request as a role and user, like PostgREST), `readMigration()` |
| `lib/supabase-adapter.mjs` | Minimal supabase-js-shaped client over PGlite, so real server code runs against real SQL + RLS. Unsupported query shapes fail with `adapter: unsupported …` instead of passing silently |
| `lib/bundle.mjs` | `bundleForTest('src/…')` bundles a real Rune module with `@/lib/supabase/server`, `next/cache` and `next/server` mocked, and re-exports `setServerClient` and `revalidateCalls`. `aliases` can also replace a bare package (e.g. `{ jspdf: … }`) |
| `lib/manuscript-invariants.mjs` | Rune 2.0 migration invariants over manuscript snapshots: the legacy canonical-aware rule, the Rune 2.0 rule, the approved Page → Scene mapping, and `checkMigration(before, after, { stage })` |
| `lib/manuscript-snapshot.mjs` | `takeManuscriptSnapshot(db)` for either schema (legacy `pages`, or Rune 2.0 `scenes` through the Manuscript): ids, content hashes (never prose), word counts, placement, sync metadata, writing history, and real `account_word_total()` per user |
| `lib/legacy-to-rune2.mjs` | TEST PROTOTYPE of the future Rune 1.x → Rune 2.0 data move (§42 mapping, Page ID = Scene ID), with `faults` for negative controls. Not the production migration |
| `fixtures/manuscript-fixture.mjs` | Synthetic, production-shaped manuscript fixture (no real writing) with `seedFixture(db)`, `snapshotFromFixture()` and readable `LABELS` |
| `mocks/` | Network and framework boundaries (`supabaseClient.js` / `serverState.js` for the sync engine; `supabaseServer.js`, `nextCache.js`, `nextServer.js` for bundled server code; `jspdf.js`, a recording jsPDF for the real export) |
| `entry.js`, `build.mjs`, `scenarios.mjs`, `run-all.mjs` | The sync-engine scenarios (unchanged) and their bundler and runner |
| `tests/` | `node:test` files |

## What is tested

**`tests/sync-scenarios.test.mjs`** runs each scenario in `entry.js` in its own
process against the REAL `src/lib/offline/syncEngine.ts` and `db.ts` (esbuild
bundle), backed by `fake-indexeddb`. Only the network boundary is mocked
(`mocks/serverState.js` models the `pages` table with the migration-006
"bump version + updated_at on every update" trigger and the migration-011
`save_page_checked` contract):

- `r1` metadata bump (rename) during typing + background flush → must upload, not conflict
- `r2` a latched false `conflict` row must self-heal and upload on the next flush
- `r3` a keystroke during an in-flight save must survive the older save's ok-path
- `r6` server errors must be logged, recorded on the queue row, and categorized by Keep Local
- `r7` an optimistic (poisoned) baseline vs an empty server page must upload, not conflict
- `g1` a genuine two-writer conflict must still be detected and never silently overwritten
- `g2` a remote edit with an identical word count must be caught by the deep content check
- `g3` a rename after a confirmed sync must not conflict
- `w`  word-limit blocks must keep content queued and report distinctly
- `f`  the exact production stranded state (empty server + conflicted local prose) must recover
- `i`  repeated syncs of the same write must issue exactly one server save
- `m`  a stale queue entry for a deleted/inaccessible page → accurate `failed` classification, prose preserved
- `kl` the Keep-Local lifecycle: conflict → Keep Local → next edit + background poll reads the client's OWN new version → no false conflict
- `klrace` the async race the per-page lock closes: a background sync captures stale server state before Keep Local, Keep Local completes, the stale sync resumes → must NOT resurrect a false conflict
- `klext` a genuine external edit landing AFTER Keep Local must still conflict
- `klrepeat` repeated edit+poll cycles after Keep Local must never re-raise a conflict (the reported loop)
- `klmeta` a metadata-only bump after Keep Local (identical content) must not false-conflict
- `klserver` Keep Server resets the baseline; later edits sync with no false conflict
- `mig` the Rune 2.0 canonical cutover makes a page with a queued offline write (and a queued writing credit) Unplaced → replay lands on the same Page ID, no conflict, no remapping, no new row
- `migbump` the same, when the data step fails to suppress the version trigger

**`tests/schema-equivalence.test.mjs`** proves the Rune 1.x baseline
(`src/lib/supabase/baseline/production-2026-09-24.sql`) reproduces the committed production catalog snapshot exactly. It loads the
schema, re-runs `tools/db-audit/catalog.sql`, and diffs with
`tools/db-audit/catalog-lib.mjs`, including a negative control. It also proves
migrations 013 + 014 produce exactly the expected catalog diff, refuse to run
twice, and that 014 aborts without changes on a non-baseline database
(including the migration-007 `handle_new_user` regression).

**`tests/production-baseline.test.mjs`** pins the manuscript and schema facts
recorded in the 2026-09-24 production snapshot (row counts, canonical-page
shape, the 86 pages / 41,998 words that map to Unplaced Scenes,
`writing_sessions.page_id` cascade, RPC ACLs, and so on), so a newer snapshot
can only replace it deliberately.

**`tests/sql-contract.test.mjs`** (formerly `sqltest.mjs`) runs
`save_page_checked`'s contract against the production baseline: real RLS,
triggers and function bodies (S1–S6). It also covers the failure fingerprints
of two drift states: a stale 3-arg `account_word_total` (S7) and a missing
`user_pricing_entitlements` (S8).

**`tests/sql-drift.test.mjs`** (formerly `sqldrift.mjs`) is the July 2026
incident regression. It puts back the exact hand-applied production body of
`bump_project_updated_at` (unqualified table names, no pinned search_path) and
proves `save_page_checked` fails with `relation "projects" does not exist` and
rolls back. It then applies migration 012 twice (idempotency) and proves the
save commits through the real trigger.

**`tests/migration-invariants.test.mjs`** is the Rune 2.0 Phase 1 migration
safety harness (architecture doc §42). On the synthetic fixture it proves the
real Rune 2.0 app (`manuscript.ts`, `recalculateProjectWordCount`, and the real
export loader + PDF export with a recording jsPDF), run on the approved mapping
of the fixture, reproduces the legacy ordered totals and export selection, that
`account_word_total()` counts every Page, that the approved mapping keeps the ordered manuscript,
export selection, account totals and writing history, and that
`checkMigration()` accepts a correct migration and names every defect in its
negative controls without printing prose.

Its section 5 moves the fixture into the Rune 2.0 schema with
`lib/legacy-to-rune2.mjs` and runs `checkMigration(baseline, rune2Snapshot,
{ stage: 'cutover' })` database to database, with negative controls (new ids,
lost sync metadata, alternates left placed, dropped history, a placed-only
`account_word_total`).

**`tests/sql-ownership-contract.test.mjs`** runs every Rune 1.x `pages` shape
the deployed app sends (sync pre-read, deep check, conflict modal, Keep Local,
verify, export loader, and the autosave action's `save_page_checked` call with
its status mapping) against real RLS on the Rune 1.x baseline, where real
writers still are. The app on this branch targets the Rune 2.0 schema, so these
shapes are pinned literally.

**`tests/rune2-schema.test.mjs`** proves `schema.sql` is exactly what
`build-schema.mjs` generates, that a database built from it alone equals
baseline + migrations (structure, ledger, row counts), and that migration 015
makes exactly its intended catalog change, refuses to run twice or out of
order, and refuses (changing nothing) on any database holding manuscript data.

**`tests/sql-rune2-manuscript.test.mjs`** runs the Rune 2.0 contracts on
`schema.sql` with the fixture moved in: Manuscript creation and read-only RLS,
Chapter/Scene RLS through the Manuscript for every command, the Scene
equivalents of the app's read shapes, `save_scene_checked` /
`insert_scene_checked` / `account_word_total` / `duplicate_project_checked`,
cross-tenant and cross-Manuscript injection, Unplaced Scenes counting toward
the limit, triggers, writing history and deletion (the former Task 1 `FUTURE`
tests). Its last section runs the REAL app modules against Scenes: the
autosave action (`actions/scenes.ts`), `afterSceneSync`, the offline sync
engine over fake IndexedDB (sync, Keep Local, the `'Scene not found'` →
`not_found` classification), the writing-credit flush and the export loader.

**`tests/app-rune2.test.mjs`** runs the real structure-changing paths on the
Rune 2.0 schema: project/Chapter/Scene creation, reorder, rename, deletion and
its total recalculation, the onboarding route (first sentence, skipped
sentence, free-limit refusal with nothing left behind) and Arena's two save
paths.

### Using the invariants in a migration test

```js
const before = await takeManuscriptSnapshot(db);
await db.exec(readMigration('0NN_….sql'));
const after = await takeManuscriptSnapshot(db);
assertNoViolations(checkMigration(before, after, { stage: 'additive' }), { labels: LABELS });
```

Use `stage: 'additive'` for steps that move no Page (schema introduction,
ownership backfill, function bodies) and `stage: 'cutover'` for the canonical
cutover and final Phase 1 verification (run against the original baseline).

**`tests/foundation.test.mjs`** covers the Phase 0 foundation itself: shim
identity and RLS per role, the adapter's query shapes, RLS and error behaviour,
and bundling the real `src/lib/projectWordCount.ts` and running it against
PGlite (Rune 2.0 schema) as the project owner.

## Writing a test

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asUser } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';

let db;
before(async () => { db = await createTestDb(); /* load schema + seed */ });

test('…', async () => {
  const mod = await bundleForTest('src/lib/actions/scenes.ts');
  mod.setServerClient(createSupabaseAdapter(db, { userId: A }));
  // call real server actions; assert on db state
});
```

Seed data as the superuser (`db.exec`); act as users through `asUser()` or the
adapter. Recovery steps for the July 2026 incident are in `RECOVERY.md`.
