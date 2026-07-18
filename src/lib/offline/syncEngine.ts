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

// Deterministic stringify (recursively sorted object keys) so structurally
// equal Tiptap documents compare equal regardless of key insertion order —
// Postgres jsonb re-serializes with its own key ordering, so a naive
// JSON.stringify comparison of "what we uploaded" vs "what the server returns"
// would report false differences.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

// At most one authoritative sync per page at a time. Two callers (the editor's
// debounced save and the 30-second background flush) used to run
// syncPendingWrite concurrently for the same page; both would fetch the same
// server version, one save would win, and the loser's version_mismatch retry
// added avoidable churn. Serializing per page also makes the delete-race guard
// below airtight.
const inFlightSyncs = new Map<string, Promise<void>>()

export async function syncPendingWrite(
  pageId: string,
  savePath: 'online' | 'offline_sync' = 'online',
  // The word count this caller last confirmed the server holds for this page —
  // passed only by the actively-open editor tab, which tracks it privately in
  // memory (never in IndexedDB, which every tab of the origin shares): the
  // shared page_cache baseline is overwritten by whichever tab syncs first,
  // erasing the evidence a sibling tab had diverged, so only a private
  // in-memory baseline can detect a second tab's save.
  expectedWordCount?: number
): Promise<void> {
  const existing = inFlightSyncs.get(pageId)
  if (existing) return existing

  const run = doSyncPendingWrite(pageId, savePath, expectedWordCount)
    .finally(() => { inFlightSyncs.delete(pageId) })
  inFlightSyncs.set(pageId, run)
  return run
}

async function doSyncPendingWrite(
  pageId: string,
  savePath: 'online' | 'offline_sync',
  expectedWordCount?: number
): Promise<void> {
  const db = await getOfflineDB()
  const pending = await db.get('pending_writes', pageId)
  if (!pending) return

  await db.put('pending_writes', { ...pending, syncStatus: 'syncing' })

  // Writes a status change onto the LATEST queued row rather than the snapshot
  // read at entry — a keystroke during this sync overwrites the pending row
  // with newer content, and spreading the stale snapshot would silently revert
  // the durable queue to older prose.
  async function putStatus(
    status: 'pending' | 'failed' | 'conflict',
    extra?: { lastError: string; lastErrorAt: number }
  ): Promise<void> {
    const latest = (await db.get('pending_writes', pageId)) ?? pending!
    await db.put('pending_writes', { ...latest, syncStatus: status, ...(extra ?? {}) })
  }

  // Marks the attempt as failed-but-retryable without ever losing content, and
  // records WHY it failed — the previous version of this engine swallowed every
  // server error into an indistinguishable silent retry, which made a
  // persistently failing save look like an ordinary "Saving..." forever.
  async function failAttempt(
    status: 'pending' | 'failed',
    reason: string
  ): Promise<void> {
    console.error(`[sync] page ${pageId} save did not persist (${status}):`, reason)
    await putStatus(status, { lastError: reason, lastErrorAt: Date.now() })
  }

  try {
    const supabase = createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      await failAttempt('failed', 'No auth session — sign-in required')
      return
    }

    // Fetch current server state. Deliberately NOT .single(): PostgREST turns
    // both "zero rows" and "more than one row" into the same opaque
    // "Cannot coerce the result to a single JSON object" (PGRST116), which
    // hides the three very different situations below. Fetch as a plain list
    // and classify explicitly.
    const { data: serverRows, error: fetchError } = await supabase
      .from('pages')
      .select('updated_at, version, word_count')
      .eq('id', pageId)

    if (fetchError) {
      // A real query/transport error — surface the actual PostgREST message.
      await failAttempt(
        'failed',
        `Could not read server page state: ${fetchError.code ? fetchError.code + ': ' : ''}${fetchError.message}`
      )
      return
    }
    if (!serverRows || serverRows.length === 0) {
      // The row is gone or invisible: the page was deleted (possibly on
      // another device), or RLS no longer exposes it to this account. Either
      // way the queued prose must be preserved — 'failed' keeps it durable and
      // retryable while the reason is recorded precisely.
      await failAttempt(
        'failed',
        'Server page row not found — the page was deleted or is not accessible to this account (stale queue entry?)'
      )
      return
    }
    if (serverRows.length > 1) {
      // pages.id is the primary key — more than one row is an invariant
      // violation that must never be silently reconciled.
      await failAttempt(
        'failed',
        `Invariant violation: ${serverRows.length} rows returned for page id ${pageId}`
      )
      return
    }
    const serverPage = serverRows[0]

    // ── Conflict detection ───────────────────────────────────────────────────
    //
    // A genuine conflict needs evidence that the server's CONTENT changed away
    // from the last baseline this device confirmed — not merely that the row
    // was touched. pages.version and updated_at are bumped by the DB trigger
    // on *any* update (title rename, page reorder, canonical toggle), so they
    // are metadata signals, not content signals. pages.word_count is only ever
    // written by the content-save path, so word-count-vs-confirmed-baseline is
    // the primary signal; a deep content comparison disambiguates the one case
    // word count can't (a remote edit that happens to land on the identical
    // word count).
    //
    // First-upload rule: a server page holding 0 words is content-empty. Local
    // prose diverging from an empty server page is NOT a two-writer conflict —
    // it is the first real upload (or a re-upload after the server copy never
    // received content). Uploading destroys nothing; forcing the writer
    // through a conflict modal against a 0-word "server version" risks them
    // clicking "Keep Server" and losing real prose to an empty page. This rule
    // runs before every other signal and is what automatically recovers pages
    // stranded by earlier false conflicts.
    const serverWordCountNow = serverPage.word_count as number
    const cachedPage = await db.get('page_cache', pageId)

    let serverHasChanged: boolean
    if (serverWordCountNow === 0 && pending.wordCount > 0) {
      serverHasChanged = false
    } else if (expectedWordCount !== undefined) {
      // Actively-open editor tab: private, in-memory confirmed baseline.
      serverHasChanged = serverWordCountNow !== expectedWordCount
    } else if (cachedPage?.serverWordCount !== undefined) {
      // Confirmed content baseline from this device's last successful sync (or
      // the server fetch that first cached the page).
      if (serverWordCountNow !== cachedPage.serverWordCount) {
        serverHasChanged = true
      } else if (
        cachedPage.serverVersion !== undefined &&
        (serverPage.version as number) > cachedPage.serverVersion &&
        cachedPage.serverContent !== undefined
      ) {
        // Word count matches the confirmed baseline but the row's version
        // advanced past it. Usually that is a metadata-only bump (rename /
        // reorder / canonical toggle). But word-count equality alone is not
        // proof the content is unchanged — a remote edit can land on the
        // identical count — so fetch the server content and compare it
        // structurally against the confirmed baseline copy.
        const { data: contentRows, error: contentError } = await supabase
          .from('pages')
          .select('content')
          .eq('id', pageId)
        if (contentError) {
          await failAttempt(
            'pending',
            `Could not read server content for deep check: ${contentError.code ? contentError.code + ': ' : ''}${contentError.message}`
          )
          return
        }
        if (!contentRows || contentRows.length !== 1) {
          // The row vanished (or duplicated) between the state read above and
          // this read — retry the whole evaluation next cycle.
          await failAttempt(
            'pending',
            `Server page row count changed mid-sync during deep check (${contentRows?.length ?? 0} rows)`
          )
          return
        }
        serverHasChanged =
          stableStringify(contentRows[0].content ?? {}) !==
          stableStringify(cachedPage.serverContent ?? {})
      } else {
        serverHasChanged = false
      }
    } else if (cachedPage?.serverUpdatedAt) {
      // Legacy cache entry (written before serverWordCount existed): fall back
      // to the old timestamp/version heuristic. Metadata-only updates can
      // still trip this, but only until the first confirmed sync upgrades the
      // entry with a content baseline — and the first-upload rule above
      // already defuses the dangerous empty-server case.
      const serverMs = new Date(serverPage.updated_at as string).getTime()
      const cachedMs = new Date(cachedPage.serverUpdatedAt).getTime()
      serverHasChanged =
        serverMs > cachedMs ||
        (cachedPage.serverVersion !== undefined &&
          (serverPage.version as number) > cachedPage.serverVersion)
    } else {
      // No baseline at all. Server has real content we have never seen —
      // conservative conflict to avoid a silent overwrite. (The 0-word case
      // was already handled by the first-upload rule.)
      serverHasChanged = serverWordCountNow > 0
    }

    if (serverHasChanged) {
      await putStatus('conflict')
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
      await putStatus('pending')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('rune-word-limit-blocked'))
      }
      return
    }

    if (syncResult.status === 'error') {
      // Server or DB error — leave as pending for retry, but record the real
      // reason instead of discarding it.
      await failAttempt('pending', syncResult.error)
      return
    }

    if (syncResult.status === 'version_mismatch') {
      // Another write won the version race — schedule one retry, preserving
      // this caller's confirmed baseline so the retry's conflict check stays
      // content-aware instead of degrading to the cache heuristic.
      const latest = (await db.get('pending_writes', pageId)) ?? pending
      await db.put('pending_writes', {
        ...latest,
        syncStatus: 'pending',
        retryCount: latest.retryCount + 1,
      })
      setTimeout(() => void syncPendingWrite(pageId, savePath, expectedWordCount), 2000)
      return
    }

    // syncResult.status === 'ok' — the server confirmed THIS pending revision
    // (identified by localUpdatedAt). Only clear the queue if no newer local
    // content arrived while the request was in flight: a keystroke during the
    // save overwrites the pending row, and deleting it here would silently
    // drop the newest prose from the durable queue.
    const latest = await db.get('pending_writes', pageId)
    if (latest && latest.localUpdatedAt === pending.localUpdatedAt) {
      await db.delete('pending_writes', pageId)
    } else if (latest) {
      // Newer content superseded the acknowledged revision — leave it queued
      // for the next cycle.
      await db.put('pending_writes', { ...latest, syncStatus: 'pending' })
    }

    // Update cache with the confirmed server state (what the server now holds
    // is exactly the revision we just wrote, regardless of newer local edits).
    const existingCacheAfterSync = await db.get('page_cache', pageId)
    await db.put('page_cache', {
      // Preserve rich view-cache metadata if already present
      ...(existingCacheAfterSync ?? {}),
      id: pageId,
      content: pending.content,
      wordCount: pending.wordCount,
      serverUpdatedAt: syncResult.updated_at,
      serverVersion: syncResult.version,
      serverWordCount: pending.wordCount,
      serverContent: pending.content,
      cachedAt: Date.now(),
    })

    // Mirror the server-side maintenance that updatePage() performs:
    // touch chapter updated_at + canonical-aware project word count recalculation.
    try {
      await afterPageSync(pageId)
    } catch {
      // Non-fatal — page content is saved; totals will correct on next full navigation.
    }
  } catch (err) {
    // A thrown failure (e.g. the server action fetch itself rejecting) must
    // never strand the row in 'syncing' — that status is excluded from every
    // retry path.
    await failAttempt('pending', err instanceof Error ? err.message : String(err))
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
    // Retry 'pending' AND 'failed' (a failed row previously had no retry path
    // at all outside a reconnect with that page open), and RE-EVALUATE
    // 'conflict' rows: syncPendingWrite re-runs conflict detection on every
    // call, so a row conflicted under stale/absent baselines (or against a
    // still-empty server page) heals itself and uploads, while a genuine
    // two-writer conflict is simply re-marked 'conflict' and keeps waiting for
    // the user's explicit resolution — the modal is never bypassed for real
    // conflicts. 'syncing' is skipped (another caller owns that row right now).
    const retryable = all.filter(
      (w) => w.syncStatus === 'pending' || w.syncStatus === 'failed' || w.syncStatus === 'conflict'
    )

    for (const write of retryable) {
      const wasConflict = write.syncStatus === 'conflict'
      await syncPendingWrite(write.id, 'offline_sync')
      const after = await db.get('pending_writes', write.id)
      if (!after) {
        synced++
      } else if (after.syncStatus === 'conflict') {
        // Only count as a NEW conflict if it wasn't already one — re-confirmed
        // conflicts shouldn't re-trigger "needs review" toasts every 30s.
        if (!wasConflict) conflicts++
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
 * (no version guard, p_expected_version: null) so this always wins over the
 * remote state.
 *
 * Delegates to save_page_checked() (migration 011) — the same atomic,
 * account-wide free-word-limit check every other save path uses. This used
 * to be a raw update with no limit check at all, meaning a writer could
 * bypass their word limit entirely by triggering a sync conflict and
 * resolving it with "Keep Local."
 *
 * On success: clears the pending write, updates cache, runs post-sync
 * maintenance. If blocked by the word limit, the pending write is left in
 * IndexedDB (nothing is lost) and the caller should surface the same
 * upgrade prompt shown elsewhere.
 */
export type ForceWriteFailureCategory =
  | 'auth'        // no session / session expired
  | 'not_found'   // page row missing or not visible to this account
  | 'network'     // request never reached the server
  | 'server'      // the RPC executed and failed, or verification disagreed

export type ForceWriteResult =
  | { status: 'ok'; wordCount: number }
  | { status: 'word_limit_blocked' }
  | { status: 'error'; category: ForceWriteFailureCategory; message: string }

function isNetworkFailureMessage(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('failed to fetch') ||
    m.includes('fetch failed') ||
    m.includes('load failed') ||
    m.includes('networkerror') ||
    m.includes('network request failed')
  )
}

export async function forceWriteLocalContent(pageId: string): Promise<ForceWriteResult> {
  const db = await getOfflineDB()
  const pending = await db.get('pending_writes', pageId)
  if (!pending) {
    return { status: 'error', category: 'server', message: 'No local draft found for this page' }
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { status: 'error', category: 'auth', message: 'No auth session — sign-in required' }
  }

  const { data, error } = await supabase.rpc('save_page_checked', {
    p_page_id: pageId,
    p_content: pending.content,
    p_word_count: pending.wordCount,
    p_expected_version: null,
  })

  if (error || !data) {
    const message = error
      ? `${error.code ? error.code + ': ' : ''}${error.message}`
      : 'Empty response from save_page_checked'
    console.error(`[sync] Keep Local force-write failed for page ${pageId}:`, message)
    return {
      status: 'error',
      category: isNetworkFailureMessage(message) ? 'network' : 'server',
      message,
    }
  }

  const result = data as
    | { status: 'ok'; updated_at: string; version: number }
    | { status: 'word_limit_blocked'; limit: number }
    | { status: 'version_mismatch' }
    | { status: 'error'; error: string }

  if (result.status === 'word_limit_blocked') {
    // Content stays in IDB as 'pending' — nothing is lost, matching the
    // regular autosave path's handling of the same outcome.
    await db.put('pending_writes', { ...pending, syncStatus: 'pending' })
    return { status: 'word_limit_blocked' }
  }

  if (result.status !== 'ok') {
    const message = result.status === 'error' ? result.error : result.status
    console.error(`[sync] Keep Local force-write rejected for page ${pageId}:`, message)
    return {
      status: 'error',
      category: message === 'Page not found' ? 'not_found' : 'server',
      message,
    }
  }

  // Verify the server now actually holds the kept version before clearing any
  // local state — "Keep Local" must never report success on trust alone.
  // (Plain list select, not .single() — see doSyncPendingWrite for why.)
  const { data: verifyRows, error: verifyError } = await supabase
    .from('pages')
    .select('word_count, version')
    .eq('id', pageId)
  const verifyRow = verifyRows && verifyRows.length === 1 ? verifyRows[0] : null

  if (!verifyError && verifyRow && (verifyRow.word_count as number) !== pending.wordCount) {
    // The RPC reported ok but the row disagrees — treat as failure, keep the
    // local draft untouched for retry.
    const message = `Post-save verification mismatch: server holds ${verifyRow.word_count} words, expected ${pending.wordCount}`
    console.error(`[sync] Keep Local verification failed for page ${pageId}:`, message)
    return { status: 'error', category: 'server', message }
  }
  // (If the verification read itself failed, the RPC's own RETURNING values —
  // the server's committed row — remain the confirmation.)

  // Only clear the exact revision the server acknowledged — a keystroke during
  // the force-write supersedes it and must stay queued.
  const latest = await db.get('pending_writes', pageId)
  if (latest && latest.localUpdatedAt === pending.localUpdatedAt) {
    await db.delete('pending_writes', pageId)
  } else if (latest) {
    await db.put('pending_writes', { ...latest, syncStatus: 'pending' })
  }

  const existingCache = await db.get('page_cache', pageId)
  await db.put('page_cache', {
    ...(existingCache ?? {}),
    id: pageId,
    content: pending.content,
    wordCount: pending.wordCount,
    serverUpdatedAt: result.updated_at,
    serverVersion: result.version,
    serverWordCount: pending.wordCount,
    serverContent: pending.content,
    cachedAt: Date.now(),
  })

  try {
    await afterPageSync(pageId)
  } catch {
    // Non-fatal
  }

  return { status: 'ok', wordCount: pending.wordCount }
}
