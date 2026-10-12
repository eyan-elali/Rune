// What THIS tab knows the server holds for each Scene: the word count and row
// version of the last server state this tab saw — read fresh from the server
// (cacheScene) or confirmed by one of its own saves (syncEngine). The editor's
// conflict check compares the server against it. It lives in memory, never
// in IndexedDB: every tab of the origin shares IndexedDB, so a baseline kept
// there is overwritten by whichever tab syncs first, erasing the evidence a
// sibling tab had diverged.
//
// It is owned here, not by each editor instance, because every save that
// reaches the server from this tab — the editor's debounced save, the
// background flush, a coalesced follow-up, a version-mismatch retry, Keep
// Local — must move it. An editor that advanced its own copy only when the
// queue was empty after a save never advanced it while the writer kept
// typing through the save, and its next save read its own earlier save as
// "changed elsewhere" (the false conflict reproduced by harness scenario fc1).
//
// Versions only ever increase on the server (scene_version_trigger), so an
// older observation arriving late — a slow read, an acknowledgement that
// lands after a newer one — never replaces a newer one.

export type TabBaseline = { wordCount: number; version?: number }

const baselines = new Map<string, TabBaseline>()

/** This tab's per-tab identity, stamped on the queue rows it writes. */
export const TAB_ID: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function getTabBaseline(sceneId: string): TabBaseline | undefined {
  return baselines.get(sceneId)
}

/**
 * The server holds this state, and this tab saw it (its own confirmed save, or
 * a fresh read with no local divergence). Ignored when this tab already knows
 * a newer version.
 */
export function noteServerState(sceneId: string, wordCount: number, version?: number): void {
  const known = baselines.get(sceneId)
  if (known?.version !== undefined && version !== undefined && version < known.version) return
  baselines.set(sceneId, { wordCount, version: version ?? known?.version })
}

/** Records a baseline only if this tab has none for the Scene yet. */
export function seedTabBaseline(sceneId: string, wordCount: number, version?: number): void {
  if (!baselines.has(sceneId)) baselines.set(sceneId, { wordCount, version })
}

/** The writer explicitly chose the server's copy (Keep Server, a History restore). */
export function acceptServerState(sceneId: string, wordCount: number, version?: number): void {
  baselines.set(sceneId, { wordCount, version })
}
