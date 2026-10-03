// Mock Supabase server: one scenes table with the version trigger semantics
// (version + updated_at bump on EVERY update — scene_version_trigger), plus a
// save_scene_checked implementation mirroring its logic (migration 015).
// Time is a controllable logical clock so timestamp comparisons are exact.

let now = 1_000_000; // logical ms clock
export function tick(ms = 1000) { now += ms; return now; }
export function nowIso() { return new Date(now).toISOString(); }

export const server = {
  scenes: new Map(), // id -> { content, word_count, version, updated_at }
  // knobs
  rpcMode: 'ok', // 'ok' | 'error' | 'word_limit_blocked' | 'hang'
  hangResolvers: [],
  // When 'hang', a fetch captures the row snapshot at CALL time and only
  // resolves — with that now-possibly-stale snapshot — once releaseFetchHang()
  // runs. This models a slow network round-trip that returns pre-write data,
  // the exact shape of the Keep-Local vs background-sync race.
  fetchMode: 'ok', // 'ok' | 'hang' | 'network_error'
  fetchHangResolvers: [],
  // Scene Trash (migration 031): a trashed Scene keeps its row but RLS hides
  // it from every client read and from save_scene_checked ('Scene not found').
  // Only the SECURITY DEFINER workspace_trash_state RPC can tell it apart from
  // a permanently deleted Scene.
  trashed: new Set(),
  trashStateMode: 'ok', // 'ok' | 'error' | 'auth_error'
  // Auth (BC-B): null models an expired/absent browser session.
  session: { user: { id: 'user-1' } },
  log: [],
};

export function resetServer() {
  server.scenes.clear();
  server.rpcMode = 'ok';
  server.hangResolvers = [];
  server.fetchMode = 'ok';
  server.fetchHangResolvers = [];
  server.trashed = new Set();
  server.trashStateMode = 'ok';
  server.session = { user: { id: 'user-1' } };
  server.log = [];
}

// trash_manuscript_scene / restore_manuscript_scene (031): neither changes
// version or updated_at. delete_trashed_manuscript_scene removes the row.
export function trashServerScene(id) {
  if (!server.scenes.has(id)) throw new Error('no such page');
  server.trashed.add(id);
  server.log.push({ op: 'trash', id });
}
export function restoreServerScene(id) {
  server.trashed.delete(id);
  server.log.push({ op: 'restore', id });
}
export function deleteServerScene(id) {
  server.scenes.delete(id);
  server.trashed.delete(id);
  server.log.push({ op: 'delete', id });
}

// workspace_trash_state('scene', id) — 'active' | 'trashed' | 'missing'.
export async function workspaceTrashState({ p_type, p_id }) {
  server.log.push({ op: 'workspace_trash_state', id: p_id, type: p_type });
  if (server.trashStateMode === 'error') {
    return { error: { message: 'TypeError: Failed to fetch' }, data: null };
  }
  // PostgREST with an expired JWT, or the anon role (execute revoked, 030).
  if (server.trashStateMode === 'auth_error') {
    return { error: { code: 'PGRST301', message: 'JWT expired' }, data: null };
  }
  if (p_type !== 'scene' || !server.scenes.has(p_id)) return { error: null, data: { status: 'ok', state: 'missing' } };
  return { error: null, data: { status: 'ok', state: server.trashed.has(p_id) ? 'trashed' : 'active' } };
}

export function createServerPage(id, { wordCount = 0, content = null } = {}) {
  server.scenes.set(id, {
    content,
    word_count: wordCount,
    version: 1,
    updated_at: nowIso(),
  });
  return structuredClone(server.scenes.get(id));
}

// The migration-006 trigger: ANY update bumps version and updated_at.
function triggerBump(row) {
  row.version += 1;
  row.updated_at = nowIso();
}

// Metadata-only update — renameScene / reorderScenes / placement change.
export function metadataUpdate(id) {
  tick(1000);
  const row = server.scenes.get(id);
  if (!row) throw new Error('no such page');
  triggerBump(row);
  server.log.push({ op: 'metadata_update', id, version: row.version });
}

// Content save from ANOTHER device/browser (bypasses this client entirely).
export function remoteContentSave(id, content, wordCount) {
  tick(1000);
  const row = server.scenes.get(id);
  if (!row) throw new Error('no such page');
  row.content = content;
  row.word_count = wordCount;
  triggerBump(row);
  server.log.push({ op: 'remote_content_save', id, words: wordCount });
}

// Rune 2.0 canonical cutover as it lands on one row (architecture doc §42):
// only placement metadata changes; id, content and word_count never do. The
// real data step suppresses the version trigger; `bumpVersion` models a data
// step that forgot to, which the client must still survive.
export function applyPlacementMigration(id, { chapterId, bumpVersion = false }) {
  tick(1000);
  const row = server.scenes.get(id);
  if (!row) throw new Error('no such page');
  row.chapter_id = chapterId;
  if (bumpVersion) triggerBump(row);
  server.log.push({ op: 'placement_migration', id, chapterId, version: row.version });
}

export function releaseHang() {
  for (const r of server.hangResolvers) r();
  server.hangResolvers = [];
}

export function releaseFetchHang() {
  for (const r of server.fetchHangResolvers) r();
  server.fetchHangResolvers = [];
}

// save_scene_checked semantics (word limit not modeled unless knob set)
export async function saveSceneChecked({ p_scene_id, p_content, p_word_count, p_expected_version }) {
  server.log.push({ op: 'save_scene_checked', id: p_scene_id, words: p_word_count, expectedVersion: p_expected_version });
  if (server.rpcMode === 'hang') {
    await new Promise((resolve) => server.hangResolvers.push(resolve));
  }
  if (server.rpcMode === 'error') {
    return { error: { message: 'simulated postgres error (P0001)' }, data: null };
  }
  // An older server (or a rolled-back one): the function the client calls is not there.
  if (server.rpcMode === 'missing_function') {
    return { error: { code: 'PGRST202', message: 'Could not find the function public.save_scene_checked(p_content, p_expected_version, p_scene_id, p_word_count) in the schema cache' }, data: null };
  }
  // The server action's own answer when the request carries no usable session.
  if (server.rpcMode === 'unauthenticated') {
    return { error: null, data: { status: 'error', error: 'Not authenticated' } };
  }
  const row = server.scenes.get(p_scene_id);
  if (!row || server.trashed.has(p_scene_id)) return { error: null, data: { status: 'error', error: 'Scene not found' } };
  if (server.rpcMode === 'word_limit_blocked' && p_word_count > row.word_count) {
    return { error: null, data: { status: 'word_limit_blocked', limit: 2000 } };
  }
  if (p_expected_version !== null && p_expected_version !== undefined) {
    if (row.version !== p_expected_version) {
      return { error: null, data: { status: 'version_mismatch' } };
    }
  }
  tick(500);
  row.content = p_content;
  row.word_count = p_word_count;
  triggerBump(row);
  return { error: null, data: { status: 'ok', updated_at: row.updated_at, version: row.version } };
}

export async function fetchScene(id) {
  // Snapshot at CALL time — a hung fetch must resolve with the state it saw when
  // it started, not the state after a concurrent write commits.
  const row = server.trashed.has(id) ? undefined : server.scenes.get(id);
  const snapshot = row ? structuredClone(row) : null;
  if (server.fetchMode === 'hang') {
    await new Promise((resolve) => server.fetchHangResolvers.push(resolve));
  }
  if (server.fetchMode === 'network_error') {
    return { data: null, error: { message: 'TypeError: Failed to fetch', transport: true } };
  }
  if (!snapshot) return { data: null, error: { message: 'not found' } };
  return { data: snapshot, error: null };
}
