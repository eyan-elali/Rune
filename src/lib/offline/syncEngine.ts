import { createClient } from '@/lib/supabase/client'
import { getOfflineDB, evictOldCacheEntries, SCENE_CACHE_STORE, type PendingWrite } from '@/lib/offline/db'
import { createGameSession } from '@/lib/actions/games'
import { awardProjectXp } from '@/lib/actions/xp'
import { afterSceneSync, syncSceneWithLimitCheck } from '@/lib/actions/scenes'
import { recordWordsWritten } from '@/lib/actions/writingStats'
import { isMissingServerFunction } from '@/lib/offline/serverCompat'

// ── Write queue ───────────────────────────────────────────────────────────────

export async function writeToPendingQueue(
  sceneId: string,
  userId: string,
  content: Record<string, unknown>,
  wordCount: number
): Promise<void> {
  try {
    const db = await getOfflineDB()
    const now = Date.now()

    // Preserve 'conflict' status — a conflicted scene must not be silently reset to
    // 'pending' by keystrokes. The user must resolve the conflict explicitly via the modal.
    const existing = await db.get('pending_writes', sceneId)
    const statusToWrite = existing?.syncStatus === 'conflict' ? 'conflict' : 'pending'

    await db.put('pending_writes', {
      id: sceneId,
      userId,
      content,
      wordCount,
      localUpdatedAt: now,
      syncStatus: statusToWrite,
      retryCount: 0,
    })

    const existingCache = await db.get(SCENE_CACHE_STORE, sceneId)
    await db.put(SCENE_CACHE_STORE, {
      // Preserve all existing cache metadata — critically including serverUpdatedAt,
      // which is the last confirmed server snapshot used for conflict detection.
      // Overwriting it with local clock time would destroy the baseline and allow
      // silent overwrites of concurrent server edits on reconnect.
      ...(existingCache ?? {}),
      id: sceneId,
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

// ── Individual scene sync ───────────────────────────────────────────────────────

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

// A row still 'syncing' this long after it was marked is treated as stranded
// (its request can't still be running) and revived by the background flush.
const STRANDED_SYNCING_MS = 2 * 60 * 1000

// Whether a queued save last failed because this server lacks the save
// function the client calls (an older server behind a newer client). The
// prose is kept and the row stays 'failed', but the timed background flush
// leaves it alone: the answer would not change until the client reloads or
// the server is updated. A reload replays it (the editor syncs the Scene it
// opens directly), as do "Send now" and logging out, which pass
// `includeUnsupported`.
export function isUnsupportedSaveFailure(write: Pick<PendingWrite, 'syncStatus' | 'lastError'>): boolean {
  return write.syncStatus === 'failed' && isMissingServerFunction(write.lastError)
}

// Whether a queued save carries prose the server has not confirmed. The last
// confirmed server copy is the cache's serverContent baseline; a save whose
// content equals it, or a content-empty save (no words), adds nothing. With
// no baseline at all, any words count as unsaved — never guess otherwise.
function holdsUnsavedProse(
  write: { content: Record<string, unknown>; wordCount: number },
  cached: { serverContent?: Record<string, unknown> } | undefined
): boolean {
  if (write.wordCount <= 0 && !hasText(write.content)) return false
  if (cached?.serverContent !== undefined) {
    return stableStringify(write.content) !== stableStringify(cached.serverContent)
  }
  return true
}

function hasText(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const n = node as { type?: string; text?: string; content?: unknown[] }
  if (n.type === 'text') return typeof n.text === 'string' && n.text.trim().length > 0
  return Array.isArray(n.content) && n.content.some(hasText)
}

// What the server knows about a Scene this account cannot read. 'trashed' and
// 'missing' are the RPC's definite answers (it runs as SECURITY DEFINER, so
// Trash is visible to it); 'active' means the read above should have worked
// (a race or policy gap — retry); 'unknown' means the RPC itself failed
// (network, or a database without migration 031) — never a reason to retire.
type MissingSceneState = 'trashed' | 'missing' | 'active' | 'unknown'

async function classifyMissingScene(
  supabase: ReturnType<typeof createClient>,
  sceneId: string
): Promise<MissingSceneState> {
  try {
    const { data, error } = await supabase.rpc('workspace_trash_state', { p_type: 'scene', p_id: sceneId })
    if (error) return 'unknown'
    const state = (data as { status?: string; state?: string } | null)?.state
    if (state === 'trashed' || state === 'missing' || state === 'active') return state
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// Per-scene exclusive operation chain. It serializes the two kinds of
// server-reconciling operations that must never interleave for a single scene:
// a background/editor sync (doSyncPendingWrite) and the "Keep Local" force-write
// (doForceWriteLocalContent). syncPendingWrite alone was already serialized by
// inFlightSyncs below, but forceWriteLocalContent bypassed it entirely — so a
// sync that had captured the server row and the pending snapshot BEFORE a
// concurrent Keep Local could complete AFTER it, comparing a stale fetched
// server word_count against the freshly-written cache baseline (a false
// conflict) and resurrecting the just-deleted pending row via putStatus's
// fallback to the stale snapshot. Chaining both through this lock makes that
// race impossible: whichever operation starts first runs to completion, and the
// other sees the fully-reconciled state.
//
// Ordering follows call order (the map is read+set synchronously at entry). The
// chain link is settled-guarded so one operation's rejection can never reject
// the operations queued behind it, and the returned promise still carries the
// operation's own result/rejection unchanged.
const sceneOpChains = new Map<string, Promise<unknown>>()

function runExclusive<T>(sceneId: string, op: () => Promise<T>): Promise<T> {
  const prev = sceneOpChains.get(sceneId) ?? Promise.resolve()
  const run = prev.then(op, op)
  const link = run.then(() => undefined, () => undefined)
  sceneOpChains.set(sceneId, link)
  void link.then(() => {
    // Drop the entry once this scene's queue has fully drained, so a long-lived
    // session doesn't accumulate one settled promise per scene ever touched.
    if (sceneOpChains.get(sceneId) === link) sceneOpChains.delete(sceneId)
  })
  return run
}

// At most one authoritative sync per scene at a time. Two callers (the editor's
// debounced save and the 30-second background flush) used to run
// syncPendingWrite concurrently for the same scene; both would fetch the same
// server version, one save would win, and the loser's version_mismatch retry
// added avoidable churn. Coalescing concurrent syncs onto one in-flight promise
// avoids that; runExclusive above additionally serializes syncs against the
// Keep Local force-write.
const inFlightSyncs = new Map<string, Promise<void>>()

export function syncPendingWrite(
  sceneId: string,
  savePath: 'online' | 'offline_sync' = 'online',
  // The word count this caller last confirmed the server holds for this scene —
  // passed only by the actively-open editor tab, which tracks it privately in
  // memory (never in IndexedDB, which every tab of the origin shares): the
  // shared page_cache baseline is overwritten by whichever tab syncs first,
  // erasing the evidence a sibling tab had diverged, so only a private
  // in-memory baseline can detect a second tab's save.
  expectedWordCount?: number
): Promise<void> {
  const existing = inFlightSyncs.get(sceneId)
  if (existing) return existing

  const run = runExclusive(sceneId, () => doSyncPendingWrite(sceneId, savePath, expectedWordCount))
    .finally(() => { inFlightSyncs.delete(sceneId) })
  inFlightSyncs.set(sceneId, run)
  return run
}

async function doSyncPendingWrite(
  sceneId: string,
  savePath: 'online' | 'offline_sync',
  expectedWordCount?: number
): Promise<void> {
  const db = await getOfflineDB()
  const pending = await db.get('pending_writes', sceneId)
  if (!pending) return
  // Terminal: the Scene is gone from the server and this prose is held for
  // the writer (Settings → Sync). Never retried — a new keystroke on a Scene
  // that exists again re-queues the row as 'pending' via writeToPendingQueue.
  if (pending.syncStatus === 'retired') return

  await db.put('pending_writes', { ...pending, syncStatus: 'syncing', syncingSince: Date.now() })

  // Writes a status change onto the LATEST queued row rather than the snapshot
  // read at entry — a keystroke during this sync overwrites the pending row
  // with newer content, and spreading the stale snapshot would silently revert
  // the durable queue to older prose.
  async function putStatus(
    status: 'pending' | 'failed' | 'conflict' | 'retired',
    extra?: Partial<Pick<PendingWrite, 'lastError' | 'lastErrorAt' | 'retiredAt' | 'retiredReason'>>
  ): Promise<void> {
    const latest = (await db.get('pending_writes', sceneId)) ?? pending!
    await db.put('pending_writes', { ...latest, syncStatus: status, ...(extra ?? {}) })
  }

  // Marks the attempt as failed-but-retryable without ever losing content, and
  // records WHY it failed — the previous version of this engine swallowed every
  // server error into an indistinguishable silent retry, which made a
  // persistently failing save look like an ordinary "Saving..." forever.
  // The reason is logged when it first appears for this row, not on every
  // 30-second retry that fails the same way: the queue row's lastError already
  // carries it, and a steady failure must not fill the console.
  async function failAttempt(
    status: 'pending' | 'failed',
    reason: string
  ): Promise<void> {
    const latest = await db.get('pending_writes', sceneId)
    if (latest?.lastError !== reason) {
      console.error(`[sync] scene ${sceneId} save did not persist (${status}):`, reason)
    }
    await putStatus(status, { lastError: reason, lastErrorAt: Date.now() })
  }

  // Terminal outcome for a queued save whose Scene is definitively gone. Prose
  // the server never confirmed is kept as a 'retired' row for the writer;
  // prose the server already holds is dropped, since there is nothing to save.
  async function retireStaleWrite(reason: string): Promise<void> {
    const latest = (await db.get('pending_writes', sceneId)) ?? pending!
    const cached = await db.get(SCENE_CACHE_STORE, sceneId)
    if (!holdsUnsavedProse(latest, cached)) {
      console.warn(`[sync] scene ${sceneId} queued save retired and dropped: ${reason} (its content was already on the server)`)
      await db.delete('pending_writes', sceneId)
      return
    }
    console.warn(`[sync] scene ${sceneId} queued save retired and kept for recovery in Settings → Sync: ${reason}`)
    await putStatus('retired', { retiredAt: Date.now(), retiredReason: reason, lastError: reason, lastErrorAt: Date.now() })
  }

  try {
    const supabase = createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      await failAttempt('failed', 'No auth session — sign-in required')
      return
    }
    if (pending.userId && session.user.id !== pending.userId) {
      // IndexedDB is per origin, not per account: this row was queued by a
      // different writer on this browser. Its Scene is invisible to the
      // current session, which must never be mistaken for the Scene being
      // gone — keep it for that account's next sign-in.
      await failAttempt('failed', 'Queued by a different account on this browser — will sync when that account signs in')
      return
    }

    // Fetch current server state. Deliberately NOT .single(): PostgREST turns
    // both "zero rows" and "more than one row" into the same opaque
    // "Cannot coerce the result to a single JSON object" (PGRST116), which
    // hides the three very different situations below. Fetch as a plain list
    // and classify explicitly.
    const { data: serverRows, error: fetchError } = await supabase
      .from('scenes')
      .select('updated_at, version, word_count')
      .eq('id', sceneId)

    if (fetchError) {
      // A real query/transport error — surface the actual PostgREST message.
      await failAttempt(
        'failed',
        `Could not read server scene state: ${fetchError.code ? fetchError.code + ': ' : ''}${fetchError.message}`
      )
      return
    }
    if (!serverRows || serverRows.length === 0) {
      // The row is invisible to this account's reads. RLS (031) hides a
      // trashed Scene exactly like a deleted one, so this is NOT yet proof the
      // Scene is gone: ask the SECURITY DEFINER trash-state RPC, which sees
      // through RLS, and act on what it answers. Anything short of a definite
      // answer stays 'failed' — durable, retried, prose preserved.
      const state = await classifyMissingScene(supabase, sceneId)
      if (state === 'trashed') {
        // In Trash, restorable: the queued prose waits for the restore (then
        // save_scene_checked accepts it again). Nothing to wait for when the
        // server already holds this content — retire the row instead of
        // retrying an empty save for as long as the Scene sits in Trash.
        const cached = await db.get(SCENE_CACHE_STORE, sceneId)
        const latest = (await db.get('pending_writes', sceneId)) ?? pending
        if (!holdsUnsavedProse(latest, cached)) {
          await retireStaleWrite('Scene is in Trash')
          return
        }
        await failAttempt('failed', 'Scene is in Trash — the queued save will resume once it is restored')
        return
      }
      if (state === 'missing') {
        await retireStaleWrite('Server scene row is gone — the Scene was permanently deleted or is not this account\'s')
        return
      }
      await failAttempt(
        'failed',
        state === 'active'
          ? 'Server scene row not readable although the Scene is active — will retry'
          : 'Server scene row not found and its Trash state could not be determined — will retry'
      )
      return
    }
    if (serverRows.length > 1) {
      // scenes.id is the primary key — more than one row is an invariant
      // violation that must never be silently reconciled.
      await failAttempt(
        'failed',
        `Invariant violation: ${serverRows.length} rows returned for scene id ${sceneId}`
      )
      return
    }
    const serverScene = serverRows[0]

    // ── Conflict detection ───────────────────────────────────────────────────
    //
    // A genuine conflict needs evidence that the server's CONTENT changed away
    // from the last baseline this device confirmed — not merely that the row
    // was touched. scenes.version and updated_at are bumped by the DB trigger
    // on *any* update (title rename, reorder, placement change), so they
    // are metadata signals, not content signals. scenes.word_count is only ever
    // written by the content-save path, so word-count-vs-confirmed-baseline is
    // the primary signal; a deep content comparison disambiguates the one case
    // word count can't (a remote edit that happens to land on the identical
    // word count).
    //
    // First-upload rule: a server scene holding 0 words is content-empty. Local
    // prose diverging from an empty server scene is NOT a two-writer conflict —
    // it is the first real upload (or a re-upload after the server copy never
    // received content). Uploading destroys nothing; forcing the writer
    // through a conflict modal against a 0-word "server version" risks them
    // clicking "Keep Server" and losing real prose to an empty scene. This rule
    // runs before every other signal and is what automatically recovers scenes
    // stranded by earlier false conflicts.
    const serverWordCountNow = serverScene.word_count as number
    const cachedScene = await db.get(SCENE_CACHE_STORE, sceneId)

    let serverHasChanged: boolean
    if (serverWordCountNow === 0 && pending.wordCount > 0) {
      serverHasChanged = false
    } else if (expectedWordCount !== undefined) {
      // Actively-open editor tab: private, in-memory confirmed baseline.
      serverHasChanged = serverWordCountNow !== expectedWordCount
    } else if (cachedScene?.serverWordCount !== undefined) {
      // Confirmed content baseline from this device's last successful sync (or
      // the server fetch that first cached the scene).
      if (serverWordCountNow !== cachedScene.serverWordCount) {
        serverHasChanged = true
      } else if (
        cachedScene.serverVersion !== undefined &&
        (serverScene.version as number) > cachedScene.serverVersion &&
        cachedScene.serverContent !== undefined
      ) {
        // Word count matches the confirmed baseline but the row's version
        // advanced past it. Usually that is a metadata-only bump (rename /
        // reorder / placement change). But word-count equality alone is not
        // proof the content is unchanged — a remote edit can land on the
        // identical count — so fetch the server content and compare it
        // structurally against the confirmed baseline copy.
        const { data: contentRows, error: contentError } = await supabase
          .from('scenes')
          .select('content')
          .eq('id', sceneId)
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
            `Server scene row count changed mid-sync during deep check (${contentRows?.length ?? 0} rows)`
          )
          return
        }
        serverHasChanged =
          stableStringify(contentRows[0].content ?? {}) !==
          stableStringify(cachedScene.serverContent ?? {})
      } else {
        serverHasChanged = false
      }
    } else if (cachedScene?.serverUpdatedAt) {
      // Legacy cache entry (written before serverWordCount existed): fall back
      // to the old timestamp/version heuristic. Metadata-only updates can
      // still trip this, but only until the first confirmed sync upgrades the
      // entry with a content baseline — and the first-upload rule above
      // already defuses the dangerous empty-server case.
      const serverMs = new Date(serverScene.updated_at as string).getTime()
      const cachedMs = new Date(cachedScene.serverUpdatedAt).getTime()
      serverHasChanged =
        serverMs > cachedMs ||
        (cachedScene.serverVersion !== undefined &&
          (serverScene.version as number) > cachedScene.serverVersion)
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

    const serverVersion = serverScene.version as number

    // Server action enforces free-tier word limit + version guard in one call.
    // savePath is passed through only for analytics failure-diagnostics
    // (see recordAnalyticsEvent(first_save) below) — it has no effect on sync
    // behavior itself.
    const syncResult = await syncSceneWithLimitCheck(
      sceneId,
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
      if (isMissingServerFunction(syncResult.error)) {
        // This server has no save function this client can call: never a
        // reason to drop or retire the prose, and no reason to retry on a
        // timer either (see isUnsupportedSaveFailure). The editor shows it
        // and asks for a reload.
        await failAttempt('failed', syncResult.error)
        return
      }
      // Server or DB error — leave as pending for retry, but record the real
      // reason instead of discarding it.
      await failAttempt('pending', syncResult.error)
      return
    }

    if (syncResult.status === 'version_mismatch') {
      // Another write won the version race — schedule one retry, preserving
      // this caller's confirmed baseline so the retry's conflict check stays
      // content-aware instead of degrading to the cache heuristic.
      const latest = (await db.get('pending_writes', sceneId)) ?? pending
      await db.put('pending_writes', {
        ...latest,
        syncStatus: 'pending',
        retryCount: latest.retryCount + 1,
      })
      setTimeout(() => void syncPendingWrite(sceneId, savePath, expectedWordCount), 2000)
      return
    }

    // syncResult.status === 'ok' — the server confirmed THIS pending revision
    // (identified by localUpdatedAt). Only clear the queue if no newer local
    // content arrived while the request was in flight: a keystroke during the
    // save overwrites the pending row, and deleting it here would silently
    // drop the newest prose from the durable queue.
    const latest = await db.get('pending_writes', sceneId)
    if (latest && latest.localUpdatedAt === pending.localUpdatedAt) {
      await db.delete('pending_writes', sceneId)
    } else if (latest) {
      // Newer content superseded the acknowledged revision — leave it queued
      // for the next cycle.
      await db.put('pending_writes', { ...latest, syncStatus: 'pending' })
    }

    // Update cache with the confirmed server state (what the server now holds
    // is exactly the revision we just wrote, regardless of newer local edits).
    const existingCacheAfterSync = await db.get(SCENE_CACHE_STORE, sceneId)
    await db.put(SCENE_CACHE_STORE, {
      // Preserve rich view-cache metadata if already present
      ...(existingCacheAfterSync ?? {}),
      id: sceneId,
      content: pending.content,
      wordCount: pending.wordCount,
      serverUpdatedAt: syncResult.updated_at,
      serverVersion: syncResult.version,
      serverWordCount: pending.wordCount,
      serverContent: pending.content,
      cachedAt: Date.now(),
    })

    // Server-side maintenance: touch the Chapter's updated_at and recalculate
    // the project's ordered manuscript total.
    try {
      await afterSceneSync(sceneId)
    } catch {
      // Non-fatal — scene content is saved; totals will correct on next full navigation.
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

export async function flushPendingQueue(options: {
  /**
   * Also retry saves this server last refused as unsupported
   * (isUnsupportedSaveFailure) — for a writer-initiated attempt ("Send now",
   * logging out). The timed flush leaves them for a reloaded client.
   */
  includeUnsupported?: boolean
} = {}): Promise<{
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
    // at all outside a reconnect with that scene open), and RE-EVALUATE
    // 'conflict' rows: syncPendingWrite re-runs conflict detection on every
    // call, so a row conflicted under stale/absent baselines (or against a
    // still-empty server scene) heals itself and uploads, while a genuine
    // two-writer conflict is simply re-marked 'conflict' and keeps waiting for
    // the user's explicit resolution — the modal is never bypassed for real
    // conflicts. 'syncing' is skipped (another caller owns that row right now).
    // 'retired' is terminal and never retried. A 'syncing' row is skipped
    // while a caller in THIS tab owns it; one marked 'syncing' long ago (or by
    // an earlier client, with no timestamp) belonged to a sync that never
    // finished — a closed tab mid-request — and is revived here, else it
    // would stay stranded forever: no retry path ever looked at 'syncing'.
    const now = Date.now()
    const retryable = all.filter(
      (w) =>
        w.syncStatus === 'pending' ||
        (w.syncStatus === 'failed' && (options.includeUnsupported || !isUnsupportedSaveFailure(w))) ||
        w.syncStatus === 'conflict' ||
        (w.syncStatus === 'syncing' &&
          !inFlightSyncs.has(w.id) &&
          (w.syncingSince === undefined || now - w.syncingSince > STRANDED_SYNCING_MS))
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
 * Entries are grouped by (projectId, sceneId, sessionDate) so a full offline
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

    // Group by (projectId, sceneId, sessionDate) → one server call per group
    type GroupKey = string
    const groups = new Map<GroupKey, typeof all>()
    for (const entry of all) {
      const key = `${entry.projectId ?? ''}:${entry.pageId}:${entry.sessionDate}`
      const group = groups.get(key) ?? []
      group.push(entry)
      groups.set(key, group)
    }

    for (const entries of groups.values()) {
      const { projectId, pageId: sceneId, sessionDate } = entries[0]
      const totalWords = entries.reduce((sum, e) => sum + e.wordsAdded, 0)
      if (totalWords <= 0) {
        for (const e of entries) await db.delete('pending_writing_credits', e.id)
        continue
      }

      try {
        await recordWordsWritten(projectId, totalWords, sceneId, sessionDate)
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

export async function getConflictedScenes() {
  const db = await getOfflineDB()
  const all = await db.getAll('pending_writes')
  return all.filter((w) => w.syncStatus === 'conflict')
}

// ── Conflict resolution ────────────────────────────────────────────────────────

/**
 * Force-write the local pending content to Supabase, bypassing the staleness
 * check that would normally mark a write as a conflict. Uses the scene ID alone
 * (no version guard, p_expected_version: null) so this always wins over the
 * remote state.
 *
 * Delegates to save_scene_checked() — the same atomic,
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
  | 'not_found'   // scene row missing or not visible to this account
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

export function forceWriteLocalContent(sceneId: string): Promise<ForceWriteResult> {
  // Serialized against syncPendingWrite through the same per-scene lock: a
  // background/editor sync already in flight for this scene must finish (and
  // publish its reconciled state) before the force-write reads the pending row
  // and cache, and any sync started while the force-write runs waits until it
  // has committed version N+1 and the confirmed baseline. This closes the race
  // where a stale in-flight sync raised a false conflict after Keep Local had
  // already succeeded. See runExclusive above.
  return runExclusive(sceneId, () => doForceWriteLocalContent(sceneId))
}

async function doForceWriteLocalContent(sceneId: string): Promise<ForceWriteResult> {
  const db = await getOfflineDB()
  const pending = await db.get('pending_writes', sceneId)
  if (!pending) {
    return { status: 'error', category: 'server', message: 'No local draft found for this scene' }
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { status: 'error', category: 'auth', message: 'No auth session — sign-in required' }
  }

  const { data, error } = await supabase.rpc('save_scene_checked', {
    p_scene_id: sceneId,
    p_content: pending.content,
    p_word_count: pending.wordCount,
    p_expected_version: null,
  })

  if (error || !data) {
    const message = error
      ? `${error.code ? error.code + ': ' : ''}${error.message}`
      : 'Empty response from save_scene_checked'
    console.error(`[sync] Keep Local force-write failed for scene ${sceneId}:`, message)
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
    console.error(`[sync] Keep Local force-write rejected for scene ${sceneId}:`, message)
    return {
      status: 'error',
      // The literal not-found error string of save_scene_checked.
      category: message === 'Scene not found' ? 'not_found' : 'server',
      message,
    }
  }

  // Verify the server now actually holds the kept version before clearing any
  // local state — "Keep Local" must never report success on trust alone.
  // (Plain list select, not .single() — see doSyncPendingWrite for why.)
  const { data: verifyRows, error: verifyError } = await supabase
    .from('scenes')
    .select('word_count, version')
    .eq('id', sceneId)
  const verifyRow = verifyRows && verifyRows.length === 1 ? verifyRows[0] : null

  if (!verifyError && verifyRow && (verifyRow.word_count as number) !== pending.wordCount) {
    // The RPC reported ok but the row disagrees — treat as failure, keep the
    // local draft untouched for retry.
    const message = `Post-save verification mismatch: server holds ${verifyRow.word_count} words, expected ${pending.wordCount}`
    console.error(`[sync] Keep Local verification failed for scene ${sceneId}:`, message)
    return { status: 'error', category: 'server', message }
  }
  // (If the verification read itself failed, the RPC's own RETURNING values —
  // the server's committed row — remain the confirmation.)

  // Only clear the exact revision the server acknowledged — a keystroke during
  // the force-write supersedes it and must stay queued.
  const latest = await db.get('pending_writes', sceneId)
  if (latest && latest.localUpdatedAt === pending.localUpdatedAt) {
    await db.delete('pending_writes', sceneId)
  } else if (latest) {
    await db.put('pending_writes', { ...latest, syncStatus: 'pending' })
  }

  const existingCache = await db.get(SCENE_CACHE_STORE, sceneId)
  await db.put(SCENE_CACHE_STORE, {
    ...(existingCache ?? {}),
    id: sceneId,
    content: pending.content,
    wordCount: pending.wordCount,
    serverUpdatedAt: result.updated_at,
    serverVersion: result.version,
    serverWordCount: pending.wordCount,
    serverContent: pending.content,
    cachedAt: Date.now(),
  })

  try {
    await afterSceneSync(sceneId)
  } catch {
    // Non-fatal
  }

  return { status: 'ok', wordCount: pending.wordCount }
}
