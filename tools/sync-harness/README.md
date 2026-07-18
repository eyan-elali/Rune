# Rune sync harness

Deterministic reproduction/verification harness for the two highest-risk
persistence layers, built during the July 2026 "new page stuck at 0 server
words / false conflict" incident.

It is fully self-contained: its dependencies live in this directory only and
nothing here is imported by the app.

## What it tests

**`npm run sync`** — bundles the REAL `src/lib/offline/syncEngine.ts` and
`src/lib/offline/db.ts` (esbuild), backed by `fake-indexeddb`, with only the
network boundary mocked (`mocks/serverState.js` models the `pages` table with
the migration-006 "bump version + updated_at on every update" trigger and the
migration-011 `save_page_checked` contract). Scenarios:

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

**`npm run sql`** — loads a faithful schema subset (RLS policies, version
trigger, entitlements table, mocked `auth.uid()`) into real Postgres
(PGlite/WASM) and applies `migrations/011_account_word_limit.sql` verbatim,
then verifies `save_page_checked`'s full contract plus the failure
fingerprints of two production drift states (stale 3-arg
`account_word_total` → 42883, missing `user_pricing_entitlements` → 42P01).

## Run

```
cd tools/sync-harness
npm install
npm test
```
