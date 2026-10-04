// Pins the "before Rune 2.0" production truth recorded in the committed
// catalog snapshot (2026-09-24). These are not PGlite behaviours — they are
// facts about the real manuscript data and schema that later migrations must
// preserve intentionally. Replacing the snapshot with a newer capture makes
// this file fail until each changed fact is reviewed and updated on purpose.
//
// The live equivalent is tools/db-audit/diff-catalog.mjs, which compares
// row_counts/integrity before and after every production migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { REPO_DIR } from '../lib/pg.mjs';
import { loadCatalog } from '../../db-audit/catalog-lib.mjs';

const snap = loadCatalog(path.join(REPO_DIR, 'src/lib/supabase/catalog/production-2026-09-24.json'));
const col = (t, c) => snap.columns.find((x) => x.table === t && x.column === c);
const con = (n) => snap.constraints.find((x) => x.name === n);
const fn = (n) => snap.functions.filter((x) => x.name === n);

test('manuscript volume (row counts)', () => {
  assert.equal(snap.row_counts.projects, 69);
  assert.equal(snap.row_counts.chapters, 163);
  assert.equal(snap.row_counts.pages, 280);
  assert.equal(snap.row_counts.writing_sessions, 290);
});

test('manuscript shape the Page → Scene migration must handle', () => {
  const i = snap.integrity;
  assert.equal(i.projects_without_chapters, 2, 'Projects with no Chapter (partial creation)');
  assert.equal(i.chapters_without_pages, 1, 'Chapter with no Page');
  assert.equal(i.chapters_with_canonical_page, 32);
  assert.equal(i.chapters_with_multiple_canonical_pages, 0, 'single-canonical invariant holds');
  assert.deepEqual(i.noncanonical_pages_in_canonical_chapters, { pages: 86, words: 41998 },
    'these become Unplaced Scenes under the approved mapping — prose must survive exactly');
  assert.equal(i.canonical_pages_with_zero_words_whose_siblings_have_words, 0,
    'the golden-fixture edge case (empty canonical, prose siblings) does not occur in production today');
  assert.equal(i.page_position_tie_groups, 0);
  assert.equal(i.chapter_position_tie_groups, 0);
  assert.equal(i.max_pages_per_project, 119, 'well under PostgREST max_rows = 1000');
  assert.equal(i.max_pages_per_chapter, 10);
  assert.equal(i.max_chapters_per_project, 32);
  assert.equal(i.pages_null_content, 46);
  assert.equal(i.pages_zero_words, 53);
});

test('stored manuscript totals disagree with the canonical-aware rule for 21 of 69 Projects', () => {
  assert.deepEqual(snap.integrity.projects_stored_word_count_mismatch, { projects: 69, mismatched_projects: 21 });
});

test('writing history is keyed per Page and cascades on Page delete', () => {
  assert.deepEqual(snap.integrity.writing_sessions_page_id_usage,
    { rows_with_page_id: 268, rows_without_page_id: 22, rows_whose_page_no_longer_exists: 0 });
  assert.deepEqual(col('writing_sessions', 'page_id'), {
    ord: 7, type: 'uuid', table: 'writing_sessions', column: 'page_id',
    default: null, not_null: false, identity: null, generated: null,
  });
  const fk = con('writing_sessions_page_id_fkey');
  assert.equal(fk.on_delete, 'cascade',
    'deleting (or re-creating) a pages row erases its writing history — Page IDs must be preserved');
  assert.equal(snap.integrity.writing_sessions_multi_rows_per_user_project_day, 52,
    'migration 002 unique(user_id, project_id, session_date) is not in force');
  const wsIdx = snap.indexes.filter((i) => i.table === 'writing_sessions' && i.unique && !i.primary).map((i) => i.name).sort();
  assert.deepEqual(wsIdx, [
    'unique_user_page_date_idx', 'unique_user_project_date_null_page_idx',
    'writing_sessions_null_project_unique', 'writing_sessions_page_unique', 'writing_sessions_project_unique',
  ]);
});

test('production-only columns the app relies on', () => {
  assert.equal(col('projects', 'is_pinned').not_null, true);
  assert.equal(col('projects', 'is_pinned').default, 'false');
  assert.equal(col('projects', 'chapter_goal').type, 'integer');
  assert.equal(col('game_sessions', 'meta').default, "'{}'::jsonb");
});

test('save-path RPCs: one overload each, INVOKER, pinned search_path — and anon holds EXECUTE', () => {
  for (const name of ['save_page_checked', 'insert_page_checked', 'account_word_total',
    'duplicate_project_checked', 'free_word_limit_for_caller', 'lock_account_word_budget']) {
    const f = fn(name);
    assert.equal(f.length, 1, `${name}: exactly one overload`);
    assert.equal(f[0].security_definer, false);
    assert.deepEqual(f[0].config, ['search_path=""']);
    assert.match(f[0].acl, /anon=X/, `${name}: anon EXECUTE (Supabase default privileges survive migration 011's revoke from public)`);
    assert.doesNotMatch(f[0].acl, /(^\{|,)=X/, `${name}: no PUBLIC EXECUTE`);
  }
  assert.deepEqual(snap.overloads, []);
});

test('RPC the app calls that production never had', () => {
  assert.equal(fn('increment_writing_session').length, 0,
    'recordWordsWritten(…, pageId=null) always falls back to the manual upsert');
});

test('security findings recorded for a separate, approved hardening change', () => {
  const t = fn('increment_game_ticket')[0];
  assert.equal(t.security_definer, true);
  assert.equal(t.config, null, 'no pinned search_path');
  assert.match(t.acl, /(^\{|,)=X/, 'executable by PUBLIC (incl. anon) via PostgREST');
});

test('subscription_events shape differs from what the Stripe webhook inserts', () => {
  assert.equal(col('subscription_events', 'payload'), undefined);
  assert.equal(col('subscription_events', 'stripe_event_id').not_null, true);
  assert.equal(snap.row_counts.subscription_events, 0);
});
