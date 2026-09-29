# Offline Sync

> Verified against `db.ts` / `syncEngine.ts` in September 2026. The store names,
> keys, and `save_scene_checked` call shapes below are **compatibility contracts**:
> stale tabs and queued IndexedDB writes depend on them. Do not rename, re-key, or
> delete stores; do not change Scene IDs. The regression harness in
> `tools/sync-harness` exercises the real `syncEngine.ts` + `db.ts` (mocked
> network) and, in `tests/sql-rune2-manuscript.test.mjs`, against real Postgres.
>
> The engine targets the Rune 2.0 schema (`scenes`). Application code uses Scene
> names throughout. Two persisted names keep their Rune 1.x "page" spelling **for
> compatibility only**, because writers' browsers may already hold unsynced prose,
> conflict state and credits under them: the `page_cache` store (the Scene cache,
> exposed as `SCENE_CACHE_STORE`) and the `pageId` field of
> `pending_writing_credits` rows (a Scene ID). Every key is a Scene ID (Rune 2.0
> keeps each Page ID as its Scene ID). Renaming either would need a versioned
> IndexedDB migration.

## IndexedDB stores (`rune-offline`, version 3)

| Store | Key | Purpose |
|---|---|---|
| `pending_writes` | Scene ID | Latest local content for a Scene not yet confirmed by the server |
| `page_cache` (legacy name; the Scene cache) | Scene ID | Scene content + metadata for offline navigation, plus the confirmed server baseline used for conflict detection |
| `chapter_meta` | chapter id | Chapter + project metadata needed to reconstruct the editor shell offline |
| `pending_writing_credits` | random UUID | Typed-word credits earned offline (`pageId` — legacy name, holds a Scene ID — `projectId`, `wordsAdded`, `sessionDate`), applied to `writing_sessions` on reconnect |
| `pending_game_sessions` | random UUID | Arena sessions completed offline, awaiting sync |

The `upgrade` callback only **creates missing stores** — it never deletes or migrates existing ones, so entries written by any earlier version survive an upgrade.

`pending_writes` rows carry `syncStatus`: `pending | syncing | failed | conflict`, plus `retryCount`, `localUpdatedAt`, and diagnostics (`lastError`, `lastErrorAt` — the server's error message, never manuscript content).

`page_cache` baseline fields (written only from confirmed server state):

- `serverWordCount` — last confirmed server `word_count`. The **primary** conflict signal, because `scenes.word_count` is only written by content saves.
- `serverContent` — last confirmed server content, used only by the deep content check.
- `serverVersion` / `serverUpdatedAt` — metadata signals. `scene_version_trigger` bumps them on **any** row update (rename, reorder, placement change), so they are not proof of a content change.

`writeToPendingQueue` preserves all of these via spread; it never overwrites a baseline with local values.

## Save flow

1. Every editor change calls `writeToPendingQueue(sceneId, userId, content, wordCount)`, writing `pending_writes` and `page_cache` immediately. An existing `conflict` status is preserved.
2. After the debounce (`autoSaveDelay`, default 1500 ms, effective minimum 2500 ms) the editor calls `syncPendingWrite(sceneId, 'online', expectedWordCount)`, passing its private in-memory confirmed word count.
3. `syncPendingWrite` reads `updated_at, version, word_count` for the Scene (a list read, not `.single()`), runs conflict detection, then calls the `syncSceneWithLimitCheck` server action (`src/lib/actions/scenes.ts`) → `save_scene_checked` RPC with `p_expected_version` = the fetched server version.
4. On `ok`, the queue row is deleted **only if** its `localUpdatedAt` still matches the uploaded revision (a newer keystroke stays queued), the cache baseline is updated, and `afterSceneSync` touches the Scene's Chapter (placed Scenes only) and recalculates the project's ordered manuscript total.
5. Offline, the write simply stays `pending`; the editor shows it as saved locally.

Outcomes:

| Result | Queue row |
|---|---|
| `ok` | Deleted (or left `pending` if newer content arrived) |
| `version_mismatch` | `pending`, `retryCount + 1`, one retry scheduled after 2 s |
| `word_limit_blocked` (only from a Rune 2.0 database before migration 037, which retired the limit) | `pending`; `rune-word-limit-blocked` event dispatched (no listener since 037: the write stays queued and retries) |
| `error` / thrown exception | `pending` with `lastError` |
| No auth session, read error, or Scene row missing (deleted / not visible via RLS) | `failed` with `lastError` — prose is preserved |

Concurrency: `syncPendingWrite` calls for the same Scene are coalesced (`inFlightSyncs`), and syncs and Keep Local force-writes are serialized per Scene (`runExclusive`).

## Conflict detection (in order)

1. **First-upload rule** — server `word_count === 0` and local > 0 → not a conflict; upload.
2. Editor path — server `word_count !== expectedWordCount` → conflict.
3. Cached `serverWordCount` — differs → conflict; equal but `version` advanced → deep structural comparison of server content vs `serverContent`.
4. Legacy cache entry with only `serverUpdatedAt` → timestamp/version heuristic.
5. No baseline at all → conflict only if the server has words.

## Reconnect / background sync

`NetworkProvider` calls `flushPendingQueue()` on the browser `online` event and every 30 seconds. The flush retries `pending` and `failed` rows and **re-evaluates** `conflict` rows (false conflicts self-heal; genuine ones stay `conflict`). A module-level `_flushing` flag prevents overlapping flushes. It then applies `pending_writing_credits` via `recordWordsWritten`, and `rune-sync-queue-updated` is dispatched so the editor refreshes its status.

## Conflict resolution (`SyncConflictModal`)

- **Keep Local** → `forceWriteLocalContent(sceneId)`: calls `save_scene_checked` **directly from the browser** with `p_expected_version: null`, verifies the server row, then clears only the acknowledged revision and adopts the returned version as the baseline. Any non-`ok` status is reported as an error and the draft is kept.
- **Keep Server** → deletes the pending row and writes the fetched server content into `page_cache` as the new baseline.

## Settings → Sync tab

Counts come from `getOfflineStorageSummary()`. **Clear cache** (`clearSceneCache()`) removes only `page_cache` entries with no `pending_writes` row. Cache eviction (`evictOldCacheEntries`, max 20) likewise never evicts a Scene with a pending write.

## Required database objects

`scenes.version` / `scene_version_trigger`, `save_scene_checked` / `insert_scene_checked` and their helpers, and `bump_project_updated_at` / `trg_scene_updated` (Rune 2.0 schema: `src/lib/supabase/schema.sql`, migration 015). They keep the Rune 1.x contracts (`save_page_checked`, `insert_page_checked`, `trg_page_updated` in `src/lib/supabase/baseline/production-2026-09-24.sql`) except the renamed arguments (`p_scene_id`) and the not-found error string: `forceWriteLocalContent` classifies the literal `'Scene not found'` as `not_found`.

Production is still on the Rune 1.x baseline; this engine does not work against it. Deployed Rune 1.x clients and their queued offline saves keep calling `save_page_checked` until the future Rune 1.x → Rune 2.0 data migration, which must account for them.

## Word count warning

**Never** write `projects.word_count` from the app. The database maintains it (trigger `scenes_refresh_project_word_count`, migration 020) in the same transaction as every Scene save, insert, move and deletion: the ordered manuscript total, every placed Scene of every Chapter (Unplaced Scenes excluded). `afterSceneSync` only touches the Chapter and revalidates caches (`revalidateProjectTotals`).
