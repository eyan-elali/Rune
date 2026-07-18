// Mock Supabase server: one pages table with the production trigger semantics
// (version + updated_at bump on EVERY update — migration 006), plus a
// save_page_checked implementation mirroring migration 011's logic.
// Time is a controllable logical clock so timestamp comparisons are exact.

let now = 1_000_000; // logical ms clock
export function tick(ms = 1000) { now += ms; return now; }
export function nowIso() { return new Date(now).toISOString(); }

export const server = {
  pages: new Map(), // id -> { content, word_count, version, updated_at }
  // knobs
  rpcMode: 'ok', // 'ok' | 'error' | 'word_limit_blocked' | 'hang'
  hangResolvers: [],
  log: [],
};

export function resetServer() {
  server.pages.clear();
  server.rpcMode = 'ok';
  server.hangResolvers = [];
  server.log = [];
}

export function createServerPage(id, { wordCount = 0, content = null } = {}) {
  server.pages.set(id, {
    content,
    word_count: wordCount,
    version: 1,
    updated_at: nowIso(),
  });
  return structuredClone(server.pages.get(id));
}

// The migration-006 trigger: ANY update bumps version and updated_at.
function triggerBump(row) {
  row.version += 1;
  row.updated_at = nowIso();
}

// Metadata-only update — renamePage / reorderPages / canonical toggle.
export function metadataUpdate(id) {
  tick(1000);
  const row = server.pages.get(id);
  if (!row) throw new Error('no such page');
  triggerBump(row);
  server.log.push({ op: 'metadata_update', id, version: row.version });
}

// Content save from ANOTHER device/browser (bypasses this client entirely).
export function remoteContentSave(id, content, wordCount) {
  tick(1000);
  const row = server.pages.get(id);
  if (!row) throw new Error('no such page');
  row.content = content;
  row.word_count = wordCount;
  triggerBump(row);
  server.log.push({ op: 'remote_content_save', id, words: wordCount });
}

export function releaseHang() {
  for (const r of server.hangResolvers) r();
  server.hangResolvers = [];
}

// migration 011 save_page_checked semantics (word limit not modeled unless knob set)
export async function savePageChecked({ p_page_id, p_content, p_word_count, p_expected_version }) {
  server.log.push({ op: 'save_page_checked', id: p_page_id, words: p_word_count, expectedVersion: p_expected_version });
  if (server.rpcMode === 'hang') {
    await new Promise((resolve) => server.hangResolvers.push(resolve));
  }
  if (server.rpcMode === 'error') {
    return { error: { message: 'simulated postgres error (P0001)' }, data: null };
  }
  const row = server.pages.get(p_page_id);
  if (!row) return { error: null, data: { status: 'error', error: 'Page not found' } };
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

export function fetchPage(id) {
  const row = server.pages.get(id);
  if (!row) return { data: null, error: { message: 'not found' } };
  return { data: structuredClone(row), error: null };
}
