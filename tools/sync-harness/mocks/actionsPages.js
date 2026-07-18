import { savePageChecked } from './serverState.js';

// Mirrors src/lib/actions/pages.ts syncPageWithLimitCheck: thin wrapper over
// the save_page_checked RPC with the same discriminated-union mapping.
export async function syncPageWithLimitCheck(id, content, wordCount, serverVersion, _savePath) {
  const { error, data } = await savePageChecked({
    p_page_id: id,
    p_content: content,
    p_word_count: wordCount,
    p_expected_version: serverVersion,
  });
  if (error) return { status: 'error', error: error.message };
  const result = data;
  if (result.status === 'error') return { status: 'error', error: result.error };
  if (result.status === 'word_limit_blocked') return { status: 'word_limit_blocked' };
  if (result.status === 'version_mismatch') return { status: 'version_mismatch' };
  return { status: 'ok', updated_at: result.updated_at, version: result.version };
}

export const afterPageSyncCalls = [];
export async function afterPageSync(pageId) {
  afterPageSyncCalls.push(pageId);
}
