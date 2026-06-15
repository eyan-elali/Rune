import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

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

  dbInstance = await openDB<RuneOfflineDB>('rune-offline', 1, {
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
    },
  })

  return dbInstance
}

export async function requestPersistentStorage(): Promise<void> {
  if (typeof navigator === 'undefined') return
  if (!navigator.storage?.persist) return
  await navigator.storage.persist()
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
