import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Chapter, Page, Project } from '@/lib/types'

interface RuneOfflineDB extends DBSchema {
  pending_writes: {
    key: string // pageId
    value: {
      id: string
      userId: string
      content: Record<string, unknown> // Tiptap JSONContent
      wordCount: number
      localUpdatedAt: number
      syncStatus: 'pending' | 'syncing' | 'failed' | 'conflict'
      retryCount: number
    }
  }
  page_cache: {
    key: string // pageId
    value: {
      id: string
      content: Record<string, unknown>
      wordCount: number
      serverUpdatedAt: string
      cachedAt: number
      // Rich view-cache fields — populated by cachePage(); absent in minimal sync entries
      chapter_id?: string
      project_id?: string
      title?: string
      position?: number
      is_canonical?: boolean
      created_at?: string
      updated_at?: string
    }
  }
  chapter_meta: {
    key: string // chapterId
    value: {
      id: string
      project_id: string
      title: string
      position: number
      is_completed: boolean
      created_at: string
      updated_at: string
      project: Project
    }
  }
  pending_game_sessions: {
    key: string // local UUID
    value: {
      id: string
      userId: string
      mode: string
      enemyType: string | null
      wordsWritten: number
      durationSeconds: number
      completedAt: number
      rawXpEarned: number
      outcome: string
      synced: boolean
    }
  }
}

let dbInstance: IDBPDatabase<RuneOfflineDB> | null = null

export async function getOfflineDB(): Promise<IDBPDatabase<RuneOfflineDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<RuneOfflineDB>('rune-offline', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pending_writes')) {
        db.createObjectStore('pending_writes', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('page_cache')) {
        db.createObjectStore('page_cache', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('pending_game_sessions')) {
        db.createObjectStore('pending_game_sessions', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('chapter_meta')) {
        db.createObjectStore('chapter_meta', { keyPath: 'id' })
      }
    },
  })

  return dbInstance
}

export async function requestPersistentStorage(): Promise<void> {
  if (typeof navigator === 'undefined') return
  if (!navigator.storage?.persist) return
  await navigator.storage.persist()
}

export async function getPendingWrite(pageId: string) {
  try {
    const db = await getOfflineDB()
    return (await db.get('pending_writes', pageId)) ?? null
  } catch {
    return null
  }
}

export async function evictOldCacheEntries(): Promise<void> {
  try {
    const db = await getOfflineDB()
    const allCached = await db.getAll('page_cache')
    if (allCached.length <= 20) return
    const toDelete = allCached
      .sort((a, b) => a.cachedAt - b.cachedAt)
      .slice(0, allCached.length - 20)
    for (const entry of toDelete) {
      await db.delete('page_cache', entry.id)
    }
  } catch {
    // Silent fail — cache eviction is best-effort
  }
}

// ── View-cache helpers ─────────────────────────────────────────────────────────

function cacheEntryToPage(
  entry: RuneOfflineDB['page_cache']['value']
): Page {
  return {
    id: entry.id,
    chapter_id: entry.chapter_id!,
    title: entry.title!,
    content: entry.content,
    word_count: entry.wordCount,
    position: entry.position ?? 0,
    is_canonical: entry.is_canonical ?? false,
    created_at: entry.created_at ?? entry.serverUpdatedAt,
    updated_at: entry.updated_at ?? entry.serverUpdatedAt,
  }
}

/**
 * Store a server-fetched page for offline access.
 * Skips content overwrite when a pending local write exists.
 */
export async function cachePage(page: Page, projectId: string): Promise<void> {
  try {
    const db = await getOfflineDB()
    const pending = await db.get('pending_writes', page.id)
    const existing = await db.get('page_cache', page.id)

    if (pending && existing) {
      // User has unsaved local edits — preserve content, update metadata only
      await db.put('page_cache', {
        ...existing,
        chapter_id: page.chapter_id,
        project_id: projectId,
        title: page.title,
        position: page.position,
        is_canonical: page.is_canonical,
        created_at: page.created_at,
        updated_at: page.updated_at,
      })
    } else {
      // No local edits — cache full server page
      await db.put('page_cache', {
        id: page.id,
        content: page.content ?? {},
        wordCount: page.word_count,
        serverUpdatedAt: page.updated_at,
        cachedAt: Date.now(),
        chapter_id: page.chapter_id,
        project_id: projectId,
        title: page.title,
        position: page.position,
        is_canonical: page.is_canonical,
        created_at: page.created_at,
        updated_at: page.updated_at,
      })
      void evictOldCacheEntries()
    }
  } catch {
    // best-effort
  }
}

/** Returns the cached page if it has full metadata; null otherwise. */
export async function getCachedPage(pageId: string): Promise<Page | null> {
  try {
    const db = await getOfflineDB()
    const entry = await db.get('page_cache', pageId)
    if (!entry || !entry.chapter_id || !entry.title) return null
    return cacheEntryToPage(entry)
  } catch {
    return null
  }
}

/** Returns all pages for a chapter from the view cache, sorted by position. */
export async function getCachedPagesForChapter(chapterId: string): Promise<Page[]> {
  try {
    const db = await getOfflineDB()
    const all = await db.getAll('page_cache')
    return all
      .filter((e) => e.chapter_id === chapterId && !!e.title)
      .map(cacheEntryToPage)
      .sort((a, b) => a.position - b.position)
  } catch {
    return []
  }
}

/** Stores chapter and project metadata for offline reconstruction. */
export async function cacheChapterMeta(chapter: Chapter, project: Project): Promise<void> {
  try {
    const db = await getOfflineDB()
    await db.put('chapter_meta', {
      id: chapter.id,
      project_id: chapter.project_id,
      title: chapter.title,
      position: chapter.position,
      is_completed: chapter.is_completed,
      created_at: chapter.created_at,
      updated_at: chapter.updated_at,
      project,
    })
  } catch {
    // best-effort
  }
}

/** Returns cached chapter and project metadata, or null if not cached. */
export async function getCachedChapterMeta(
  chapterId: string
): Promise<{ chapter: Chapter; project: Project } | null> {
  try {
    const db = await getOfflineDB()
    const entry = await db.get('chapter_meta', chapterId)
    if (!entry) return null
    const { project, ...rest } = entry
    return {
      chapter: rest as Chapter,
      project,
    }
  } catch {
    return null
  }
}
