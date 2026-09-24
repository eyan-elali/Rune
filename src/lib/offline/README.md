# Offline Sync

> Verified against `db.ts` / `syncEngine.ts` in September 2026. The store names,
> keys, and `save_page_checked` call shapes below are **compatibility contracts**:
> stale tabs and queued IndexedDB writes depend on them. Do not rename, re-key, or
> delete stores; do not change Page IDs. The regression harness in
> `tools/sync-harness` exercises the real `syncEngine.ts` + `db.ts`.

## IndexedDB stores (`rune-offline`, version 3)

| Store | Key | Purpose |
|---|---|---|
| `pending_writes` | page id | Latest local content for a page not yet confirmed by the server |
| `page_cache` | page id | Page content + metadata for offline navigation, plus the confirmed server baseline used for conflict detection |
| `chapter_meta` | chapter id | Chapter + project metadata needed to reconstruct the editor shell offline |
| `pending_writing_credits` | random UUID | Typed-word credits earned offline (`pageId`, `projectId`, `wordsAdded`, `sessionDate`), applied to `writing_sessions` on reconnect |
| `pending_game_sessions` | random UUID | Arena sessions completed offline, awaiting sync |

The `upgrade` callback only **creates missing stores** — it never deletes or migrates existing ones, so entries written by any earlier version survive an upgrade.

`pending_writes` rows carry `syncStatus`: `pending | syncing | failed | conflict`, plus `retryCount`, `localUpdatedAt`, and diagnostics (`lastError`, `lastErrorAt` — the server's error message, never manuscript content).

`page_cache` baseline fields (written only from confirmed server state):

- `serverWordCount` — last confirmed server `word_count`. The **primary** conflict signal, because `pages.word_count` is only written by content saves.
- `serverContent` — last confirmed server content, used only by the deep content check.
- `serverVersion` / `serverUpdatedAt` — metadata signals. The migration-006 trigger bumps them on **any** row update (rename, reorder, canonical toggle), so they are not proof of a content change.

`writeToPendingQueue` preserves all of these via spread; it never overwrites a baseline with local values.

## Save flow

1. Every editor change calls `writeToPendingQueue(pageId, userId, content, wordCount)`, writing `pending_writes` and `page_cache` immediately. An existing `conflict` status is preserved.
2. After the debounce (`autoSaveDelay`, default 1500 ms, effective minimum 2500 ms) the editor calls `syncPendingWrite(pageId, 'online', expectedWordCount)`, passing its private in-memory confirmed word count.
3. `syncPendingWrite` reads `updated_at, version, word_count` for the page (a list read, not `.single()`), runs conflict detection, then calls the `syncPageWithLimitCheck` server action → `save_page_checked` RPC with `p_expected_version` = the fetched server version.
4. On `ok`, the queue row is deleted **only if** its `localUpdatedAt` still matches the uploaded revision (a newer keystroke stays queued), the cache baseline is updated, and `afterPageSync` touches the chapter and recalculates the canonical-aware project total.
5. Offline, the write simply stays `pending`; the editor shows it as saved locally.

Outcomes:

| Result | Queue row |
|---|---|
| `ok` | Deleted (or left `pending` if newer content arrived) |
| `version_mismatch` | `pending`, `retryCount + 1`, one retry scheduled after 2 s |
| `word_limit_blocked` | `pending`; `rune-word-limit-blocked` event dispatched |
| `error` / thrown exception | `pending` with `lastError` |
| No auth session, read error, or page row missing (deleted / not visible via RLS) | `failed` with `lastError` — prose is preserved |

Concurrency: `syncPendingWrite` calls for the same page are coalesced (`inFlightSyncs`), and syncs and Keep Local force-writes are serialized per page (`runExclusive`).

## Conflict detection (in order)

1. **First-upload rule** — server `word_count === 0` and local > 0 → not a conflict; upload.
2. Editor path — server `word_count !== expectedWordCount` → conflict.
3. Cached `serverWordCount` — differs → conflict; equal but `version` advanced → deep structural comparison of server content vs `serverContent`.
4. Legacy cache entry with only `serverUpdatedAt` → timestamp/version heuristic.
5. No baseline at all → conflict only if the server has words.

## Reconnect / background sync

`NetworkProvider` calls `flushPendingQueue()` on the browser `online` event and every 30 seconds. The flush retries `pending` and `failed` rows and **re-evaluates** `conflict` rows (false conflicts self-heal; genuine ones stay `conflict`). A module-level `_flushing` flag prevents overlapping flushes. It then applies `pending_writing_credits` via `recordWordsWritten`, and `rune-sync-queue-updated` is dispatched so the editor refreshes its status.

## Conflict resolution (`SyncConflictModal`)

- **Keep Local** → `forceWriteLocalContent(pageId)`: calls `save_page_checked` **directly from the browser** with `p_expected_version: null`, verifies the server row, then clears only the acknowledged revision and adopts the returned version as the baseline. Any non-`ok` status is reported as an error and the draft is kept.
- **Keep Server** → deletes the pending row and writes the fetched server content into `page_cache` as the new baseline.

## Settings → Sync tab

Counts come from `getOfflineStorageSummary()`. **Clear cache** (`clearPageCache()`) removes only `page_cache` entries with no `pending_writes` row. Cache eviction (`evictOldCacheEntries`, max 20) likewise never evicts a page with a pending write.

## Required database objects

Migrations 006 (`pages.version`, `page_version_trigger`), 011 (`save_page_checked` and helpers) and 012 (`bump_project_updated_at`) must be present. The schema reconciliation for Rune 2.0 Phase 0 is tracked separately — see `tools/db-audit/README.md`.

## Word count warning

**Never** increment `projects.word_count` by a delta. Always call `recalculateProjectWordCount(supabase, projectId)`, which counts each chapter's canonical page if one is set, otherwise all its pages. `afterPageSync` does this after every successful sync.
