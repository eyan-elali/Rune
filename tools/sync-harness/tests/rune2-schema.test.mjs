// Rune 2.0 schema truth.
//
// 1. src/lib/supabase/schema.sql is exactly what build-schema.mjs generates
//    from the Rune 1.x baseline + migrations 013 onward (no hand edits), and a
//    database built from schema.sql alone is structurally identical to one
//    built from baseline + migrations, with the same migration ledger.
// 2. Migration 015 (Rune 2.0 manuscript foundation) produces exactly the
//    intended catalog change, refuses to run twice or out of order, and
//    refuses — changing nothing — on any database holding manuscript data.
//
// Behavior of the resulting schema (RLS, RPCs, triggers) is covered by
// sql-rune2-manuscript.test.mjs; legacy data compatibility by section 5 of
// migration-invariants.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, readMigration, createAuthUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { buildRune2Schema, captureCatalog, migratedDb } from '../build-schema.mjs';
import { diffCatalogs, diffCounts, describeDifference } from '../../db-audit/catalog-lib.mjs';
import { seedFixture } from '../fixtures/manuscript-fixture.mjs';

const M015 = '015_rune2_manuscript_foundation.sql';
const fmt = (diffs) => diffs.map(describeDifference).join('\n');

async function preFoundationDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  await db.exec(readMigration('013_schema_migrations_ledger.sql'));
  await db.exec(readMigration('014_assert_production_baseline.sql'));
  return db;
}

async function freshRune2Db() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  return db;
}

// ── 1. schema.sql ─────────────────────────────────────────────────────────────

test('schema.sql is exactly what build-schema.mjs generates from the baseline + migrations (no hand edits)', async () => {
  const { sql } = await buildRune2Schema();
  assert.equal(readRepoFile(RUNE2_SCHEMA), sql, 'regenerate: npm --prefix tools/sync-harness run schema');
});

test('a database built from schema.sql alone is identical to baseline + migrations: structure, ledger and row counts', async () => {
  const migrated = await migratedDb();
  const fresh = await freshRune2Db();
  const a = await captureCatalog(migrated);
  const b = await captureCatalog(fresh);
  const { differences, skippedSections } = diffCatalogs(a, b);
  assert.equal(differences.length, 0, fmt(differences));
  assert.deepEqual(skippedSections, []);
  assert.deepEqual(diffCounts(a, b), []);
  const versions = async (db) => (await db.query(`select version, name, note from public.schema_migrations order by version`)).rows;
  assert.deepEqual(await versions(fresh), await versions(migrated));
  assert.deepEqual((await versions(fresh)).map((r) => r.version).slice(-3), ['013', '014', '015']);
});

test('signup still creates the profile and pricing entitlements on the Rune 2.0 schema', async () => {
  const db = await freshRune2Db();
  const id = await createAuthUser(db, 'aaaaaaaa-0000-4000-8000-000000000009');
  const r = await db.query(`select p.subscription_tier, e.pricing_cohort from public.profiles p
    join public.user_pricing_entitlements e on e.user_id = p.id where p.id = $1`, [id]);
  assert.deepEqual(r.rows, [{ subscription_tier: 'free', pricing_cohort: 'starter_2k' }]);
});

// ── 2. migration 015 ──────────────────────────────────────────────────────────

test('015 on the baseline produces exactly the intended catalog change', async () => {
  const db = await preFoundationDb();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M015));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const pick = (section, kind) => differences.filter((d) => d.section === section && d.kind === kind)
    .map((d) => d.key + (d.fields ? ` [${d.fields.join(',')}]` : '')).sort();

  assert.deepEqual(pick('relations', 'added'), ['manuscripts', 'scenes']);
  assert.deepEqual(pick('relations', 'removed'), ['pages']);
  assert.deepEqual(pick('relations', 'changed'), []);

  assert.deepEqual(pick('functions', 'removed'), [
    'account_word_total(p_candidate_page_id uuid, p_candidate_word_count integer)',
    'enforce_single_canonical_page()',
    'increment_page_version()',
    'insert_page_checked(p_chapter_id uuid, p_title text, p_content jsonb, p_word_count integer, p_position integer)',
    'save_page_checked(p_page_id uuid, p_content jsonb, p_word_count integer, p_expected_version integer)',
  ]);
  assert.deepEqual(pick('functions', 'added'), [
    'account_word_total(p_candidate_scene_id uuid, p_candidate_word_count integer)',
    'create_project_manuscript()',
    'fill_scene_manuscript_id()',
    'forbid_manuscript_reassignment()',
    'increment_scene_version()',
    'insert_scene_checked(p_chapter_id uuid, p_title text, p_content jsonb, p_word_count integer, p_position integer)',
    'save_scene_checked(p_scene_id uuid, p_content jsonb, p_word_count integer, p_expected_version integer)',
  ]);
  assert.deepEqual(pick('functions', 'changed'), [
    'bump_project_updated_at() [body_md5,definition,body_length]',
    'duplicate_project_checked(p_project_id uuid) [body_md5,definition,body_length]',
  ]);

  assert.deepEqual(pick('triggers', 'removed'), ['pages.enforce_single_canonical', 'pages.page_version_trigger', 'pages.trg_page_updated']);
  assert.deepEqual(pick('triggers', 'added'), [
    'chapters.chapters_forbid_manuscript_reassignment', 'projects.trg_project_manuscript', 'scenes.scene_version_trigger',
    'scenes.scenes_fill_manuscript_id', 'scenes.scenes_forbid_manuscript_reassignment', 'scenes.trg_scene_updated',
  ]);

  assert.deepEqual(pick('policies', 'removed'), [
    'chapters.Users can manage chapters of their projects', 'pages.Users can manage pages in their chapters',
    'pages.pages: delete own', 'pages.pages: insert own', 'pages.pages: select own', 'pages.pages: update own',
  ]);
  assert.deepEqual(pick('policies', 'added'), [
    'manuscripts.manuscripts: select own', 'scenes.scenes: delete own', 'scenes.scenes: insert own',
    'scenes.scenes: select own', 'scenes.scenes: update own',
  ]);
  assert.deepEqual(pick('policies', 'changed'), [
    'chapters.chapters: delete own [roles,using]', 'chapters.chapters: insert own [roles,with_check]',
    'chapters.chapters: select own [roles,using]', 'chapters.chapters: update own [roles,using,with_check]',
  ]);

  assert.deepEqual(pick('constraints', 'removed'), [
    'chapters.chapters_project_id_fkey', 'pages.pages_chapter_id_fkey', 'pages.pages_pkey', 'writing_sessions.writing_sessions_page_id_fkey',
  ]);
  assert.deepEqual(pick('constraints', 'added'), [
    'chapters.chapters_id_manuscript_id_key', 'chapters.chapters_manuscript_id_fkey', 'manuscripts.manuscripts_pkey',
    'manuscripts.manuscripts_project_id_fkey', 'manuscripts.manuscripts_project_id_key', 'scenes.scenes_chapter_same_manuscript_fkey',
    'scenes.scenes_manuscript_id_fkey', 'scenes.scenes_pkey', 'writing_sessions.writing_sessions_scene_id_fkey',
  ]);
  assert.deepEqual(pick('indexes', 'removed'), [
    'pages.pages_pkey', 'writing_sessions.unique_user_page_date_idx',
    'writing_sessions.unique_user_project_date_null_page_idx', 'writing_sessions.writing_sessions_page_unique',
  ]);
  assert.deepEqual(pick('indexes', 'added'), [
    'chapters.chapters_id_manuscript_id_key', 'chapters.chapters_manuscript_id_position_idx', 'manuscripts.manuscripts_pkey',
    'manuscripts.manuscripts_project_id_key', 'scenes.scenes_chapter_id_position_idx', 'scenes.scenes_manuscript_id_idx',
    'scenes.scenes_pkey', 'writing_sessions.writing_sessions_scene_unique',
  ]);
  assert.deepEqual(pick('indexes', 'changed'), [
    'writing_sessions.writing_sessions_null_project_unique [definition]', 'writing_sessions.writing_sessions_project_unique [definition]',
  ]);

  // Columns: chapters.project_id → manuscript_id; writing_sessions.page_id → scene_id (plus ordinal shifts).
  assert.deepEqual(pick('columns', 'removed').filter((k) => !k.startsWith('pages.')), ['chapters.project_id', 'writing_sessions.page_id']);
  assert.deepEqual(pick('columns', 'added').filter((k) => !/^(manuscripts|scenes)\./.test(k)), ['chapters.manuscript_id', 'writing_sessions.scene_id']);

  // Other tables are untouched (projects only gains a trigger).
  const touched = new Set(differences.map((d) => d.key.split(/[.( ]/)[0]));
  const allowed = new Set(['manuscripts', 'scenes', 'pages', 'chapters', 'writing_sessions', 'projects',
    'account_word_total', 'create_project_manuscript', 'fill_scene_manuscript_id', 'forbid_manuscript_reassignment',
    'increment_scene_version', 'insert_scene_checked', 'save_scene_checked', 'enforce_single_canonical_page',
    'increment_page_version', 'insert_page_checked', 'save_page_checked', 'bump_project_updated_at', 'duplicate_project_checked']);
  assert.deepEqual([...touched].filter((t) => !allowed.has(t)), []);

  // RLS on every new/replaced table; Scene RPCs not executable by anon.
  for (const t of ['manuscripts', 'chapters', 'scenes', 'writing_sessions']) {
    assert.equal(after.relations.find((r) => r.table === t).rls_enabled, true, t);
  }
  const grantees = (fn) => after.function_grants.filter((g) => g.function.startsWith(`${fn}(`)).map((g) => g.grantee).sort();
  for (const fn of ['save_scene_checked', 'insert_scene_checked', 'account_word_total']) {
    assert.ok(!grantees(fn).includes('anon') && !grantees(fn).includes('PUBLIC'), `${fn}: ${grantees(fn)}`);
    assert.ok(grantees(fn).includes('authenticated'), fn);
  }
  assert.equal((await db.query(`select count(*)::int as n from public.schema_migrations where version = '015'`)).rows[0].n, 1);
});

test('015 refuses to run twice, including on a database built from schema.sql, and changes nothing', async () => {
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M015)), /Migration 015 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

test('015 requires 013 and 014', async () => {
  const bare = await createTestDb();
  await bare.exec(readRepoFile(LEGACY_BASELINE));
  await assert.rejects(bare.exec(readMigration(M015)), /requires migration 013/);
  await bare.exec(readMigration('013_schema_migrations_ledger.sql'));
  await assert.rejects(bare.exec(readMigration(M015)), /requires migration 014/);
});

test('015 refuses — changing nothing — on a database holding manuscript data (it is not the Rune 1.x data migration)', async () => {
  const seeded = await preFoundationDb();
  await seedFixture(seeded);
  const before = await captureCatalog(seeded);
  await assert.rejects(seeded.exec(readMigration(M015)), /only runs on an EMPTY Rune 2.0 database, but public\.projects has 5 row/);
  const after = await captureCatalog(seeded);
  assert.deepEqual(diffCatalogs(before, after).differences, []);
  assert.deepEqual(diffCounts(before, after), []);

  // A single writing-history row is enough to refuse.
  const history = await preFoundationDb();
  await createAuthUser(history, 'aaaaaaaa-0000-4000-8000-000000000001');
  await history.query(`insert into public.writing_sessions (user_id, words_added) values ('aaaaaaaa-0000-4000-8000-000000000001', 3)`);
  await assert.rejects(history.exec(readMigration(M015)), /public\.writing_sessions has 1 row/);
  assert.ok((await history.query(`select to_regclass('public.pages') as t`)).rows[0].t, 'pages still exists');
});
