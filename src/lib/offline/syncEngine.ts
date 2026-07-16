import { createClient } from '@/lib/supabase/client'
import { getOfflineDB, evictOldCacheEntries } from '@/lib/offline/db'
import { createGameSession } from '@/lib/actions/games'
import { awardProjectXp } from '@/lib/actions/xp'
import { afterPageSync, syncPageWithLimitCheck } from '@/lib/actions/pages'
import { recordWordsWritten } from '@/lib/actions/writingStats'

// ── Write queue ───────────────────────────────────────────────────────────────

export async function writeToPendingQueue(
  pageId: string,
  userId: string,
  content: Record<string, unknown>,
  wordCount: number
): Promise<void> {
  try {
    const db = await getOfflineDB()
    const now = Date.now()

    // Preserve 'conflict' status — a conflicted page must not be silently reset to
    // 'pending' by keystrokes. The user must resolve the conflict explicitly via the modal.
    const existing = await db.get('pending_writes', pageId)
    const statusToWrite = existing?.syncStatus === 'conflict' ? 'conflict' : 'pending'

    await db.put('pending_writes', {
      id: pageId,
      userId,
      content,
      wordCount,
      localUpdatedAt: now,
      syncStatus: statusToWrite,
      retryCount: 0,
    })

    const existingCache = await db.get('page_cache', pageId)
    await db.put('page_cache', {
      // Preserve all existing cache metadata — critically including serverUpdatedAt,
      // which is the last confirmed server snapshot used for conflict detection.
      // Overwriting it with local clock time would destroy the baseline and allow
      // silent overwrites of concurrent server edits on reconnect.
      ...(existingCache ?? {}),
      id: pageId,
      content,
      wordCount,
      cachedAt: now,
      // serverUpdatedAt intentionally NOT overwritten here — preserved via spread above.
    })

    void evictOldCacheEntries()
  } catch (err) {
    console.error('[offline] writeToPendingQueue failed:', err)
  }
}

// ── Individual page sync ───────────────────────────────────────────────────────

export async function syncPendingWrite(
  pageId: string,
  savePath: 'online' | 'offline_sync' = 'online',
  // The word count this caller last confirmed the server holds for this page —
  // passed only by the actively-open editor tab, which tracks it privately in
  // memory (never in IndexedDB, which every tab of the origin shares). See the
  // comment at its use below for why this is the one signal that safely
  // detects a sibling tab's save.
  expectedWordCount?: number
): Promise<void> {
  const db = await getOfflineDB()
  const pending = await db.get('pending_writes', pageId)
  if (!pending) return

  await db.put('pending_writes', { ...pending, syncStatus: 'syncing' })

  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    await db.put('pending_writes', { ...pending, syncStatus: 'failed' })
    return
  }

  // Fetch current server state
  const { data: serverPage, error: fetchError } = await supabase
    .from('pages')
    .select('updated_at, version, word_count')
    .eq('id', pageId)
    .single()

  if (fetchError || !serverPage) {
    await db.put('pending_writes', { ...pending, syncStatus: 'failed' })
    return
  }

  // Conflict detection.
  //
  // When expectedWordCount is provided (the actively-open editor tab for this
  // page), compare it directly against the server's live word_count. This is
  // deliberately NOT a version/updated_at comparison: pages.version and
  // updated_at are bumped by the same DB trigger on *any* update to the row —
  // including a title rename (renamePage) or a canonical-page toggle
  // (setCanonicalPage/clearCanonicalPage) — neither of which touches
  // content. Comparing those would flag a conflict for e.g. renaming a page
  // while a content autosave is in flight, on a single tab, with no second
  // writer involved. word_count is only ever written by the content-save
  // path, so it's the one cheap signal that's actually scoped to content.
  //
  // expectedWordCount lives only in that tab's own memory (a ref, set on
  // page load and advanced only after *this* tab's own confirmed sync) —
  // never in IndexedDB. That matters because page_cache is a single row
  // shared by every tab of the browser origin: the instant any tab
  // completes a sync, it overwrites page_cache.serverUpdatedAt/serverVersion
  // for every other tab too, silently erasing the only evidence a sibling
  // tab had diverged. Comparing against the shared cache (the fallback
  // below) can therefore never detect a second tab's save — only a private,
  // in-memory baseline can.
  //
  // Without an active editor for this page (e.g. the background queue flush
  // reconciling a page that isn't currently open), there's no per-session
  // baseline to compare against — fall back to the previous cache-based
  // heuristic, unchanged.
  const cachedPage = await db.get('page_cache', pageId)

  const serverHasChanged = expectedWordCount !== undefined
    ? (serverPage.word_count as number) !== expectedWordCount
    : ((): boolean => {
        if (!cachedPage?.serverUpdatedAt) {
          // No cached server baseline. This happens when a page was created on
          // this device but cachePage() was never called before the first edit —
          // a gap that the EditorShell fix closes, but we also handle here
          // defensively.
          //
          // If the server's word_count is still 0, no other device has written
          // real content to this page. The local write is the first real edit:
          // not a conflict. If word_count > 0, someone else has written content
          // we haven't seen — fall back to conservative conflict to avoid a
          // silent overwrite.
          return (serverPage.word_count as number) > 0
        }

        const serverMs = new Date(serverPage.updated_at as string).getTime()
        const cachedMs = new Date(cachedPage.serverUpdatedAt).getTime()

        // Primary signal: server updated_at advanced past our cached snapshot
        if (serverMs > cachedMs) return true

        // Secondary signal: version number advanced (if we have a cached baseline)
        if (
          cachedPage.serverVersion !== undefined &&
          (serverPage.version as number) > cachedPage.serverVersion
        ) return true

        return false
      })()

  if (serverHasChanged) {
    await db.put('pending_writes', { ...pending, syncStatus: 'conflict' })
    return
  }

  const serverVersion = serverPage.version as number

  // Server action enforces free-tier word limit + version guard in one call.
  // savePath is passed through only for analytics failure-diagnostics
  // (see recordAnalyticsEvent(first_save) below) — it has no effect on sync
  // behavior itself.
  const syncResult = await syncPageWithLimitCheck(
    pageId,
    pending.content,
    pending.wordCount,
    serverVersion,
    savePath
  )

  if (syncResult.status === 'word_limit_blocked') {
    // Content stays in IDB as 'pending' so it is not lost.
    // The editor listens for this event and shows the upgrade modal.
    await db.put('pending_writes', { ...pending, syncStatus: 'pending' })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rune-word-limit-blocked'))
    }
    return
  }

  if (syncResult.status === 'error') {
    // Network or DB error — leave as pending for next reconnect
    await db.put('pending_writes', { ...pending, syncStatus: 'pending' })
    return
  }

  if (syncResult.status === 'version_mismatch') {
    // Another write won — schedule one retry
    const nextRetry = pending.retryCount + 1
    await db.put('pending_writes', {
      ...pending,
      syncStatus: 'pending',
      retryCount: nextRetry,
    })
    setTimeout(() => void syncPendingWrite(pageId, savePath), 2000)
    return
  }

  // syncResult.status === 'ok'
  // Remove from pending, update cache with confirmed server state
  await db.delete('pending_writes', pageId)
  const existingCacheAfterSync = await db.get('page_cache', pageId)
  await db.put('page_cache', {
    // Preserve rich view-cache metadata if already present
    ...(existingCacheAfterSync ?? {}),
    id: pageId,
    content: pending.content,
    wordCount: pending.wordCount,
    serverUpdatedAt: syncResult.updated_at,
    serverVersion: syncResult.version,
    cachedAt: Date.now(),
  })

  // Mirror the server-side maintenance that updatePage() performs:
  // touch chapter updated_at + canonical-aware project word count recalculation.
  try {
    await afterPageSync(pageId)
  } catch {
    // Non-fatal — page content is saved; totals will correct on next full navigation.
  }
}

// ── Flush entire queue ─────────────────────────────────────────────────────────

let _flushing = false

export async function flushPendingQueue(): Promise<{
  synced: number
  failed: number
  conflicts: number
}> {
  if (_flushing) return { synced: 0, failed: 0, conflicts: 0 }
  _flushing = true

  let synced = 0
  let failed = 0
  let conflicts = 0

  try {
    const db = await getOfflineDB()
    const all = await db.getAll('pending_writes')
    const pending = all.filter((w) => w.syncStatus === 'pending')

    for (const write of pending) {
      await syncPendingWrite(write.id, 'offline_sync')
      const after = await db.get('pending_writes', write.id)
      if (!after) {
        synced++
      } else if (after.syncStatus === 'conflict') {
        conflicts++
      } else if (after.syncStatus === 'failed') {
        failed++
      }
      // 200ms between writes to avoid rate limiting
      await new Promise((r) => setTimeout(r, 200))
    }
  } finally {
    _flushing = false
  }

  // Apply any writing credits accumulated during offline sessions.
  // Runs after content sync so credits land in the same flush cycle as the save.
  await flushOfflineWritingCredits()

  return { synced, failed, conflicts }
}

// ── Offline writing credits ────────────────────────────────────────────────────

/**
 * Applies pending_writing_credits to the writing_sessions table.
 *
 * Entries are grouped by (projectId, pageId, sessionDate) so a full offline
 * session collapses into one server call per group rather than one per save event.
 * Each entry is deleted after a successful server write, preventing double-counting
 * on retries. Entries created during this flush (new UUID keys) are untouched and
 * will be processed on the next flush.
 */
export async function flushOfflineWritingCredits(): Promise<void> {
  try {
    const db = await getOfflineDB()
    const all = await db.getAll('pending_writing_credits')
    if (all.length === 0) return

    // Snapshot the IDs present at flush start — only these will be deleted.
    // Any entries written after this point (new UUID keys) are left for next flush.
    const snapshotIds = new Set(all.map((e) => e.id))

    // Group by (projectId, pageId, sessionDate) → one server call per group
    type GroupKey = string
    const groups = new Map<GroupKey, typeof all>()
    for (const entry of all) {
      const key = `${entry.projectId ?? ''}:${entry.pageId}:${entry.sessionDate}`
      const group = groups.get(key) ?? []
      group.push(entry)
      groups.set(key, group)
    }

    for (const entries of groups.values()) {
      const { projectId, pageId, sessionDate } = entries[0]
      const totalWords = entries.reduce((sum, e) => sum + e.wordsAdded, 0)
      if (totalWords <= 0) {
        for (const e of entries) await db.delete('pending_writing_credits', e.id)
        continue
      }

      try {
        await recordWordsWritten(projectId, totalWords, pageId, sessionDate)
        // Only delete entries that were part of this flush's snapshot
        for (const e of entries) {
          if (snapshotIds.has(e.id)) {
            await db.delete('pending_writing_credits', e.id)
          }
        }
      } catch {
        // Leave entries in IDB — will be retried on the next flush
      }
    }
  } catch {
    // Best-effort — content sync is already done; stats can catch up later
  }
}

// ── Game session sync ──────────────────────────────────────────────────────────

export async function syncPendingGameSessions(): Promise<number> {
  const db = await getOfflineDB()
  const all = await db.getAll('pending_game_sessions')
  const unsynced = all.filter((s) => !s.synced)

  let syncedCount = 0

  for (const session of unsynced) {
    try {
      const sessionResult = await createGameSession(
        session.mode,
        session.wordsWritten,
        session.durationSeconds,
        session.rawXpEarned,
        session.enemyType ?? undefined
      )

      if (sessionResult.error) continue

      // Award the pre-calculated XP with a 1.0x multiplier (project mode)
      await awardProjectXp(session.rawXpEarned, { mode: 'project' }, session.id)

      await db.put('pending_game_sessions', { ...session, synced: true })
      syncedCount++
    } catch {
      // Leave unsynced — will retry on next flush
    }
  }

  return syncedCount
}

// ── Conflict inspection ────────────────────────────────────────────────────────

export async function getConflictedPages() {
  const db = await getOfflineDB()
  const all = await db.getAll('pending_writes')
  return all.filter((w) => w.syncStatus === 'conflict')
}

// ── Conflict resolution ────────────────────────────────────────────────────────

/**
 * Force-write the local pending content to Supabase, bypassing the staleness
 * check that would normally mark a write as a conflict. Uses the page ID alone
 * (no version guard) so this always wins over the remote state.
 *
 * On success: clears the pending write, updates cache, runs post-sync maintenance.
 * Returns true if the write succeeded, false otherwise.
 */
export async function forceWriteLocalContent(pageId: string): Promise<boolean> {
  const db = await getOfflineDB()
  const pending = await db.get('pending_writes', pageId)
  if (!pending) return false

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false

  const { data: updated, error: updateError } = await supabase
    .from('pages')
    .update({
      content: pending.content,
      word_count: pending.wordCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pageId)
    .select('id, updated_at, version')
    .single()

  if (updateError || !updated) return false

  await db.delete('pending_writes', pageId)
  const existingCache = await db.get('page_cache', pageId)
  await db.put('page_cache', {
    ...(existingCache ?? {}),
    id: pageId,
    content: pending.content,
    wordCount: pending.wordCount,
    serverUpdatedAt: (updated.updated_at as string) ?? new Date().toISOString(),
    serverVersion: updated.version as number | undefined,
    cachedAt: Date.now(),
  })

  try {
    await afterPageSync(pageId)
  } catch {
    // Non-fatal
  }

  return true
}
