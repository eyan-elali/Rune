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
  assert.deepEqual((await versions(fresh)).map((r) => r.version).slice(-24), ['013', '014', '015', '016', '017', '018', '019', '020', '021', '022', '023', '024', '025', '026', '027', '028', '029', '030', '031', '032', '033', '034', '035', '036']);
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

// ── 3. migration 016 ──────────────────────────────────────────────────────────

const M016 = '016_scene_structure_rpcs.sql';

test('016 on 015 adds exactly the two Scene-structure RPCs, not executable by anon', async () => {
  const db = await preFoundationDb();
  await db.exec(readMigration(M015));
  const before = await captureCatalog(db);
  await db.exec(readMigration(M016));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  const functions = keys.filter((k) => k.startsWith('functions:'));
  assert.deepEqual(functions, [
    'functions:added:insert_unplaced_scene_checked(p_manuscript_id uuid, p_title text, p_content jsonb, p_word_count integer)',
    'functions:added:reorder_chapter_scenes(p_chapter_id uuid, p_scene_ids uuid[])',
  ]);
  assert.deepEqual(keys.filter((k) => !k.startsWith('functions:') && !k.startsWith('function_grants:')), [], fmt(differences));

  const grantees = (fn) => after.function_grants.filter((g) => g.function.startsWith(`${fn}(`)).map((g) => g.grantee).sort();
  for (const fn of ['insert_unplaced_scene_checked', 'reorder_chapter_scenes']) {
    assert.ok(!grantees(fn).includes('anon') && !grantees(fn).includes('PUBLIC'), `${fn}: ${grantees(fn)}`);
    assert.ok(grantees(fn).includes('authenticated'), fn);
  }
});

test('016 requires 015, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  await assert.rejects((await preFoundationDb()).exec(readMigration(M016)), /requires migration 015/);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M016)), /Migration 016 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 4. migration 017 ──────────────────────────────────────────────────────────

const M017 = '017_atomic_scene_move.sql';

test('017 on 016 adds exactly move_scene, not executable by anon', async () => {
  const db = await preFoundationDb();
  await db.exec(readMigration(M015));
  await db.exec(readMigration(M016));
  const before = await captureCatalog(db);
  await db.exec(readMigration(M017));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  assert.deepEqual(keys.filter((k) => k.startsWith('functions:')), [
    'functions:added:move_scene(p_scene_id uuid, p_chapter_id uuid)',
  ]);
  assert.deepEqual(keys.filter((k) => !k.startsWith('functions:') && !k.startsWith('function_grants:')), [], fmt(differences));

  const grantees = after.function_grants.filter((g) => g.function.startsWith('move_scene(')).map((g) => g.grantee).sort();
  assert.ok(!grantees.includes('anon') && !grantees.includes('PUBLIC'), `${grantees}`);
  assert.ok(grantees.includes('authenticated'));
});

test('017 requires 016, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only015 = await preFoundationDb();
  await only015.exec(readMigration(M015));
  await assert.rejects(only015.exec(readMigration(M017)), /requires migration 016/);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M017)), /Migration 017 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 5. migration 018 ──────────────────────────────────────────────────────────

const M018 = '018_atomic_scene_creation.sql';

test('018 on 017 changes only insert_scene_checked\'s body: same signature, grants unchanged', async () => {
  const db = await preFoundationDb();
  for (const m of [M015, M016, M017]) await db.exec(readMigration(m));
  const before = await captureCatalog(db);
  await db.exec(readMigration(M018));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  assert.deepEqual(keys, [
    'functions:changed:insert_scene_checked(p_chapter_id uuid, p_title text, p_content jsonb, p_word_count integer, p_position integer)',
  ], fmt(differences));
});

test('018 requires 017, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only016 = await preFoundationDb();
  await only016.exec(readMigration(M015));
  await only016.exec(readMigration(M016));
  await assert.rejects(only016.exec(readMigration(M018)), /requires migration 017/);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M018)), /Migration 018 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 6. migration 019 ──────────────────────────────────────────────────────────

const M019 = '019_creation_path_hardening.sql';
const CREATE_CHAPTER = 'create_chapter_checked(p_manuscript_id uuid, p_title text, p_scene_title text, p_scene_content jsonb, p_scene_word_count integer)';

async function db018() {
  const db = await preFoundationDb();
  for (const m of [M015, M016, M017, M018]) await db.exec(readMigration(m));
  return db;
}

test('019 on 018: create_chapter_checked, SECURITY DEFINER creation RPCs, no client Scene INSERT, unique deferrable (chapter_id, position) — nothing else', async () => {
  const db = await db018();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M019));
  const { differences } = diffCatalogs(before, await captureCatalog(db));
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  assert.deepEqual(keys, [
    'constraints:added:scenes.scenes_chapter_id_position_key',
    `function_grants:added:${CREATE_CHAPTER} authenticated EXECUTE`,
    `function_grants:added:${CREATE_CHAPTER} postgres EXECUTE`,
    `function_grants:added:${CREATE_CHAPTER} service_role EXECUTE`,
    'function_grants:removed:duplicate_project_checked(p_project_id uuid) anon EXECUTE',
    `functions:added:${CREATE_CHAPTER}`,
    'functions:changed:duplicate_project_checked(p_project_id uuid)',
    'functions:changed:insert_scene_checked(p_chapter_id uuid, p_title text, p_content jsonb, p_word_count integer, p_position integer)',
    'functions:changed:insert_unplaced_scene_checked(p_manuscript_id uuid, p_title text, p_content jsonb, p_word_count integer)',
    'indexes:added:scenes.scenes_chapter_id_position_key',
    'indexes:removed:scenes.scenes_chapter_id_position_idx',
    'policies:removed:scenes.scenes: insert own',
    'table_grants:removed:scenes anon INSERT',
    'table_grants:removed:scenes authenticated INSERT',
  ], fmt(differences));
});

test('019 requires 018, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only017 = await preFoundationDb();
  for (const m of [M015, M016, M017]) await only017.exec(readMigration(m));
  await assert.rejects(only017.exec(readMigration(M019)), /requires migration 018/);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M019)), /Migration 019 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

test('019 refuses — changing nothing — over placed Scenes that already share a Chapter position', async () => {
  const db = await db018();
  const user = await createAuthUser(db, '00000000-0000-4000-8000-0000000019a1');
  const { id: projectId } = (await db.query(`insert into public.projects (user_id, title) values ($1, 'Tied') returning id`, [user])).rows[0];
  const { id: m } = (await db.query(`select id from public.manuscripts where project_id = $1`, [projectId])).rows[0];
  const { id: ch } = (await db.query(`insert into public.chapters (manuscript_id, title, position) values ($1, 'One', 1) returning id`, [m])).rows[0];
  await db.query(`insert into public.scenes (manuscript_id, chapter_id, title, position) values ($1, $2, 'a', 0), ($1, $2, 'b', 0)`, [m, ch]);
  const before = await captureCatalog(db);
  await assert.rejects(db.exec(readMigration(M019)), /1 Chapter position\(s\) are shared by more than one Scene/);
  assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
});

// ── 7. migration 021 ──────────────────────────────────────────────────────────

const M021 = '021_project_lifecycle_hardening.sql';
const CREATE_PROJECT = 'create_project_checked(p_title text, p_description text, p_cover_color text, p_first_scene_content jsonb, p_first_scene_word_count integer, p_request_id uuid)';

async function db020() {
  const db = await db018();
  for (const m of [M019, '020_manuscript_totals.sql']) await db.exec(readMigration(m));
  return db;
}

test('021 on 020: create_project_checked, delete_chapter, no client Project INSERT or word_count write, non-cascading Scene→Chapter FK — nothing else', async () => {
  const db = await db020();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M021));
  const { differences } = diffCatalogs(before, await captureCatalog(db));
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  assert.deepEqual(keys, [
    'columns:added:projects.creation_request_id',
    'constraints:changed:scenes.scenes_chapter_same_manuscript_fkey',
    `function_grants:added:${CREATE_PROJECT} authenticated EXECUTE`,
    `function_grants:added:${CREATE_PROJECT} postgres EXECUTE`,
    `function_grants:added:${CREATE_PROJECT} service_role EXECUTE`,
    'function_grants:added:delete_chapter(p_chapter_id uuid) authenticated EXECUTE',
    'function_grants:added:delete_chapter(p_chapter_id uuid) postgres EXECUTE',
    'function_grants:added:delete_chapter(p_chapter_id uuid) service_role EXECUTE',
    'function_grants:added:protect_project_word_count() authenticated EXECUTE',
    'function_grants:added:protect_project_word_count() postgres EXECUTE',
    'function_grants:added:protect_project_word_count() service_role EXECUTE',
    `functions:added:${CREATE_PROJECT}`,
    'functions:added:delete_chapter(p_chapter_id uuid)',
    'functions:added:protect_project_word_count()',
    'indexes:added:projects.projects_user_id_creation_request_id_key',
    'policies:removed:projects.projects: insert own',
    'table_grants:removed:projects anon INSERT',
    'table_grants:removed:projects authenticated INSERT',
    'triggers:added:projects.projects_protect_word_count',
  ], fmt(differences));
  const fk = (await db.query(`select confdeltype from pg_constraint where conname = 'scenes_chapter_same_manuscript_fkey'`)).rows[0];
  assert.equal(fk.confdeltype, 'a', 'ON DELETE NO ACTION (was CASCADE)');
});

test('021 requires 020, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only019 = await db018();
  await only019.exec(readMigration(M019));
  await assert.rejects(only019.exec(readMigration(M021)), /requires migration 020/);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M021)), /Migration 021 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

test('021 over existing manuscripts changes no row: every Project, Chapter and Scene is kept as it was', async () => {
  const db = await db020();
  const user = await createAuthUser(db, '00000000-0000-4000-8000-0000000021a1');
  const { id: projectId } = (await db.query(`insert into public.projects (user_id, title) values ($1, 'Kept') returning id`, [user])).rows[0];
  const { id: m } = (await db.query(`select id from public.manuscripts where project_id = $1`, [projectId])).rows[0];
  const { id: ch } = (await db.query(`insert into public.chapters (manuscript_id, title, position) values ($1, 'One', 1) returning id`, [m])).rows[0];
  await db.query(`insert into public.scenes (manuscript_id, chapter_id, title, word_count, position) values ($1, $2, 'a', 7, 0), ($1, null, 'b', 3, 0)`, [m, ch]);
  const rows = async () => ({
    projects: (await db.query(`select * from public.projects order by id`)).rows,
    chapters: (await db.query(`select * from public.chapters order by id`)).rows,
    scenes: (await db.query(`select * from public.scenes order by id`)).rows,
  });
  const before = await rows();
  await db.exec(readMigration(M021));
  const after = await rows();
  assert.deepEqual(after.projects.map(({ creation_request_id, ...p }) => { assert.equal(creation_request_id, null); return p; }), before.projects);
  assert.deepEqual(after.chapters, before.chapters);
  assert.deepEqual(after.scenes, before.scenes);
});

// ── 8. migration 022 ──────────────────────────────────────────────────────────

const M022 = '022_manuscript_groups.sql';

async function db021() {
  const db = await db020();
  await db.exec(readMigration(M021));
  return db;
}

test('022 on 021: Manuscript Groups, the sibling ordering model, unique Unplaced order, Scene deletion keeps history — nothing else', async () => {
  const db = await db021();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M022));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  assert.deepEqual(keys, [
    'columns:added:chapters.group_id',
    'columns:added:manuscript_groups.created_at',
    'columns:added:manuscript_groups.id',
    'columns:added:manuscript_groups.manuscript_id',
    'columns:added:manuscript_groups.parent_group_id',
    'columns:added:manuscript_groups.position',
    'columns:added:manuscript_groups.title',
    'columns:added:manuscript_groups.updated_at',
    'constraints:added:chapters.chapters_group_same_manuscript_fkey',
    'constraints:added:chapters.chapters_sibling_position_key',
    'constraints:added:manuscript_groups.manuscript_groups_id_manuscript_id_key',
    'constraints:added:manuscript_groups.manuscript_groups_manuscript_id_fkey',
    'constraints:added:manuscript_groups.manuscript_groups_not_own_parent',
    'constraints:added:manuscript_groups.manuscript_groups_parent_same_manuscript_fkey',
    'constraints:added:manuscript_groups.manuscript_groups_pkey',
    'constraints:added:manuscript_groups.manuscript_groups_sibling_position_key',
    'constraints:added:manuscript_groups.manuscript_groups_title_not_blank',
    'constraints:added:scenes.scenes_unplaced_position_excl',
    'constraints:changed:writing_sessions.writing_sessions_scene_id_fkey',
    'constraints:removed:chapters.chapters_manuscript_id_position_key',
    'function_grants:added:check_structure_sibling_position() authenticated EXECUTE',
    'function_grants:added:check_structure_sibling_position() postgres EXECUTE',
    'function_grants:added:check_structure_sibling_position() service_role EXECUTE',
    'function_grants:added:create_manuscript_group(p_manuscript_id uuid, p_parent_group_id uuid, p_title text) authenticated EXECUTE',
    'function_grants:added:create_manuscript_group(p_manuscript_id uuid, p_parent_group_id uuid, p_title text) postgres EXECUTE',
    'function_grants:added:create_manuscript_group(p_manuscript_id uuid, p_parent_group_id uuid, p_title text) service_role EXECUTE',
    'function_grants:added:delete_manuscript_group(p_group_id uuid) authenticated EXECUTE',
    'function_grants:added:delete_manuscript_group(p_group_id uuid) postgres EXECUTE',
    'function_grants:added:delete_manuscript_group(p_group_id uuid) service_role EXECUTE',
    'function_grants:added:detach_scene_writing_sessions() authenticated EXECUTE',
    'function_grants:added:detach_scene_writing_sessions() postgres EXECUTE',
    'function_grants:added:detach_scene_writing_sessions() service_role EXECUTE',
    'function_grants:added:forbid_manuscript_group_cycle() authenticated EXECUTE',
    'function_grants:added:forbid_manuscript_group_cycle() postgres EXECUTE',
    'function_grants:added:forbid_manuscript_group_cycle() service_role EXECUTE',
    'function_grants:added:move_chapter(p_chapter_id uuid, p_parent_group_id uuid, p_index integer) authenticated EXECUTE',
    'function_grants:added:move_chapter(p_chapter_id uuid, p_parent_group_id uuid, p_index integer) postgres EXECUTE',
    'function_grants:added:move_chapter(p_chapter_id uuid, p_parent_group_id uuid, p_index integer) service_role EXECUTE',
    'function_grants:added:move_manuscript_group(p_group_id uuid, p_parent_group_id uuid, p_index integer) authenticated EXECUTE',
    'function_grants:added:move_manuscript_group(p_group_id uuid, p_parent_group_id uuid, p_index integer) postgres EXECUTE',
    'function_grants:added:move_manuscript_group(p_group_id uuid, p_parent_group_id uuid, p_index integer) service_role EXECUTE',
    'function_grants:added:next_structure_position(p_manuscript_id uuid, p_parent_group_id uuid) postgres EXECUTE',
    'function_grants:added:next_structure_position(p_manuscript_id uuid, p_parent_group_id uuid) service_role EXECUTE',
    'function_grants:added:place_in_manuscript_structure(p_manuscript_id uuid, p_parent_group_id uuid, p_kind text, p_id uuid, p_index integer) postgres EXECUTE',
    'function_grants:added:place_in_manuscript_structure(p_manuscript_id uuid, p_parent_group_id uuid, p_kind text, p_id uuid, p_index integer) service_role EXECUTE',
    'function_grants:added:protect_structure_placement() authenticated EXECUTE',
    'function_grants:added:protect_structure_placement() postgres EXECUTE',
    'function_grants:added:protect_structure_placement() service_role EXECUTE',
    'functions:added:check_structure_sibling_position()',
    'functions:added:create_manuscript_group(p_manuscript_id uuid, p_parent_group_id uuid, p_title text)',
    'functions:added:delete_manuscript_group(p_group_id uuid)',
    'functions:added:detach_scene_writing_sessions()',
    'functions:added:forbid_manuscript_group_cycle()',
    'functions:added:move_chapter(p_chapter_id uuid, p_parent_group_id uuid, p_index integer)',
    'functions:added:move_manuscript_group(p_group_id uuid, p_parent_group_id uuid, p_index integer)',
    'functions:added:next_structure_position(p_manuscript_id uuid, p_parent_group_id uuid)',
    'functions:added:place_in_manuscript_structure(p_manuscript_id uuid, p_parent_group_id uuid, p_kind text, p_id uuid, p_index integer)',
    'functions:added:protect_structure_placement()',
    'functions:changed:create_chapter_checked(p_manuscript_id uuid, p_title text, p_scene_title text, p_scene_content jsonb, p_scene_word_count integer)',
    'functions:changed:duplicate_project_checked(p_project_id uuid)',
    'indexes:added:chapters.chapters_sibling_position_key',
    'indexes:added:manuscript_groups.manuscript_groups_id_manuscript_id_key',
    'indexes:added:manuscript_groups.manuscript_groups_pkey',
    'indexes:added:manuscript_groups.manuscript_groups_sibling_position_key',
    'indexes:added:scenes.scenes_unplaced_position_excl',
    'indexes:removed:chapters.chapters_manuscript_id_position_key',
    'policies:added:manuscript_groups.manuscript_groups: select own',
    'policies:added:manuscript_groups.manuscript_groups: update own',
    'relations:added:manuscript_groups',
    'table_grants:added:manuscript_groups anon REFERENCES',
    'table_grants:added:manuscript_groups anon SELECT',
    'table_grants:added:manuscript_groups anon TRIGGER',
    'table_grants:added:manuscript_groups anon TRUNCATE',
    'table_grants:added:manuscript_groups anon UPDATE',
    'table_grants:added:manuscript_groups authenticated REFERENCES',
    'table_grants:added:manuscript_groups authenticated SELECT',
    'table_grants:added:manuscript_groups authenticated TRIGGER',
    'table_grants:added:manuscript_groups authenticated TRUNCATE',
    'table_grants:added:manuscript_groups authenticated UPDATE',
    'table_grants:added:manuscript_groups service_role DELETE',
    'table_grants:added:manuscript_groups service_role INSERT',
    'table_grants:added:manuscript_groups service_role REFERENCES',
    'table_grants:added:manuscript_groups service_role SELECT',
    'table_grants:added:manuscript_groups service_role TRIGGER',
    'table_grants:added:manuscript_groups service_role TRUNCATE',
    'table_grants:added:manuscript_groups service_role UPDATE',
    'triggers:added:chapters.chapters_check_sibling_position',
    'triggers:added:chapters.chapters_protect_placement',
    'triggers:added:manuscript_groups.manuscript_groups_check_sibling_position',
    'triggers:added:manuscript_groups.manuscript_groups_forbid_cycle',
    'triggers:added:manuscript_groups.manuscript_groups_forbid_manuscript_reassignment',
    'triggers:added:manuscript_groups.manuscript_groups_protect_placement',
    'triggers:added:scenes.scenes_detach_writing_sessions',
  ], fmt(differences));
  const fk = (await db.query(`select confdeltype from pg_constraint where conname = 'writing_sessions_scene_id_fkey'`)).rows[0];
  assert.equal(fk.confdeltype, 'n', 'ON DELETE SET NULL (was CASCADE)');
  assert.equal(after.relations.find((r) => r.table === 'manuscript_groups').rls_enabled, true);
  const grantees = (fn) => after.function_grants.filter((g) => g.function.startsWith(`${fn}(`)).map((g) => g.grantee).sort();
  for (const fn of ['next_structure_position', 'place_in_manuscript_structure']) {
    assert.deepEqual(grantees(fn), ['postgres', 'service_role'], `${fn} is internal`);
  }
});

test('022 requires 021, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only020 = await db020();
  await assert.rejects(only020.exec(readMigration(M022)), /requires migration 021/);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M022)), /Migration 022 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

test('022 over existing manuscripts: every Chapter stays top level where it was; tied Unplaced positions are fixed by moving only the extra Scenes, without a version change', async () => {
  const db = await db021();
  const user = await createAuthUser(db, '00000000-0000-4000-8000-0000000022a1');
  const { id: projectId } = (await db.query(`insert into public.projects (user_id, title) values ($1, 'Kept') returning id`, [user])).rows[0];
  const { id: m } = (await db.query(`select id from public.manuscripts where project_id = $1`, [projectId])).rows[0];
  const ch = [];
  for (const pos of [1, 2]) ch.push((await db.query(`insert into public.chapters (manuscript_id, title, position) values ($1, 'C', $2) returning id`, [m, pos])).rows[0].id);
  await db.query(`insert into public.scenes (manuscript_id, chapter_id, title, word_count, position) values ($1, $2, 'placed', 7, 0)`, [m, ch[0]]);
  // Unplaced: a, b tie at 0 (a older); c at 1; d, e tie at 1 too (d older than e); f at 3.
  const at = (t) => `2026-01-01 00:00:0${t}+00`;
  const add = async (title, position, t) => (await db.query(`insert into public.scenes (manuscript_id, chapter_id, title, word_count, position, created_at)
    values ($1, null, $2, 1, $3, $4) returning id`, [m, title, position, at(t)])).rows[0].id;
  const ids = { a: await add('a', 0, 1), b: await add('b', 0, 2), c: await add('c', 1, 1), d: await add('d', 1, 2), e: await add('e', 1, 3), f: await add('f', 3, 1) };
  // Give them versions above 1, as real Scenes have.
  await db.query(`update public.scenes set word_count = word_count + 1 where manuscript_id = $1`, [m]);
  const rows = async () => (await db.query(`select id, title, position, version, updated_at, chapter_id from public.scenes where manuscript_id = $1 order by title`, [m])).rows;
  const projectBefore = (await db.query(`select updated_at from public.projects where id = $1`, [projectId])).rows[0];
  const chaptersBefore = (await db.query(`select * from public.chapters order by id`)).rows;
  const before = await rows();

  await db.exec(readMigration(M022));

  const after = await rows();
  const pos = Object.fromEntries(after.map((r) => [r.title, r.position]));
  assert.deepEqual(pos, { a: 0, c: 1, f: 3, b: 4, d: 5, e: 6, placed: 0 }, 'each tie keeps its oldest Scene; the others go last, in (position, created_at) order');
  const moved = after.filter((r, i) => r.position !== before[i].position).map((r) => r.title).sort();
  assert.deepEqual(moved, ['b', 'd', 'e'], 'only the extra Scenes were written');
  assert.deepEqual(after.map(({ position, ...r }) => r), before.map(({ position, ...r }) => r), 'same ids, versions and updated_at');
  assert.deepEqual((await db.query(`select updated_at from public.projects where id = $1`, [projectId])).rows[0], projectBefore);
  assert.deepEqual((await db.query(`select * from public.chapters order by id`)).rows, chaptersBefore.map((c) => ({ ...c, group_id: null })),
    'Chapters: same rows, top level, same positions');
  // Triggers are back on.
  await db.query(`update public.scenes set title = 'a2' where id = $1`, [ids.a]);
  const a2 = (await db.query(`select version from public.scenes where id = $1`, [ids.a])).rows[0];
  assert.equal(a2.version, before.find((r) => r.title === 'a').version + 1);
});

// ── 9. migration 023 ──────────────────────────────────────────────────────────

const M023 = '023_workspace_pages.sql';

async function db022() {
  const db = await db021();
  await db.exec(readMigration(M022));
  return db;
}

test('023 on 022: Workspace Pages (workspace_documents) and nothing else — no manuscript table, function or policy changes', async () => {
  const db = await db022();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M023));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  assert.deepEqual(keys.filter((k) => !k.startsWith('table_grants:') && !k.startsWith('function_grants:')), [
    'columns:added:workspace_documents.content',
    'columns:added:workspace_documents.created_at',
    'columns:added:workspace_documents.id',
    'columns:added:workspace_documents.project_id',
    'columns:added:workspace_documents.title',
    'columns:added:workspace_documents.updated_at',
    'columns:added:workspace_documents.version',
    'constraints:added:workspace_documents.workspace_documents_content_is_object',
    'constraints:added:workspace_documents.workspace_documents_pkey',
    'constraints:added:workspace_documents.workspace_documents_project_id_fkey',
    'constraints:added:workspace_documents.workspace_documents_title_check',
    'functions:added:forbid_project_reassignment()',
    'functions:added:stamp_workspace_document()',
    'indexes:added:workspace_documents.workspace_documents_pkey',
    'indexes:added:workspace_documents.workspace_documents_project_id_created_at_idx',
    'policies:added:workspace_documents.workspace_documents: insert own',
    'policies:added:workspace_documents.workspace_documents: select own',
    'policies:added:workspace_documents.workspace_documents: update own',
    'relations:added:workspace_documents',
    'triggers:added:workspace_documents.workspace_documents_forbid_project_reassignment',
    'triggers:added:workspace_documents.workspace_documents_stamp',
  ], fmt(differences));
  // Grants: only on the new table and its two trigger functions; no client DELETE.
  const grants = keys.filter((k) => k.startsWith('table_grants:') || k.startsWith('function_grants:'));
  assert.ok(grants.every((k) => /^table_grants:added:workspace_documents |^function_grants:added:(forbid_project_reassignment|stamp_workspace_document)\(\) /.test(k)), grants.join('\n'));
  for (const role of ['anon', 'authenticated']) {
    assert.ok(!grants.includes(`table_grants:added:workspace_documents ${role} DELETE`), `${role} cannot DELETE`);
  }
  assert.ok(grants.includes('table_grants:added:workspace_documents authenticated INSERT'));
  assert.ok(grants.includes('table_grants:added:workspace_documents authenticated UPDATE'));
  assert.equal(after.relations.find((r) => r.table === 'workspace_documents').rls_enabled, true);
  // Never named like the manuscript's tables.
  assert.equal(after.relations.some((r) => r.table === 'pages'), false);
});

test('023 requires 022, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only021 = await db021();
  const before021 = await captureCatalog(only021);
  await assert.rejects(only021.exec(readMigration(M023)), /requires migration 022/);
  assert.deepEqual(diffCatalogs(before021, await captureCatalog(only021)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M023)), /Migration 023 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 10. migration 024 ─────────────────────────────────────────────────────────

const M024 = '024_workspace_tree.sql';

async function db023() {
  const db = await db022();
  await db.exec(readMigration(M023));
  return db;
}

test('024 on 023: the Workspace tree (workspace_folders, workspace_nodes) and nothing else — no manuscript table, function or policy changes', async () => {
  const db = await db023();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M024));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  const structural = keys.filter((k) => !k.startsWith('table_grants:') && !k.startsWith('function_grants:'));
  // Only the two new tables, their functions, and one unique key on workspace_documents.
  for (const k of structural) {
    assert.ok(
      /^(columns|constraints|indexes|policies|triggers):added:workspace_(folders|nodes)\./.test(k)
        || /^relations:added:workspace_(folders|nodes)$/.test(k)
        || /^functions:added:(stamp_workspace_folder|freeze_workspace_node_target|check_workspace_node_parent|lock_project_workspace|renumber_workspace_siblings|place_workspace_node|place_new_workspace_object|create_workspace_document|create_workspace_folder|move_workspace_node|delete_workspace_folder)\(/.test(k)
        || k === 'constraints:added:workspace_documents.workspace_documents_id_project_id_key'
        || k === 'indexes:added:workspace_documents.workspace_documents_id_project_id_key'
        || k === 'triggers:added:workspace_documents.workspace_documents_place_new',
      `unexpected change: ${k}`);
  }
  for (const k of [
    'relations:added:workspace_folders',
    'relations:added:workspace_nodes',
    'constraints:added:workspace_nodes.workspace_nodes_document_id_key',
    'constraints:added:workspace_nodes.workspace_nodes_folder_id_key',
    'constraints:added:workspace_nodes.workspace_nodes_sibling_position_key',
    'constraints:added:workspace_nodes.workspace_nodes_parent_same_project_fkey',
    'constraints:added:workspace_nodes.workspace_nodes_document_same_project_fkey',
    'constraints:added:workspace_nodes.workspace_nodes_folder_same_project_fkey',
    'constraints:added:workspace_nodes.workspace_nodes_target_matches_type',
    'triggers:added:workspace_nodes.workspace_nodes_check_parent',
    'triggers:added:workspace_folders.workspace_folders_place_new',
    'policies:added:workspace_nodes.workspace_nodes: select own',
    'policies:added:workspace_folders.workspace_folders: select own',
    'policies:added:workspace_folders.workspace_folders: update own',
  ]) assert.ok(structural.includes(k), `missing ${k}`);
  // No insert/update/delete policy on nodes; no insert/delete policy on folders.
  assert.ok(!structural.some((k) => /workspace_nodes: (insert|update|delete)|workspace_folders: (insert|delete)/.test(k)));

  const grants = keys.filter((k) => k.startsWith('table_grants:') || k.startsWith('function_grants:'));
  for (const role of ['anon', 'authenticated']) {
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      assert.ok(!grants.includes(`table_grants:added:workspace_nodes ${role} ${priv}`), `${role} cannot ${priv} nodes`);
    }
    for (const priv of ['INSERT', 'DELETE']) {
      assert.ok(!grants.includes(`table_grants:added:workspace_folders ${role} ${priv}`), `${role} cannot ${priv} folders`);
    }
  }
  assert.ok(grants.includes('table_grants:added:workspace_folders authenticated UPDATE'));
  for (const t of ['workspace_folders', 'workspace_nodes']) {
    assert.equal(after.relations.find((r) => r.table === t).rls_enabled, true, `${t} has RLS`);
  }
});

test('024 backfill: every existing Page gets one top-level node, 1..n per Project in creation order; no Page changes', async () => {
  const db = await db023();
  const alice = await createAuthUser(db, crypto.randomUUID());
  const bram = await createAuthUser(db, crypto.randomUUID());
  const project = async (userId, title) =>
    (await db.query(`insert into public.projects (user_id, title) values ($1, $2) returning id`, [userId, title])).rows[0].id;
  const hollow = await project(alice, 'Hollow');
  const tide = await project(bram, 'Tide');
  // Created out of id order, with explicit creation times (the stamp trigger
  // sets created_at, so it's adjusted afterwards).
  const page = async (projectId, title, at) => {
    const id = (await db.query(`insert into public.workspace_documents (project_id, title) values ($1, $2) returning id`, [projectId, title])).rows[0].id;
    await db.query(`alter table public.workspace_documents disable trigger workspace_documents_stamp`);
    await db.query(`update public.workspace_documents set created_at = $2 where id = $1`, [id, at]);
    await db.query(`alter table public.workspace_documents enable trigger workspace_documents_stamp`);
    return id;
  };
  const c = await page(hollow, 'Third', '2026-09-03');
  const a = await page(hollow, 'First', '2026-09-01');
  const b = await page(hollow, 'Second', '2026-09-02');
  const t = await page(tide, 'Only', '2026-09-01');
  const pagesBefore = (await db.query(`select * from public.workspace_documents order by id`)).rows;

  await db.exec(readMigration(M024));

  const nodes = (await db.query(
    `select project_id, target_type, document_id, folder_id, parent_node_id, position from public.workspace_nodes order by project_id, position`)).rows;
  assert.deepEqual(nodes.filter((n) => n.project_id === hollow).map((n) => [n.document_id, n.position]), [[a, 1], [b, 2], [c, 3]]);
  assert.deepEqual(nodes.filter((n) => n.project_id === tide).map((n) => [n.document_id, n.position]), [[t, 1]]);
  assert.ok(nodes.every((n) => n.target_type === 'page' && n.folder_id === null && n.parent_node_id === null));
  assert.deepEqual((await db.query(`select * from public.workspace_documents order by id`)).rows, pagesBefore,
    'ids, titles, content, versions and timestamps unchanged');
});

test('024 requires 023, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only022 = await db022();
  const before022 = await captureCatalog(only022);
  await assert.rejects(only022.exec(readMigration(M024)), /requires migration 023/);
  assert.deepEqual(diffCatalogs(before022, await captureCatalog(only022)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M024)), /Migration 024 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 11. migration 025 ─────────────────────────────────────────────────────────

const M025 = '025_workspace_collections.sql';

async function db024() {
  const db = await db023();
  await db.exec(readMigration(M024));
  return db;
}

test('025 on 024: Collections + Entries, one new node target, and nothing else — no manuscript, Page or Folder change', async () => {
  const db = await db024();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M025));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  const structural = keys.filter((k) => !k.startsWith('table_grants:') && !k.startsWith('function_grants:'));
  for (const k of structural) {
    assert.ok(
      /^(columns|constraints|indexes|policies|triggers):added:workspace_(collections|collection_entries)\./.test(k)
        || /^relations:added:workspace_(collections|collection_entries)$/.test(k)
        || /^functions:added:(freeze_workspace_entry_collection|create_workspace_collection|delete_workspace_collection)\(/.test(k)
        // The node gains its Collection target; its type constraints widen.
        || k === 'columns:added:workspace_nodes.collection_id'
        || /^(constraints|indexes):added:workspace_nodes\.workspace_nodes_collection_(id_key|same_project_fkey)$/.test(k)
        || /^constraints:changed:workspace_nodes\.workspace_nodes_target_(type_check|matches_type)$/.test(k)
        || k === 'triggers:changed:workspace_nodes.workspace_nodes_freeze_target'
        || /^functions:changed:(freeze_workspace_node_target|place_new_workspace_object)\(\)$/.test(k),
      `unexpected change: ${k}`);
  }
  for (const k of [
    'relations:added:workspace_collections',
    'relations:added:workspace_collection_entries',
    'columns:added:workspace_nodes.collection_id',
    'constraints:added:workspace_nodes.workspace_nodes_collection_id_key',
    'constraints:added:workspace_nodes.workspace_nodes_collection_same_project_fkey',
    'constraints:added:workspace_collection_entries.workspace_collection_entries_collection_same_project_fkey',
    'triggers:added:workspace_collections.workspace_collections_place_new',
    'triggers:added:workspace_collection_entries.workspace_collection_entries_stamp',
    'triggers:added:workspace_collection_entries.workspace_collection_entries_freeze_collection',
    'policies:added:workspace_collections.workspace_collections: select own',
    'policies:added:workspace_collections.workspace_collections: update own',
    'policies:added:workspace_collection_entries.workspace_collection_entries: select own',
    'policies:added:workspace_collection_entries.workspace_collection_entries: insert own',
    'policies:added:workspace_collection_entries.workspace_collection_entries: update own',
  ]) assert.ok(structural.includes(k), `missing ${k}`);
  assert.ok(!structural.some((k) => /workspace_collections: (insert|delete)|workspace_collection_entries: delete/.test(k)));

  const grants = keys.filter((k) => k.startsWith('table_grants:') || k.startsWith('function_grants:'));
  for (const role of ['anon', 'authenticated']) {
    for (const priv of ['INSERT', 'DELETE']) {
      assert.ok(!grants.includes(`table_grants:added:workspace_collections ${role} ${priv}`), `${role} cannot ${priv} collections`);
    }
    assert.ok(!grants.includes(`table_grants:added:workspace_collection_entries ${role} DELETE`), `${role} cannot DELETE entries`);
  }
  assert.ok(grants.includes('table_grants:added:workspace_collections authenticated UPDATE'));
  assert.ok(grants.includes('table_grants:added:workspace_collection_entries authenticated INSERT'));
  assert.ok(grants.includes('table_grants:added:workspace_collection_entries authenticated UPDATE'));
  for (const t of ['workspace_collections', 'workspace_collection_entries']) {
    assert.equal(after.relations.find((r) => r.table === t).rls_enabled, true, `${t} has RLS`);
  }
});

test('025 keeps every existing Page, Folder and node exactly as it was', async () => {
  const db = await db024();
  const alice = await createAuthUser(db, crypto.randomUUID());
  const hollow = (await db.query(`insert into public.projects (user_id, title) values ($1, 'Hollow') returning id`, [alice])).rows[0].id;
  await db.query(`insert into public.workspace_documents (project_id, title) values ($1, 'Ideas'), ($1, 'Rome')`, [hollow]);
  await db.query(`insert into public.workspace_folders (project_id, title) values ($1, 'Research')`, [hollow]);
  const snapshot = async () => ({
    pages: (await db.query(`select * from public.workspace_documents order by id`)).rows,
    folders: (await db.query(`select * from public.workspace_folders order by id`)).rows,
    nodes: (await db.query(`select id, project_id, target_type, document_id, folder_id, parent_node_id, position, created_at from public.workspace_nodes order by id`)).rows,
  });
  const before = await snapshot();
  await db.exec(readMigration(M025));
  assert.deepEqual(await snapshot(), before);
  assert.equal((await db.query(`select count(*)::int as n from public.workspace_nodes where collection_id is not null`)).rows[0].n, 0);
});

test('025 requires 024, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only023 = await db023();
  const before023 = await captureCatalog(only023);
  await assert.rejects(only023.exec(readMigration(M025)), /requires migration 024/);
  assert.deepEqual(diffCatalogs(before023, await captureCatalog(only023)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M025)), /Migration 025 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 12. migration 026 ─────────────────────────────────────────────────────────

const M026 = '026_collection_properties.sql';

async function db025() {
  const db = await db024();
  await db.exec(readMigration(M025));
  return db;
}

test('026 on 025: property definitions + Entry values, read-only to clients, and nothing else — no manuscript, Page, Folder or node change', async () => {
  const db = await db025();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M026));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  const structural = keys.filter((k) => !k.startsWith('table_grants:') && !k.startsWith('function_grants:'));
  for (const k of structural) {
    assert.ok(
      /^(columns|constraints|indexes|policies|triggers):added:workspace_(collection_properties|entry_values)\./.test(k)
        || /^relations:added:workspace_(collection_properties|entry_values)$/.test(k)
        || /^functions:added:(workspace_property_options_valid|workspace_property_value_valid|check_workspace_collection_property|check_workspace_entry_value|create_workspace_collection_property|update_workspace_collection_property|move_workspace_collection_property|delete_workspace_collection_property|set_workspace_entry_value)\(/.test(k)
        // The values' composite foreign key names an Entry with its Collection.
        || /^(constraints|indexes):added:workspace_collection_entries\.workspace_collection_entries_id_collection_id_key$/.test(k),
      `unexpected change: ${k}`);
  }
  for (const k of [
    'relations:added:workspace_collection_properties',
    'relations:added:workspace_entry_values',
    'constraints:added:workspace_entry_values.workspace_entry_values_entry_same_collection_fkey',
    'constraints:added:workspace_entry_values.workspace_entry_values_property_same_collection_fkey',
    'constraints:added:workspace_collection_properties.workspace_collection_properties_collection_same_project_fkey',
    'triggers:added:workspace_entry_values.workspace_entry_values_check',
    'triggers:added:workspace_collection_properties.workspace_collection_properties_check',
    'policies:added:workspace_collection_properties.workspace_collection_properties: select own',
    'policies:added:workspace_entry_values.workspace_entry_values: select own',
  ]) assert.ok(structural.includes(k), `missing ${k}`);
  assert.ok(!structural.some((k) => /^policies:added:.*: (insert|update|delete)/.test(k)), 'select policies only');

  const grants = keys.filter((k) => k.startsWith('table_grants:') || k.startsWith('function_grants:'));
  for (const t of ['workspace_collection_properties', 'workspace_entry_values']) {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
        assert.ok(!grants.includes(`table_grants:added:${t} ${role} ${priv}`), `${role} cannot ${priv} ${t}`);
      }
    }
    assert.equal(after.relations.find((r) => r.table === t).rls_enabled, true, `${t} has RLS`);
  }
});

test('026 keeps every existing Collection, Entry, Page, Folder and node exactly as it was', async () => {
  const db = await db025();
  const alice = await createAuthUser(db, crypto.randomUUID());
  const hollow = (await db.query(`insert into public.projects (user_id, title) values ($1, 'Hollow') returning id`, [alice])).rows[0].id;
  await db.query(`insert into public.workspace_documents (project_id, title) values ($1, 'Ideas')`, [hollow]);
  const c = (await db.query(`insert into public.workspace_collections (project_id, title) values ($1, 'Characters') returning id`, [hollow])).rows[0].id;
  await db.query(`insert into public.workspace_collection_entries (collection_id, project_id, title) values ($1, $2, 'Nerai'), ($1, $2, 'Alaric')`, [c, hollow]);
  const snapshot = async () => ({
    pages: (await db.query(`select * from public.workspace_documents order by id`)).rows,
    collections: (await db.query(`select * from public.workspace_collections order by id`)).rows,
    entries: (await db.query(`select * from public.workspace_collection_entries order by id`)).rows,
    nodes: (await db.query(`select * from public.workspace_nodes order by id`)).rows,
  });
  const before = await snapshot();
  await db.exec(readMigration(M026));
  assert.deepEqual(await snapshot(), before);
});

test('026 requires 025, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only024 = await db024();
  const before024 = await captureCatalog(only024);
  await assert.rejects(only024.exec(readMigration(M026)), /requires migration 025/);
  assert.deepEqual(diffCatalogs(before024, await captureCatalog(only024)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M026)), /Migration 026 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 13. migration 027 ─────────────────────────────────────────────────────────

const M027 = '027_collection_views.sql';

async function db026() {
  const db = await db025();
  await db.exec(readMigration(M026));
  return db;
}

test('027 on 026: saved Collection Views, read-only to clients, and nothing else — no manuscript, Page, Folder, node, Entry or value change', async () => {
  const db = await db026();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M027));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  const structural = keys.filter((k) => !k.startsWith('table_grants:') && !k.startsWith('function_grants:'));
  for (const k of structural) {
    assert.ok(
      /^(columns|constraints|indexes|policies|triggers):added:workspace_collection_views\./.test(k)
        || /^relations:added:workspace_collection_views$/.test(k)
        || /^functions:added:(workspace_view_config_shape_valid|normalize_workspace_view_config|prune_workspace_view_config|default_workspace_view_config|check_workspace_collection_view|create_default_workspace_collection_view|sync_workspace_views_with_property|create_workspace_collection_view|update_workspace_collection_view|move_workspace_collection_view|delete_workspace_collection_view)\(/.test(k)
        // Views follow their Collection and its properties.
        || /^triggers:added:workspace_collections\.workspace_collections_default_view$/.test(k)
        || /^triggers:added:workspace_collection_properties\.workspace_collection_properties_views_(added|changed|removed)$/.test(k),
      `unexpected change: ${k}`);
  }
  for (const k of [
    'relations:added:workspace_collection_views',
    'constraints:added:workspace_collection_views.workspace_collection_views_collection_same_project_fkey',
    'triggers:added:workspace_collection_views.workspace_collection_views_check',
    'triggers:added:workspace_collections.workspace_collections_default_view',
    'policies:added:workspace_collection_views.workspace_collection_views: select own',
  ]) assert.ok(structural.includes(k), `missing ${k}`);
  assert.ok(!structural.some((k) => /^policies:added:.*: (insert|update|delete)/.test(k)), 'select policies only');

  const grants = keys.filter((k) => k.startsWith('table_grants:') || k.startsWith('function_grants:'));
  for (const role of ['anon', 'authenticated']) {
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      assert.ok(!grants.includes(`table_grants:added:workspace_collection_views ${role} ${priv}`), `${role} cannot ${priv} views`);
    }
  }
  assert.equal(after.relations.find((r) => r.table === 'workspace_collection_views').rls_enabled, true);
});

test('027 keeps every existing Collection, Entry, property, value, Page and node exactly as it was, and gives each Collection one List', async () => {
  const db = await db026();
  const alice = await createAuthUser(db, crypto.randomUUID());
  const hollow = (await db.query(`insert into public.projects (user_id, title) values ($1, 'Hollow') returning id`, [alice])).rows[0].id;
  await db.query(`insert into public.workspace_documents (project_id, title) values ($1, 'Ideas')`, [hollow]);
  const c = (await db.query(`insert into public.workspace_collections (project_id, title) values ($1, 'Characters') returning id`, [hollow])).rows[0].id;
  const c2 = (await db.query(`insert into public.workspace_collections (project_id, title) values ($1, 'Places') returning id`, [hollow])).rows[0].id;
  const e = (await db.query(`insert into public.workspace_collection_entries (collection_id, project_id, title) values ($1, $2, 'Nerai') returning id`, [c, hollow])).rows[0].id;
  const [role, age] = (await db.query(`insert into public.workspace_collection_properties (collection_id, project_id, name, type, position, shown_in_list)
     values ($1, $2, 'Role', 'text', 1, true), ($1, $2, 'Age', 'number', 2, false) returning id`, [c, hollow])).rows.map((r) => r.id);
  await db.query(`insert into public.workspace_entry_values (entry_id, property_id, collection_id, project_id, value) values ($1, $2, $3, $4, '"Hero"')`, [e, role, c, hollow]);
  const snapshot = async () => ({
    pages: (await db.query(`select * from public.workspace_documents order by id`)).rows,
    collections: (await db.query(`select * from public.workspace_collections order by id`)).rows,
    entries: (await db.query(`select * from public.workspace_collection_entries order by id`)).rows,
    properties: (await db.query(`select * from public.workspace_collection_properties order by id`)).rows,
    values: (await db.query(`select * from public.workspace_entry_values order by entry_id`)).rows,
    nodes: (await db.query(`select * from public.workspace_nodes order by id`)).rows,
  });
  const before = await snapshot();
  await db.exec(readMigration(M027));
  assert.deepEqual(await snapshot(), before);
  const views = (await db.query(`select collection_id, name, type, position, config from public.workspace_collection_views order by collection_id = $1 desc`, [c])).rows;
  assert.deepEqual(views, [
    { collection_id: c, name: 'List', type: 'list', position: 1, config: { properties: [role], sort: null, filters: [], group_by: null } },
    { collection_id: c2, name: 'List', type: 'list', position: 1, config: { properties: [], sort: null, filters: [], group_by: null } },
  ]);
  assert.ok(age);
});

test('027 requires 026, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only025 = await db025();
  const before025 = await captureCatalog(only025);
  await assert.rejects(only025.exec(readMigration(M027)), /requires migration 026/);
  assert.deepEqual(diffCatalogs(before025, await captureCatalog(only025)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M027)), /Migration 027 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 14. migration 028 ─────────────────────────────────────────────────────────

const M028 = '028_references.sql';

async function db027() {
  const db = await db026();
  await db.exec(readMigration(M027));
  return db;
}

test('028 on 027: object_references and Relationship columns, read-only to clients — no manuscript table, function or policy changes', async () => {
  const db = await db027();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M028));
  const after = await captureCatalog(db);
  const { differences } = diffCatalogs(before, after);
  const keys = differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  const structural = keys.filter((k) => !k.startsWith('table_grants:') && !k.startsWith('function_grants:'));
  for (const k of structural) {
    assert.ok(
      /^(columns|constraints|indexes|policies|triggers):added:object_references\./.test(k)
        || /^relations:added:object_references$/.test(k)
        || /^functions:added:(reference_object_project|check_object_reference|create_workspace_relationship_property|update_workspace_relationship_property|set_workspace_entry_relationship|add_object_reference|remove_object_reference)\(/.test(k)
        // The two rules that learn about Relationships.
        || /^functions:changed:(prune_workspace_view_config|delete_workspace_collection_property)\(/.test(k)
        // Relationship columns and their checks on the property definitions.
        || /^columns:added:workspace_collection_properties\.relation_(target|collection_id|many)$/.test(k)
        || /^constraints:(added|changed):workspace_collection_properties\.workspace_collection_properties_(type_check|relation_check|relation_target_fkey)$/.test(k)
        || /^indexes:added:workspace_collection_properties\.workspace_collection_properties_relation_collection_id_idx$/.test(k)
        // The key the references' composite FKs name.
        || /^(constraints|indexes):added:workspace_collection_entries\.workspace_collection_entries_id_project_id_key$/.test(k),
      `unexpected change: ${k}`);
  }
  for (const k of [
    'relations:added:object_references',
    'constraints:added:object_references.object_references_source_scene_id_fkey',
    'constraints:added:object_references.object_references_target_entry_same_project_fkey',
    'constraints:added:object_references.object_references_once_key',
    'triggers:added:object_references.object_references_check',
    'policies:added:object_references.object_references: select own',
    'columns:added:workspace_collection_properties.relation_target',
  ]) assert.ok(structural.includes(k), `missing ${k}`);
  assert.ok(!structural.some((k) => /^policies:added:.*: (insert|update|delete)/.test(k)), 'select policies only');
  assert.ok(!structural.some((k) => /(^|[:.])(scenes|chapters|manuscripts|manuscript_groups|projects)[.(]/.test(k.split(':').slice(2).join(':'))),
    'no manuscript or project object changes');

  const grants = keys.filter((k) => k.startsWith('table_grants:') || k.startsWith('function_grants:'));
  for (const role of ['anon', 'authenticated']) {
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      assert.ok(!grants.includes(`table_grants:added:object_references ${role} ${priv}`), `${role} cannot ${priv} references`);
    }
  }
  assert.equal(after.relations.find((r) => r.table === 'object_references').rls_enabled, true);
});

test('028 keeps every existing Scene, Collection, Entry, property, value, View, Page and node exactly as it was', async () => {
  const db = await db027();
  const alice = await createAuthUser(db, crypto.randomUUID());
  const hollow = (await db.query(`insert into public.projects (user_id, title) values ($1, 'Hollow') returning id`, [alice])).rows[0].id;
  await db.query(`insert into public.workspace_documents (project_id, title) values ($1, 'Ideas')`, [hollow]);
  const c = (await db.query(`insert into public.workspace_collections (project_id, title) values ($1, 'Characters') returning id`, [hollow])).rows[0].id;
  const e = (await db.query(`insert into public.workspace_collection_entries (collection_id, project_id, title) values ($1, $2, 'Nerai') returning id`, [c, hollow])).rows[0].id;
  const role = (await db.query(`insert into public.workspace_collection_properties (collection_id, project_id, name, type, position, shown_in_list)
     values ($1, $2, 'Role', 'text', 1, true) returning id`, [c, hollow])).rows[0].id;
  await db.query(`insert into public.workspace_entry_values (entry_id, property_id, collection_id, project_id, value) values ($1, $2, $3, $4, '"Hero"')`, [e, role, c, hollow]);
  const snapshot = async () => ({
    scenes: (await db.query(`select * from public.scenes order by id`)).rows,
    chapters: (await db.query(`select * from public.chapters order by id`)).rows,
    pages: (await db.query(`select * from public.workspace_documents order by id`)).rows,
    collections: (await db.query(`select * from public.workspace_collections order by id`)).rows,
    entries: (await db.query(`select * from public.workspace_collection_entries order by id`)).rows,
    properties: (await db.query(`select id, collection_id, project_id, name, type, options, position, shown_in_list, created_at, updated_at from public.workspace_collection_properties order by id`)).rows,
    values: (await db.query(`select * from public.workspace_entry_values order by entry_id`)).rows,
    views: (await db.query(`select * from public.workspace_collection_views order by id`)).rows,
    nodes: (await db.query(`select * from public.workspace_nodes order by id`)).rows,
  });
  const before = await snapshot();
  await db.exec(readMigration(M028));
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual((await db.query(`select relation_target, relation_collection_id, relation_many from public.workspace_collection_properties`)).rows,
    [{ relation_target: null, relation_collection_id: null, relation_many: false }]);
  assert.equal((await db.query(`select count(*)::int as n from public.object_references`)).rows[0].n, 0);
});

test('028 requires 027, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only026 = await db026();
  const before026 = await captureCatalog(only026);
  await assert.rejects(only026.exec(readMigration(M028)), /requires migration 027/);
  assert.deepEqual(diffCatalogs(before026, await captureCatalog(only026)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M028)), /Migration 028 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 15. migration 029 ─────────────────────────────────────────────────────────

const M029 = '029_project_search.sql';

async function db028() {
  const db = await db027();
  await db.exec(readMigration(M028));
  return db;
}

test('029 on 028: two read-only functions and nothing else — no table, row, policy or manuscript change', async () => {
  const db = await db028();
  const before = await captureCatalog(db);
  const rows = async () => ({
    scenes: (await db.query(`select * from public.scenes order by id`)).rows,
    pages: (await db.query(`select * from public.workspace_documents order by id`)).rows,
    entries: (await db.query(`select * from public.workspace_collection_entries order by id`)).rows,
  });
  const beforeRows = await rows();
  await db.exec(readMigration(M029));
  const after = await captureCatalog(db);
  const keys = diffCatalogs(before, after).differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  for (const k of keys) {
    assert.ok(
      /^functions:added:(rich_text_plain|search_project_content)\(/.test(k)
        || /^function_grants:added:(rich_text_plain|search_project_content)\(.*\) (authenticated|service_role|postgres) EXECUTE$/.test(k),
      `unexpected change: ${k}`);
  }
  assert.ok(keys.some((k) => k.startsWith('functions:added:search_project_content(')));
  assert.ok(keys.some((k) => k.startsWith('functions:added:rich_text_plain(')));
  assert.ok(!keys.some((k) => / anon EXECUTE$/.test(k)), 'anon cannot search');
  const fn = (await db.query(`select prosecdef, provolatile from pg_proc where proname = 'search_project_content'`)).rows[0];
  assert.deepEqual(fn, { prosecdef: false, provolatile: 's' }, 'SECURITY INVOKER (the caller\'s own RLS) and STABLE (reads only)');
  assert.deepEqual(await rows(), beforeRows);
});

test('029 requires 028, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only027 = await db027();
  const before027 = await captureCatalog(only027);
  await assert.rejects(only027.exec(readMigration(M029)), /requires migration 028/);
  assert.deepEqual(diffCatalogs(before027, await captureCatalog(only027)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M029)), /Migration 029 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 16. migration 030 ─────────────────────────────────────────────────────────

const M030 = '030_workspace_trash.sql';

async function db029() {
  const db = await db028();
  await db.exec(readMigration(M029));
  return db;
}

test('030 on 029: Trash columns, active-only policies and the Trash functions — no manuscript table, function or policy change, no row change', async () => {
  const db = await db029();
  const before = await captureCatalog(db);
  const rows = async () => ({
    scenes: (await db.query(`select * from public.scenes order by id`)).rows,
    chapters: (await db.query(`select * from public.chapters order by id`)).rows,
    projects: (await db.query(`select id, word_count from public.projects order by id`)).rows,
    pages: (await db.query(`select id, title, content, version from public.workspace_documents order by id`)).rows,
    nodes: (await db.query(`select * from public.workspace_nodes order by id`)).rows,
  });
  const beforeRows = await rows();
  await db.exec(readMigration(M030));
  const keys = diffCatalogs(before, await captureCatalog(db)).differences.map((d) => `${d.section}:${d.kind}:${d.key}`).sort();
  const TRASHABLE = '(workspace_documents|workspace_folders|workspace_collections|workspace_collection_entries)';
  for (const k of keys) {
    assert.ok(
      new RegExp(`^columns:added:${TRASHABLE}\\.trashed_(at|from_folder_id|from_position)$`).test(k)
        || new RegExp(`^(constraints|indexes):added:${TRASHABLE}\\.${TRASHABLE}_trash(ed_idx|_check)$`).test(k)
        || new RegExp(`^policies:changed:${TRASHABLE}\\.${TRASHABLE}: (select|insert|update) own$`).test(k)
        || /^policies:changed:object_references\.object_references: select own$/.test(k)
        || /^functions:added:(workspace_object_active|guard_workspace_trash|owned_workspace_object_project|trash_workspace_object|restore_workspace_object|delete_trashed_workspace_object|list_workspace_trash|workspace_trash_state)\(/.test(k)
        || /^functions:changed:(set_workspace_entry_value|set_workspace_entry_relationship|search_project_content)\(/.test(k)
        || /^function_grants:added:(workspace_object_active|guard_workspace_trash|owned_workspace_object_project|trash_workspace_object|restore_workspace_object|delete_trashed_workspace_object|list_workspace_trash|workspace_trash_state)\(.*\) (authenticated|service_role|postgres) EXECUTE$/.test(k)
        || /^triggers:added:(object_references|workspace_collection_properties|workspace_collection_views)\.\1_guard_trash$/.test(k)
        || /^relation_counts?:/.test(k),
      `unexpected change: ${k}`);
  }
  assert.ok(keys.includes('columns:added:workspace_documents.trashed_at'));
  assert.ok(!keys.some((k) => / anon EXECUTE$/.test(k)), 'nothing for anon');
  assert.ok(!keys.some((k) => /^policies:added:/.test(k)), 'no new policy: the existing ones now require active objects');
  assert.ok(!keys.some((k) => /(^|[:.])(scenes|chapters|manuscripts|manuscript_groups|projects)[.(]/.test(k.split(':').slice(2).join(':'))),
    'nothing in the manuscript');
  assert.deepEqual(await rows(), beforeRows, 'every row as it was: nothing is trashed');
});

test('030 requires 029, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only028 = await db028();
  const before028 = await captureCatalog(only028);
  await assert.rejects(only028.exec(readMigration(M030)), /requires migration 029/);
  assert.deepEqual(diffCatalogs(before028, await captureCatalog(only028)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M030)), /Migration 030 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 17. migration 031 ─────────────────────────────────────────────────────────

const M031 = '031_scene_trash.sql';

async function db030() {
  const db = await db029();
  await db.exec(readMigration(M030));
  return db;
}

test('031 on 030: Scene Trash — two columns, active-only Scene policies, the Trash functions — and no row, total or RPC signature change', async () => {
  const db = await db030();
  const before = await captureCatalog(db);
  const rows = async () => ({
    scenes: (await db.query(`select * from public.scenes order by id`)).rows,
    chapters: (await db.query(`select * from public.chapters order by id`)).rows,
    projects: (await db.query(`select id, word_count from public.projects order by id`)).rows,
    sessions: (await db.query(`select * from public.writing_sessions order by id`)).rows,
  });
  const beforeRows = await rows();
  await db.exec(readMigration(M031));
  const keys = diffCatalogs(before, await captureCatalog(db)).differences.map((d) => `${d.section}:${d.kind}${d.fields ? '[' + d.fields.join(',') + ']' : ''}:${d.key}`).sort();
  const NEW = '(trash_manuscript_scene|restore_manuscript_scene|delete_trashed_manuscript_scene)';
  for (const k of keys) {
    assert.ok(
      /^columns:added:scenes\.(trashed_at|trashed_from_chapter_id)$/.test(k)
        || /^(constraints|indexes):added:scenes\.(scenes_trash_check|scenes_trashed_idx)$/.test(k)
        || /^(constraints|indexes):changed(\[.*\])?:scenes\.scenes_unplaced_position_excl$/.test(k)
        || /^policies:changed(\[.*\])?:scenes\.scenes: (select|update|delete) own$/.test(k)
        || new RegExp(`^functions:added:${NEW}\\(`).test(k)
        || new RegExp(`^function_grants:added:${NEW}\\(.*\\) (service_role|postgres) EXECUTE$`).test(k)
        || /^functions:changed(\[.*\])?:(increment_scene_version|duplicate_project_checked|search_project_content|workspace_object_active|owned_workspace_object_project|trash_workspace_object|restore_workspace_object|delete_trashed_workspace_object|list_workspace_trash|workspace_trash_state)\(/.test(k)
        || /^functions:changed\[(definition,)?security_definer\]:account_word_total\(/.test(k)
        || /^relation_counts?:/.test(k),
      `unexpected change: ${k}`);
  }
  assert.ok(keys.includes('columns:added:scenes.trashed_at'));
  assert.ok(!keys.some((k) => /^functions:(added|removed):(save_scene_checked|insert_scene_checked|insert_unplaced_scene_checked|account_word_total|move_scene|reorder_chapter_scenes|delete_chapter)\(/.test(k)),
    'no load-bearing RPC is added, removed or re-signed');
  assert.ok(!keys.some((k) => / (anon|authenticated) EXECUTE$/.test(k) && k.includes('added')), 'the Scene helpers are internal');
  assert.deepEqual(await rows(), beforeRows, 'every row, total and session as it was: nothing is trashed');
  const fn = (await db.query(`select prosecdef from pg_proc where proname = 'account_word_total'`)).rows[0];
  assert.equal(fn.prosecdef, true, 'account_word_total counts the same rows from every caller');
});

test('031 requires 030, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only029 = await db029();
  const before029 = await captureCatalog(only029);
  await assert.rejects(only029.exec(readMigration(M031)), /requires migration 030/);
  assert.deepEqual(diffCatalogs(before029, await captureCatalog(only029)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M031)), /Migration 031 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 18. migration 032 ─────────────────────────────────────────────────────────

const M032 = '032_scene_properties_views.sql';

async function db031() {
  const db = await db030();
  await db.exec(readMigration(M031));
  return db;
}

test('032 on 031: three Scene metadata tables, the View rules and Scene Relationship values — and no Scene, Chapter, total or manuscript RPC change', async () => {
  const db = await db031();
  const before = await captureCatalog(db);
  const rows = async () => ({
    scenes: (await db.query(`select * from public.scenes order by id`)).rows,
    chapters: (await db.query(`select * from public.chapters order by id`)).rows,
    projects: (await db.query(`select id, word_count from public.projects order by id`)).rows,
    references: (await db.query(`select * from public.object_references order by id`)).rows,
    views: (await db.query(`select * from public.workspace_collection_views order by id`)).rows,
  });
  const beforeRows = await rows();
  await db.exec(readMigration(M032));
  const keys = diffCatalogs(before, await captureCatalog(db)).differences.map((d) => `${d.section}:${d.kind}${d.fields ? '[' + d.fields.join(',') + ']' : ''}:${d.key}`).sort();
  const TABLES = '(scene_property_definitions|scene_property_values|scene_views)';
  const NEW = '(prune_view_config|manuscript_scene_view_fields|prune_scene_view_config|default_scene_view_config|check_scene_property_definition|check_scene_property_value|check_scene_view|sync_scene_views_with_property|owned_project_manuscript|create_scene_property|create_scene_relationship_property|update_scene_property|move_scene_property|delete_scene_property|set_scene_property_value|set_scene_relationship|create_scene_view|update_scene_view|move_scene_view|delete_scene_view)';
  for (const k of keys) {
    assert.ok(
      new RegExp(`^(columns|constraints|indexes|policies|triggers):added:${TABLES}\\.`).test(k)
        || new RegExp(`^relations:added:${TABLES}$`).test(k)
        || new RegExp(`^table_grants:added:${TABLES} (anon|authenticated|service_role) [A-Z]+$`).test(k)
        || /^columns:added:object_references\.scene_property_id$/.test(k)
        || /^(constraints|indexes):added:object_references\.object_references_(property_source_check|scene_property_id_fkey|scene_property_id_idx)$/.test(k)
        || /^constraints:removed:object_references\.object_references_property_from_entry$/.test(k)
        || /^(constraints|indexes):changed(\[.*\])?:object_references\.object_references_once_key$/.test(k)
        || /^triggers:changed(\[.*\])?:workspace_collection_properties\.workspace_collection_properties_views_changed$/.test(k)
        || new RegExp(`^functions:added:${NEW}\\(`).test(k)
        || new RegExp(`^function_grants:added:${NEW}\\(.*\\) (authenticated|service_role|postgres) EXECUTE$`).test(k)
        || /^functions:changed(\[.*\])?:(workspace_view_config_shape_valid|prune_workspace_view_config|check_object_reference|add_object_reference|remove_object_reference|list_workspace_trash|delete_trashed_workspace_object)\(/.test(k)
        || /^relation_counts?:/.test(k),
      `unexpected change: ${k}`);
  }
  assert.ok(keys.includes('relations:added:scene_property_definitions'));
  assert.ok(!keys.some((k) => /^table_grants:added:.* (anon|authenticated) (INSERT|UPDATE|DELETE)$/.test(k)), 'clients only read');
  assert.ok(keys.includes('columns:added:object_references.scene_property_id'));
  assert.ok(!keys.some((k) => / anon EXECUTE$/.test(k)), 'nothing for anon');
  assert.ok(!keys.some((k) => /^function_grants:added:owned_project_manuscript\(.*\) authenticated/.test(k)), 'the ownership helper is internal');
  assert.ok(!keys.some((k) => /(^|[:.])(scenes|chapters|manuscripts|manuscript_groups|projects|writing_sessions)[.(]/.test(k.split(':').slice(2).join(':'))),
    'no manuscript table, policy or trigger');
  assert.ok(!keys.some((k) => /^functions:(added|removed|changed)[^:]*:(save_scene_checked|insert_scene_checked|insert_unplaced_scene_checked|account_word_total|ordered_manuscript_word_total|move_scene|reorder_chapter_scenes|delete_chapter|increment_scene_version|duplicate_project_checked)\(/.test(k)),
    'no manuscript RPC is added, removed or redefined');
  assert.deepEqual(await rows(), beforeRows, 'every Scene, Chapter, total, reference and Collection View as it was');
  const rls = (await db.query(`select relname, relrowsecurity from pg_class where relname in ('scene_property_definitions', 'scene_property_values', 'scene_views') order by relname`)).rows;
  assert.deepEqual(rls.map((r) => r.relrowsecurity), [true, true, true], 'RLS on every new table');
});

test('032 requires 031, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only030 = await db030();
  const before030 = await captureCatalog(only030);
  await assert.rejects(only030.exec(readMigration(M032)), /requires migration 031/);
  assert.deepEqual(diffCatalogs(before030, await captureCatalog(only030)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M032)), /Migration 032 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 19. migration 033 ─────────────────────────────────────────────────────────

const M033 = '033_manuscript_import.sql';

async function db032() {
  const db = await db031();
  await db.exec(readMigration(M032));
  return db;
}

test('033 on 032: three import functions — and no table, column, trigger, policy, existing function or row change', async () => {
  const db = await db032();
  const before = await captureCatalog(db);
  const rows = async () => ({
    projects: (await db.query(`select * from public.projects order by id`)).rows,
    chapters: (await db.query(`select * from public.chapters order by id`)).rows,
    scenes: (await db.query(`select * from public.scenes order by id`)).rows,
    sessions: (await db.query(`select * from public.writing_sessions order by id`)).rows,
  });
  const beforeRows = await rows();
  await db.exec(readMigration(M033));
  const keys = diffCatalogs(before, await captureCatalog(db)).differences.map((d) => `${d.section}:${d.kind}${d.fields ? '[' + d.fields.join(',') + ']' : ''}:${d.key}`).sort();
  const NEW = '(import_manuscript_checked|import_manuscript_items|import_manuscript_shape)';
  for (const k of keys) {
    assert.ok(
      new RegExp(`^functions:added:${NEW}\\(`).test(k)
        || new RegExp(`^function_grants:added:${NEW}\\(.*\\) (authenticated|service_role|postgres) EXECUTE$`).test(k)
        || /^relation_counts?:/.test(k),
      `unexpected change: ${k}`);
  }
  assert.equal(keys.filter((k) => k.startsWith('functions:added:')).length, 3);
  assert.ok(keys.some((k) => /^function_grants:added:import_manuscript_checked\(.*\) authenticated EXECUTE$/.test(k)), 'writers may import');
  assert.ok(!keys.some((k) => /^function_grants:added:import_manuscript_(items|shape)\(.*\) authenticated/.test(k)), 'the internals are closed');
  assert.ok(!keys.some((k) => / anon EXECUTE$/.test(k)), 'nothing for anon');
  assert.deepEqual(await rows(), beforeRows);
});

test('033 requires 032, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only031 = await db031();
  const before031 = await captureCatalog(only031);
  await assert.rejects(only031.exec(readMigration(M033)), /requires migration 032/);
  assert.deepEqual(diffCatalogs(before031, await captureCatalog(only031)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M033)), /Migration 033 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 20. migration 034 ─────────────────────────────────────────────────────────

const M034 = '034_view_column_widths.sql';

async function db033() {
  const db = await db032();
  await db.exec(readMigration(M033));
  return db;
}

test('034 on 033: the three View-rule functions accept and prune widths — nothing else, and every existing View stays valid and unchanged', async () => {
  const db = await db033();
  const before = await captureCatalog(db);
  const views = async () => ({
    collection: (await db.query(`select * from public.workspace_collection_views order by id`)).rows,
    scene: (await db.query(`select * from public.scene_views order by id`)).rows,
  });
  const beforeViews = await views();
  await db.exec(readMigration(M034));
  const keys = diffCatalogs(before, await captureCatalog(db)).differences.map((d) => `${d.section}:${d.kind}${d.fields ? '[' + d.fields.join(',') + ']' : ''}:${d.key}`).sort();
  for (const k of keys) {
    assert.ok(
      /^functions:changed(\[.*\])?:(workspace_view_config_shape_valid|normalize_workspace_view_config|prune_view_config)\(/.test(k)
        || /^relation_counts?:/.test(k),
      `unexpected change: ${k}`);
  }
  assert.equal(keys.filter((k) => k.startsWith('functions:changed')).length, 3);
  assert.deepEqual(await views(), beforeViews, 'no View row changes');
  // Every config without widths — as every existing and default config is — normalises and prunes to itself.
  const sample = { properties: [], sort: null, filters: [], group_by: null };
  const q = async (sql, params) => (await db.query(sql, params)).rows[0].v;
  assert.deepEqual(await q(`select public.normalize_workspace_view_config($1::jsonb) v`, [JSON.stringify(sample)]), sample);
  assert.deepEqual(await q(`select public.prune_view_config('[]'::jsonb, $1::jsonb) v`, [JSON.stringify(sample)]), sample);
  // With widths: kept for 'title' and known fields, dropped otherwise.
  assert.deepEqual(
    await q(`select public.prune_view_config('[{"id":"a","type":"text"}]'::jsonb, $1::jsonb) v`, [JSON.stringify({ ...sample, widths: { title: 200, a: 300, gone: 100 } })]),
    { ...sample, widths: { title: 200, a: 300 } });
  assert.equal(await q(`select public.workspace_view_config_shape_valid($1::jsonb) v`, [JSON.stringify({ widths: { a: 81 } })]), true);
  for (const bad of [{ widths: { a: 79 } }, { widths: { a: 641 } }, { widths: { a: 100.5 } }, { widths: { a: '100' } }, { widths: [] }]) {
    assert.equal(await q(`select public.workspace_view_config_shape_valid($1::jsonb) v`, [JSON.stringify(bad)]), false, JSON.stringify(bad));
  }
});

test('034 requires 033, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only032 = await db032();
  const before032 = await captureCatalog(only032);
  await assert.rejects(only032.exec(readMigration(M034)), /requires migration 033/);
  assert.deepEqual(diffCatalogs(before032, await captureCatalog(only032)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M034)), /Migration 034 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 21. migration 035 ─────────────────────────────────────────────────────────

const M035 = '035_inline_references.sql';

async function db034() {
  const db = await db033();
  await db.exec(readMigration(M034));
  return db;
}

test('035 on 034: references gain an origin and a Chapter end, mentions are derived by four triggers — nothing else changes', async () => {
  const db = await db034();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M035));
  const keys = diffCatalogs(before, await captureCatalog(db)).differences.map((d) => `${d.section}:${d.kind}${d.fields ? '[' + d.fields.join(',') + ']' : ''}:${d.key}`).sort();
  const changed = (f) => `functions:changed[body_md5,definition,body_length]:${f}`;
  assert.deepEqual(keys.filter((k) => !/^relation_counts?:/.test(k)), [
    'columns:added:object_references.origin',
    'columns:added:object_references.target_chapter_id',
    'constraints:added:object_references.object_references_inline_generic',
    'constraints:added:object_references.object_references_origin_check',
    'constraints:added:object_references.object_references_target_chapter_id_fkey',
    'constraints:changed[definition]:object_references.object_references_once_key',
    'constraints:changed[definition]:object_references.object_references_target_matches_type',
    'constraints:changed[definition]:object_references.object_references_target_type_check',
    // Owner and service role only: never anon or authenticated (and a trigger function can't be called anyway).
    'function_grants:added:sync_workspace_inline_references() postgres EXECUTE',
    'function_grants:added:sync_workspace_inline_references() service_role EXECUTE',
    'functions:added:sync_workspace_inline_references()',
    changed('add_object_reference(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid)'),
    changed('check_object_reference()'),
    changed('guard_workspace_trash()'),
    changed('reference_object_project(p_type text, p_id uuid)'),
    changed('remove_object_reference(p_reference_id uuid)'),
    changed('workspace_object_active(p_type text, p_id uuid)'),
    'indexes:added:object_references.object_references_target_chapter_id_idx',
    'indexes:changed[definition]:object_references.object_references_once_key',
    'policies:changed[using]:object_references.object_references: select own',
    'triggers:added:workspace_collection_entries.workspace_collection_entries_inline_references_insert',
    'triggers:added:workspace_collection_entries.workspace_collection_entries_inline_references_update',
    'triggers:added:workspace_documents.workspace_documents_inline_references_insert',
    'triggers:added:workspace_documents.workspace_documents_inline_references_update',
  ]);
  // Existing references are links; the column's default keeps every 028/032 writer's rows links.
  const col = (await db.query(`select column_default, is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'object_references' and column_name = 'origin'`)).rows[0];
  assert.deepEqual(col, { column_default: "'link'::text", is_nullable: 'NO' });
});

test('035 requires 034, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only033 = await db033();
  const before033 = await captureCatalog(only033);
  await assert.rejects(only033.exec(readMigration(M035)), /requires migration 034/);
  assert.deepEqual(diffCatalogs(before033, await captureCatalog(only033)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M035)), /Migration 035 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});

// ── 22. migration 036 ─────────────────────────────────────────────────────────

const M036 = '036_scene_history_milestones.sql';

async function db035() {
  const db = await db034();
  await db.exec(readMigration(M035));
  return db;
}

test('036 on 035: Scene History and Milestones are three new tables, two Scene triggers and their functions — nothing existing changes', async () => {
  const db = await db035();
  const before = await captureCatalog(db);
  await db.exec(readMigration(M036));
  const keys = diffCatalogs(before, await captureCatalog(db)).differences.map((d) => `${d.section}:${d.kind}${d.fields ? '[' + d.fields.join(',') + ']' : ''}:${d.key}`).sort();
  const changes = keys.filter((k) => !/^relation_counts?:/.test(k));
  assert.deepEqual(changes.filter((k) => !k.includes(':added:')), [], 'additions only: no existing object changes');
  const NEW = /^(scene_revisions|manuscript_milestones|manuscript_milestone_scenes)\b/;
  // On existing tables: exactly the two Scene triggers.
  assert.deepEqual(
    changes.filter((k) => /^(columns|constraints|indexes|policies|triggers|relations|table_grants):/.test(k) && !NEW.test(k.split(':').slice(2).join(':'))),
    ['triggers:added:scenes.scenes_forget_history', 'triggers:added:scenes.scenes_record_revision']
  );
  assert.deepEqual(changes.filter((k) => k.startsWith('functions:')), [
    'functions:added:create_manuscript_milestone(p_manuscript_id uuid, p_name text)',
    'functions:added:delete_manuscript_milestone(p_milestone_id uuid)',
    'functions:added:forget_scene_history()',
    'functions:added:get_manuscript_milestone(p_milestone_id uuid)',
    'functions:added:get_scene_revision(p_revision_id uuid)',
    'functions:added:list_manuscript_milestones(p_manuscript_id uuid)',
    'functions:added:list_scene_history(p_scene_id uuid)',
    'functions:added:prune_scene_revisions(p_scene_id uuid)',
    'functions:added:record_scene_revision()',
    'functions:added:restore_scene_revision(p_revision_id uuid, p_expected_version integer)',
  ]);
  const grants = changes.filter((k) => k.startsWith('function_grants:'));
  assert.deepEqual(grants.filter((k) => / anon /.test(k)), [], 'anon executes nothing');
  assert.deepEqual(grants.filter((k) => / authenticated /.test(k)).map((k) => k.split(':')[2].split('(')[0]), [
    'create_manuscript_milestone', 'delete_manuscript_milestone', 'get_manuscript_milestone', 'get_scene_revision',
    'list_manuscript_milestones', 'list_scene_history', 'restore_scene_revision',
  ], 'the internal trigger and pruning functions are not callable by clients');
  assert.deepEqual(changes.filter((k) => /^table_grants:.* (anon|authenticated) (INSERT|UPDATE|DELETE)$/.test(k)), [], 'clients never write history');
  for (const t of ['scene_revisions', 'manuscript_milestones', 'manuscript_milestone_scenes']) {
    assert.equal((await db.query(`select relrowsecurity from pg_class where oid = $1::regclass`, [`public.${t}`])).rows[0].relrowsecurity, true, t);
  }
});

test('036 requires 035, refuses to run twice (including on schema.sql), and changes nothing when it refuses', async () => {
  const only034 = await db034();
  const before034 = await captureCatalog(only034);
  await assert.rejects(only034.exec(readMigration(M036)), /requires migration 035/);
  assert.deepEqual(diffCatalogs(before034, await captureCatalog(only034)).differences, []);
  for (const db of [await migratedDb(), await freshRune2Db()]) {
    const before = await captureCatalog(db);
    await assert.rejects(db.exec(readMigration(M036)), /Migration 036 has already been applied/);
    assert.deepEqual(diffCatalogs(before, await captureCatalog(db)).differences, []);
  }
});
