import { createClient } from '@/lib/supabase/client'
import { getOfflineDB, evictOldCacheEntries } from '@/lib/offline/db'
import { createGameSession } from '@/lib/actions/games'
import { awardProjectXp } from '@/lib/actions/xp'
import { afterPageSync } from '@/lib/actions/pages'

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

    await db.put('pending_writes', {
      id: pageId,
      userId,
      content,
      wordCount,
      localUpdatedAt: now,
      syncStatus: 'pending',
      retryCount: 0,
    })

    const existingCache = await db.get('page_cache', pageId)
    await db.put('page_cache', {
      // Preserve rich view-cache metadata if already present
      ...(existingCache ?? {}),
      id: pageId,
      content,
      wordCount,
      serverUpdatedAt: new Date(now).toISOString(),
      cachedAt: now,
    })

    void evictOldCacheEntries()
  } catch (err) {
    console.error('[offline] writeToPendingQueue failed:', err)
  }
}

// ── Individual page sync ───────────────────────────────────────────────────────

export async function syncPendingWrite(pageId: string): Promise<void> {
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

  // Fetch server state for optimistic locking
  const { data: serverPage, error: fetchError } = await supabase
    .from('pages')
    .select('updated_at, version')
    .eq('id', pageId)
    .single()

  if (fetchError || !serverPage) {
    await db.put('pending_writes', { ...pending, syncStatus: 'failed' })
    return
  }

  const serverUpdatedAtMs = new Date(serverPage.updated_at as string).getTime()
  const serverIsNewerByMs = serverUpdatedAtMs - pending.localUpdatedAt

  if (serverIsNewerByMs > 5000) {
    await db.put('pending_writes', { ...pending, syncStatus: 'conflict' })
    return
  }

  const serverVersion = serverPage.version as number

  const { data: updated, error: updateError } = await supabase
    .from('pages')
    .update({
      content: pending.content,
      word_count: pending.wordCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pageId)
    .eq('version', serverVersion)
    .select('id, updated_at, version')

  if (updateError) {
    // Network or DB error — leave as pending for next reconnect
    await db.put('pending_writes', { ...pending, syncStatus: 'pending' })
    return
  }

  if (!updated || updated.length === 0) {
    // Version mismatch — another write won; schedule one retry
    const nextRetry = pending.retryCount + 1
    await db.put('pending_writes', {
      ...pending,
      syncStatus: 'pending',
      retryCount: nextRetry,
    })
    setTimeout(() => void syncPendingWrite(pageId), 2000)
    return
  }

  // Success — remove from pending, update cache with confirmed server state
  await db.delete('pending_writes', pageId)
  const existingCacheAfterSync = await db.get('page_cache', pageId)
  await db.put('page_cache', {
    // Preserve rich view-cache metadata if already present
    ...(existingCacheAfterSync ?? {}),
    id: pageId,
    content: pending.content,
    wordCount: pending.wordCount,
    serverUpdatedAt: (updated[0].updated_at as string) ?? new Date().toISOString(),
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
      await syncPendingWrite(write.id)
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

  return { synced, failed, conflicts }
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
