# Offline Sync

## IndexedDB stores (`rune-offline`, version 2)

| Store | Key | Purpose |
|---|---|---|
| `pending_writes` | `pageId` | Pages edited locally that have not yet been persisted to Supabase |
| `page_cache` | `pageId` | Full page content + metadata for offline navigation |
| `chapter_meta` | `chapterId` | Chapter + project metadata needed to reconstruct the editor shell offline |
| `pending_game_sessions` | local UUID | Game sessions completed offline, awaiting sync |

`pending_writes` entries have a `syncStatus` of `pending | syncing | failed | conflict`.
`page_cache` entries store `serverUpdatedAt` — the last confirmed Supabase `updated_at` — which is the baseline for conflict detection. Never overwrite it with a local clock value.

## Offline save flow

1. Every keystroke calls `writeToPendingQueue(pageId, userId, content, wordCount)` — writes to both `pending_writes` and `page_cache` immediately.
2. After the debounce (default 1500 ms, min 2500 ms), `handleSave` fires.
3. If online: `syncPendingWrite(pageId)` pushes the write to Supabase with an optimistic-lock `WHERE version = $serverVersion` guard. On success the pending entry is deleted and `page_cache.serverUpdatedAt` is updated to the confirmed server timestamp.
4. If offline: the write stays in `pending_writes` with `syncStatus = 'pending'`. The editor shows **Saved locally**.

## Reconnect sync

`NetworkProvider` listens for the browser `online` event and polls every 30 seconds. On reconnect it calls `flushPendingQueue()`, which iterates all `pending` entries and calls `syncPendingWrite` on each. A module-level `_flushing` mutex prevents concurrent flushes and duplicate toasts.

After the flush, `window.dispatchEvent(new CustomEvent('rune-sync-queue-updated'))` fires so RuneEditor re-reads IDB state and updates its status indicator.

## Conflict detection

`syncPendingWrite` fetches the current `updated_at` and `version` from Supabase and compares them against `page_cache.serverUpdatedAt` (the snapshot taken the last time this device loaded the page from the server).

- If server's `updated_at` > cached `serverUpdatedAt` → conflict detected → `syncStatus = 'conflict'`.
- If no `serverUpdatedAt` baseline exists → treated as conflict (conservative).

The `WHERE version = $serverVersion` UPDATE acts as a second guard at the DB level.

## Conflict resolution

When `syncStatus === 'conflict'`, the editor shows a **Conflict** button. Clicking opens `SyncConflictModal`, which loads both the local draft (from `pending_writes`) and the current server content (live Supabase fetch).

- **Keep Local** → calls `forceWriteLocalContent(pageId)`: force-writes the local content to Supabase (no version guard), clears the pending entry, updates `serverUpdatedAt` in cache.
- **Keep Server** → deletes the pending entry, writes the server content into `page_cache`, hands the server content back to the editor.

Conflict status is never silently overwritten by keystrokes or debounced saves — `writeToPendingQueue` preserves `syncStatus = 'conflict'` on existing entries.

## Settings → Sync tab

Shows live counts from `getOfflineStorageSummary()`:
- **Pending syncs** — writes in `pending | syncing | failed` state
- **Conflicts** — writes in `conflict` state
- **Cached pages** — total entries in `page_cache`

**Sync now** calls `flushPendingQueue()` manually.
**Clear cache** calls `clearPageCache()`, which only deletes `page_cache` entries that have *no* corresponding `pending_writes` entry — pending and conflicted pages are never removed.

## Required Supabase migration

`src/lib/supabase/migrations/006_offline_sync.sql` **must be run before deploying the offline-sync feature**. It:
- Makes `pages.updated_at` NOT NULL with a default of `now()`
- Adds `pages.version integer DEFAULT 1 NOT NULL`
- Installs `page_version_trigger` which auto-increments `version` and refreshes `updated_at` on every UPDATE

## Word count warning

**Never** increment `projects.word_count` by a word delta. Always call `recalculateProjectWordCount(supabase, projectId)`, which sums only canonical pages. Any delta-based increment will silently corrupt manuscript totals over time.

The `afterPageSync` server action (called after every successful offline sync) handles this correctly.
