// Rune 2.0 manuscript contracts, through REAL Postgres (PGlite) running the
// canonical Rune 2.0 schema (src/lib/supabase/schema.sql): ownership / RLS,
// the Scene save RPCs, the free-limit total, duplication, triggers, writing
// history and deletion.
//
// Data: the synthetic legacy fixture, moved into the Rune 2.0 schema with the
// approved mapping (lib/legacy-to-rune2.mjs), so every production shape is
// present, including Unplaced Scenes (the former canonical siblings).
//
// These are the Task 1 FUTURE contracts (formerly skipped in
// sql-ownership-contract.test.mjs, written against a hypothetical
// `pages.manuscript_id`), now executable against `scenes`, plus the REAL
// application modules (last section): the autosave server action, the offline
// sync engine and the export loader.
//
// Shapes (the app's own shapes; the last section runs the real code):
//   READ_SYNC / READ_DEEP / READ_CONFLICT / READ_VERIFY  syncEngine.ts, SyncConflictModal.tsx
//   KEEP_LOCAL   save_scene_checked(p_expected_version: null)
//   AUTOSAVE     save_scene_checked(p_expected_version: n)   (actions/scenes.ts syncSceneWithLimitCheck)
//   EXPORT_LOAD  export/projectExport.ts loadManuscriptForExport (REAL module)
import 'fake-indexeddb/auto'; // the sync engine's offline queue (db.ts)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTestDb, readRepoFile, HARNESS_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture, syntheticDoc } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id; // starter_2k, every-Scene total 3035 (over the 2000 limit)
const BRAM = USERS.bram.id; // legacy_15k, total 2740
const UNPLACED_ALICE = pageId('h3b'); // canonical sibling in hollow.ch3 → Unplaced (version 3)
const UNPLACED_BRAM = pageId('t1c'); // canonical sibling in tide.ch1 → Unplaced (version 4)
const PLACED_ALICE = pageId('h1a'); // hollow.ch1 (version 4)

const READ_SYNC = (sb, id) => sb.from('scenes').select('updated_at, version, word_count').eq('id', id);
const READ_DEEP = (sb, id) => sb.from('scenes').select('content').eq('id', id);
const READ_CONFLICT = (sb, id) => sb.from('scenes').select('content, word_count, updated_at, version').eq('id', id);
const READ_VERIFY = (sb, id) => sb.from('scenes').select('word_count, version').eq('id', id);
const READ_SHAPES = { READ_SYNC, READ_DEEP, READ_CONFLICT, READ_VERIFY };
const SAVE = (sb, id, content, words, version) =>
  sb.rpc('save_scene_checked', { p_scene_id: id, p_content: content, p_word_count: words, p_expected_version: version });
const KEEP_LOCAL = (sb, id, content, words) => SAVE(sb, id, content, words, null);

let exportModule; // the REAL export module (loader + PDF)
async function EXPORT_LOAD(sb, pid) {
  const { chapters, scenesPerChapter } = await exportModule.loadManuscriptForExport(sb, pid);
  return chapters.flatMap((c) => (scenesPerChapter[c.id] ?? []).map((s) => s.id));
}

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;

let legacy; // seeded Rune 1.x database, read-only source for every test
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  exportModule = await bundleForTest('src/lib/export/projectExport.ts', {
    name: 'r2_projectExport', aliases: { jspdf: path.join(HARNESS_DIR, 'mocks/jspdf.js') },
  });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

// ── schema shape ──────────────────────────────────────────────────────────────

test('no manuscript Pages and no canonical behavior anywhere in the Rune 2.0 schema', async () => {
  const db = await seededDb();
  assert.equal((await one(db, `select to_regclass('public.pages') as t`)).t, null);
  const cols = (await db.query(`select table_name || '.' || column_name as c from information_schema.columns
    where table_schema = 'public' and (column_name like '%canonical%' or column_name = 'page_id')`)).rows;
  assert.deepEqual(cols, []);
  const fns = (await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace
    and (proname like '%page%' or proname like '%canonical%')`)).rows;
  assert.deepEqual(fns, []);
  const defs = (await db.query(`
    select qual || ' ' || coalesce(with_check, '') as d from pg_policies where schemaname = 'public'
    union all select indexdef from pg_indexes where schemaname = 'public'
    union all select pg_get_triggerdef(oid) from pg_trigger where not tgisinternal
    union all select prosrc from pg_proc where pronamespace = 'public'::regnamespace`)).rows;
  for (const { d } of defs) assert.doesNotMatch(d ?? '', /is_canonical|public\.pages\b|\bpages\./, d);
});

test('GATE: every command on chapters and scenes resolves ownership through the Manuscript; manuscripts are read-only', async () => {
  const db = await seededDb();
  const policies = (await db.query(`
    select tablename, cmd, roles::text as roles, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies where schemaname = 'public' and tablename in ('manuscripts', 'chapters', 'scenes')`)).rows;
  // 019 / 020: Scenes and Chapters are created only through the checked RPCs —
  // no INSERT policy and no INSERT privilege for clients.
  // 037: nor deleted — permanent deletion only through the Trash functions
  // (and delete_chapter, SECURITY DEFINER). No DELETE policy or privilege.
  const COMMANDS = { chapters: ['SELECT', 'UPDATE'], scenes: ['SELECT', 'UPDATE'] };
  for (const t of ['chapters', 'scenes']) {
    for (const cmd of ['INSERT', 'DELETE']) {
      assert.deepEqual(policies.filter((x) => x.tablename === t && x.cmd === cmd), [], `${t}: no ${cmd} policy`);
      const priv = await one(db, `select has_table_privilege('authenticated', 'public.${t}', '${cmd}') as auth,
        has_table_privilege('anon', 'public.${t}', '${cmd}') as anon`);
      assert.deepEqual(priv, { auth: false, anon: false }, `${t}: no ${cmd} privilege for clients`);
    }
  }
  for (const t of ['chapters', 'scenes']) {
    for (const cmd of COMMANDS[t]) {
      const p = policies.filter((x) => x.tablename === t && x.cmd === cmd);
      assert.equal(p.length, 1, `${t} ${cmd}`);
      assert.match(p[0].expr, /manuscripts m[\s\S]*projects p[\s\S]*m\.id = \w+\.manuscript_id[\s\S]*p\.user_id = \( SELECT auth\.uid\(\)/, `${t} ${cmd}`);
      assert.doesNotMatch(p[0].expr, /chapter_id/, `${t} ${cmd}: a Scene's Chapter never decides ownership`);
      assert.equal(p[0].roles, '{authenticated}');
    }
    const upd = policies.find((x) => x.tablename === t && x.cmd === 'UPDATE');
    assert.match(upd.expr, /manuscript_id[\s\S]*manuscript_id/, `${t} UPDATE checks old and new rows`);
  }
  assert.deepEqual(policies.filter((x) => x.tablename === 'manuscripts').map((x) => x.cmd), ['SELECT']);
});

// ── manuscripts ───────────────────────────────────────────────────────────────

test('creating a Project creates exactly one Manuscript, readable only by its owner; writers cannot create, change or delete Manuscripts', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  const direct = await alice.from('projects').insert({ user_id: ALICE, title: 'fresh' }).select('id').single();
  assert.equal(direct.error?.code, '42501', 'no client INSERT on projects (migration 021)');
  const rpc = await alice.rpc('create_project_checked', { p_title: 'fresh', p_description: null, p_cover_color: null,
    p_first_scene_content: null, p_first_scene_word_count: 0, p_request_id: null });
  assert.equal(rpc.data.status, 'ok');
  const created = { data: { id: rpc.data.project.id } };
  const mine = await alice.from('manuscripts').select('id, project_id').eq('project_id', created.data.id);
  assert.equal(mine.data.length, 1);
  assert.deepEqual((await as(db, BRAM).from('manuscripts').select('id').eq('project_id', created.data.id)).data, []);
  assert.deepEqual((await as(db, null).from('manuscripts').select('id')).data ?? [], []);

  const insert = await alice.from('manuscripts').insert({ project_id: created.data.id });
  assert.equal(insert.error?.code, '42501', 'no INSERT policy');
  const other = await alice.from('manuscripts').insert({ project_id: projectId('ash') });
  assert.ok(other.error, 'a second Manuscript for a Project is impossible');
  assert.deepEqual((await alice.from('manuscripts').update({ project_id: projectId('ash') }).eq('id', mine.data[0].id).select('id')).data, []);
  assert.deepEqual((await alice.from('manuscripts').delete().eq('id', mine.data[0].id).select('id')).data, []);
  assert.equal((await one(db, `select count(*)::int as n from public.manuscripts where project_id = $1`, [created.data.id])).n, 1);
  const r = await one(db, `select count(*)::int as n from public.projects p
    where not exists (select 1 from public.manuscripts m where m.project_id = p.id)`);
  assert.equal(r.n, 0, 'every Project has its Manuscript');
});

test('deleting a Project deletes its Manuscript, Chapters, Scenes (placed and Unplaced) and their writing history', async () => {
  const db = await seededDb();
  const m = await manuscriptOf(db, projectId('hollow'));
  const del = await as(db, ALICE).from('projects').delete().eq('id', projectId('hollow')).select('id');
  assert.equal(del.data.length, 1);
  const counts = await one(db, `select
      (select count(*)::int from public.manuscripts where id = $1) as manuscripts,
      (select count(*)::int from public.chapters where manuscript_id = $1) as chapters,
      (select count(*)::int from public.scenes where manuscript_id = $1) as scenes,
      (select count(*)::int from public.writing_sessions where project_id = $2) as sessions`, [m, projectId('hollow')]);
  assert.deepEqual(counts, { manuscripts: 0, chapters: 0, scenes: 0, sessions: 0 });
  assert.equal((await one(db, `select count(*)::int as n from public.scenes where manuscript_id = $1`, [await manuscriptOf(db, projectId('ash'))])).n, 4, 'other projects untouched');
});

// ── reads (formerly FUTURE) ───────────────────────────────────────────────────

test('the owner reaches placed and Unplaced Scenes through every read shape', async () => {
  const db = await seededDb();
  assert.equal((await one(db, `select chapter_id from public.scenes where id = $1`, [UNPLACED_ALICE])).chapter_id, null);
  for (const id of [UNPLACED_ALICE, PLACED_ALICE]) {
    for (const [name, shape] of Object.entries(READ_SHAPES)) {
      const r = await shape(as(db, ALICE), id);
      assert.equal(r.error, null, name);
      assert.equal(r.data.length, 1, `${name}: exactly one row`);
    }
  }
});

test('another user and anon cannot read, update or delete a writer\'s Scenes, placed or Unplaced', async () => {
  const db = await seededDb();
  for (const id of [UNPLACED_ALICE, PLACED_ALICE]) {
    for (const [who, sb] of [['bram', as(db, BRAM)], ['anon', as(db, null)]]) {
      for (const [name, shape] of Object.entries(READ_SHAPES)) {
        const r = await shape(sb, id);
        assert.ok(r.error !== null || r.data.length === 0, `${who} ${name}`);
      }
      const upd = await sb.from('scenes').update({ title: 'x' }).eq('id', id).select('id');
      assert.ok(upd.error !== null || upd.data.length === 0, `${who} update`);
      const del = await sb.from('scenes').delete().eq('id', id).select('id');
      assert.ok(del.error !== null || del.data.length === 0, `${who} delete`);
    }
  }
  const r = await one(db, `select count(*)::int as n from public.scenes where id = any($1::uuid[]) and title <> 'x'`, [[UNPLACED_ALICE, PLACED_ALICE]]);
  assert.equal(r.n, 2);
});

// ── the save RPC (formerly FUTURE) ────────────────────────────────────────────

test('a queued write to an Unplaced Scene replays by the same ID; Keep Local works; others get "Scene not found"; saving never re-places', async () => {
  const db = await seededDb();
  const bram = as(db, BRAM);
  const pre = await READ_SYNC(bram, UNPLACED_BRAM);
  assert.equal(pre.data.length, 1, 'pre-read finds the row by ID');
  const saved = await SAVE(bram, UNPLACED_BRAM, syntheticDoc('replay', 730), 730, pre.data[0].version);
  assert.equal(saved.data?.status, 'ok', JSON.stringify(saved));
  assert.equal(saved.data.version, pre.data[0].version + 1);
  assert.deepEqual((await READ_VERIFY(bram, UNPLACED_BRAM)).data, [{ word_count: 730, version: pre.data[0].version + 1 }]);

  const keep = await KEEP_LOCAL(bram, UNPLACED_BRAM, syntheticDoc('keep', 740), 740);
  assert.equal(keep.data?.status, 'ok', JSON.stringify(keep));
  const other = await KEEP_LOCAL(as(db, ALICE), UNPLACED_BRAM, { type: 'doc' }, 1);
  assert.deepEqual(other.data, { status: 'error', error: 'Scene not found' }, 'the literal string the sync engine must match after the app task');
  const anon = await KEEP_LOCAL(as(db, null), UNPLACED_BRAM, { type: 'doc' }, 1);
  assert.ok(anon.error, 'anon is rejected');
  const row = await one(db, `select chapter_id, word_count from public.scenes where id = $1`, [UNPLACED_BRAM]);
  assert.deepEqual(row, { chapter_id: null, word_count: 740 }, 'only the owner\'s writes landed, and the Scene stays Unplaced');
});

test('save_scene_checked keeps the Rune 1.x status contract: ok / version_mismatch / error, with no new statuses', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  const stale = await SAVE(alice, PLACED_ALICE, syntheticDoc('s', 100), 100, 1);
  assert.deepEqual(stale.data, { status: 'version_mismatch' });
  const ok = await SAVE(alice, PLACED_ALICE, syntheticDoc('s', 100), 100, 4);
  assert.deepEqual(Object.keys(ok.data).sort(), ['status', 'updated_at', 'version']);
  assert.equal(ok.data.version, 5);
  const missing = await SAVE(alice, 'dddddddd-0000-4000-8000-999999999999', { type: 'doc' }, 1, null);
  assert.deepEqual(missing.data, { status: 'error', error: 'Scene not found' });
});

test('no free-word limit (037): placed and Unplaced Scenes grow and shrink freely; account_word_total still counts every Scene', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  assert.equal((await alice.rpc('account_word_total')).data, 3035, 'every Scene, placed or Unplaced');
  const grow = await SAVE(alice, UNPLACED_ALICE, syntheticDoc('grow', 381), 381, 3);
  assert.equal(grow.data.status, 'ok', 'past the old 2,000-word allowance: never blocked');
  const growPlaced = await SAVE(alice, PLACED_ALICE, syntheticDoc('grow', 121), 121, 4);
  assert.equal(growPlaced.data.status, 'ok');
  const shrink = await SAVE(alice, UNPLACED_ALICE, syntheticDoc('shrink', 300), 300, 4);
  assert.equal(shrink.data.status, 'ok');
  assert.equal((await alice.rpc('account_word_total')).data, 3035 - 380 + 300 + 1, 'a metric: every Scene counted');
  const bram = await SAVE(as(db, BRAM), UNPLACED_BRAM, syntheticDoc('grow', 5000), 5000, 4);
  assert.equal(bram.data.status, 'ok', 'legacy_15k: 2740 - 720 + 5000 = 7020 is under 15,000');
});

test('account_word_total substitutes a candidate Scene or adds a new one; anon cannot call it', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  assert.equal((await alice.rpc('account_word_total', { p_candidate_scene_id: UNPLACED_ALICE, p_candidate_word_count: 0 })).data, 3035 - 380);
  assert.equal((await alice.rpc('account_word_total', { p_candidate_scene_id: null, p_candidate_word_count: 15 })).data, 3035 + 15);
  assert.equal((await alice.rpc('account_word_total', { p_candidate_scene_id: UNPLACED_BRAM, p_candidate_word_count: 9999 })).data, 3035,
    'another writer\'s Scene is never counted');
  assert.ok((await as(db, null).rpc('account_word_total')).error);
});

// ── cross-manuscript safety (formerly FUTURE, extended) ───────────────────────

test('cross-tenant injection: nobody can put a Scene into another writer\'s Manuscript or Chapter', async () => {
  const db = await seededDb();
  const hollow = await manuscriptOf(db, projectId('hollow'));
  const tide = await manuscriptOf(db, projectId('tide'));
  const bram = as(db, BRAM);
  const attempts = {
    'Unplaced into alice\'s Manuscript': { manuscript_id: hollow, chapter_id: null },
    'into alice\'s Chapter, Manuscript derived': { chapter_id: chapterId('hollow.ch3') },
    'into alice\'s Chapter, own Manuscript claimed': { manuscript_id: tide, chapter_id: chapterId('hollow.ch3') },
    'into own Chapter, alice\'s Manuscript claimed': { manuscript_id: hollow, chapter_id: chapterId('tide.ch3') },
  };
  for (const [name, row] of Object.entries(attempts)) {
    const r = await bram.from('scenes').insert({ ...row, title: 'injected', position: 9 });
    assert.ok(r.error, `${name}: rejected`);
  }
  const moved = await bram.from('scenes').update({ chapter_id: chapterId('hollow.ch1') }).eq('id', UNPLACED_BRAM).select('id');
  assert.ok(moved.error, 'bram cannot place his Scene in alice\'s Chapter');
  const n = await one(db, `select count(*)::int as n from public.scenes where title = 'injected' or (id = $1 and chapter_id is not null)`, [UNPLACED_BRAM]);
  assert.equal(n.n, 0);
  assert.ok((await bram.from('chapters').insert({ manuscript_id: hollow, title: 'x', position: 9 })).error, 'nor a Chapter into alice\'s Manuscript');
});

test('a Scene can only be placed in a Chapter of its own Manuscript — even the writer\'s own other project is refused', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  const hollow = await manuscriptOf(db, projectId('hollow'));
  const r1 = await alice.from('scenes').insert({ manuscript_id: hollow, chapter_id: chapterId('ash.ch1'), title: 'x', position: 9 });
  assert.equal(r1.error?.code, '42501', 'clients cannot insert Scenes at all (019)');
  await assert.rejects(
    db.query(`insert into public.scenes (manuscript_id, chapter_id, title, position) values ($1, $2, 'x', 9)`, [hollow, chapterId('ash.ch1')]),
    (e) => e.code === '23503', 'composite foreign key (chapter_id, manuscript_id) — even for the table owner the creation RPCs run as');
  const r2 = await alice.from('scenes').update({ chapter_id: chapterId('ash.ch2') }).eq('id', PLACED_ALICE).select('id');
  assert.equal(r2.error?.code, '23503');
  const place = await alice.from('scenes').update({ chapter_id: chapterId('hollow.ch1'), position: 1 }).eq('id', UNPLACED_ALICE).select('id, version');
  assert.deepEqual(place.data, [{ id: UNPLACED_ALICE, version: 4 }], 'placing an Unplaced Scene in its own Manuscript works and keeps its ID');
  const unplace = await alice.from('scenes').update({ chapter_id: null }).eq('id', UNPLACED_ALICE).select('id');
  assert.equal(unplace.data.length, 1, 'and it can be Unplaced again');
});

test('a Scene or Chapter never moves to another Manuscript', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  const ash = await manuscriptOf(db, projectId('ash'));
  const s = await alice.from('scenes').update({ manuscript_id: ash }).eq('id', UNPLACED_ALICE).select('id');
  assert.equal(s.error?.code, '23514');
  const c = await alice.from('chapters').update({ manuscript_id: ash }).eq('id', chapterId('hollow.ch5')).select('id');
  assert.equal(c.error?.code, '23514');
  await assert.rejects(db.query(`update public.scenes set manuscript_id = $1 where id = $2`, [ash, UNPLACED_ALICE]), /cannot move to another Manuscript/,
    'not even the service role / migration owner');
});

test('a placed Scene inserted with only chapter_id belongs to its Chapter\'s Manuscript', async () => {
  // 019: only the creation RPCs (as the table owner) insert Scenes; the
  // trigger and NOT NULL still hold for them.
  const db = await seededDb();
  const r = await one(db, `insert into public.scenes (chapter_id, title, position) values ($1, 'Scene 1', 0) returning manuscript_id`, [chapterId('hollow.ch5')]);
  assert.equal(r.manuscript_id, await manuscriptOf(db, projectId('hollow')));
  await assert.rejects(db.query(`insert into public.scenes (title, position) values ('nowhere', 0)`), (e) => e.code === '23502',
    'a Scene with neither Manuscript nor Chapter is refused');
  const direct = await as(db, ALICE).from('scenes').insert({ chapter_id: chapterId('hollow.ch5'), title: 'Scene 1', position: 1 });
  assert.equal(direct.error?.code, '42501', 'and a client cannot insert one directly');
});

// ── insert and duplicate RPCs ─────────────────────────────────────────────────

test('insert_scene_checked: a placed Scene in the Chapter\'s Manuscript; blocked over the limit; another writer\'s Chapter is refused', async () => {
  const db = await seededDb();
  const bram = as(db, BRAM);
  const ok = await bram.rpc('insert_scene_checked', { p_chapter_id: chapterId('tide.ch3'), p_title: 'Scene 3', p_content: null, p_word_count: 0, p_position: 2 });
  assert.equal(ok.data?.status, 'ok', JSON.stringify(ok));
  const row = await one(db, `select manuscript_id, chapter_id, version from public.scenes where id = $1`, [ok.data.id]);
  assert.deepEqual(row, { manuscript_id: await manuscriptOf(db, projectId('tide')), chapter_id: chapterId('tide.ch3'), version: 1 });

  const withWords = await as(db, ALICE).rpc('insert_scene_checked', { p_chapter_id: chapterId('hollow.ch5'), p_title: 'x', p_content: syntheticDoc('x', 5), p_word_count: 5, p_position: 0 });
  assert.equal(withWords.data?.status, 'ok', 'no free-word limit (037): alice, far past the old allowance, is never blocked');
  const empty = await as(db, ALICE).rpc('insert_scene_checked', { p_chapter_id: chapterId('hollow.ch5'), p_title: 'x', p_content: null, p_word_count: 0, p_position: 0 });
  assert.equal(empty.data?.status, 'ok');
  assert.deepEqual((await db.query(`select position from public.scenes where chapter_id = $1 order by position`, [chapterId('hollow.ch5')])).rows.map((r) => r.position),
    [0, 1], 'appended, never tied');

  const foreign = await bram.rpc('insert_scene_checked', { p_chapter_id: chapterId('hollow.ch5'), p_title: 'x', p_content: null, p_word_count: 0, p_position: 1 });
  assert.deepEqual(foreign.data, { status: 'error', error: 'Chapter not found' }, 'another writer\'s Chapter (018: refused before any write)');
  assert.ok((await as(db, null).rpc('insert_scene_checked', { p_chapter_id: chapterId('tide.ch3'), p_title: 'x', p_content: null, p_word_count: 0, p_position: 1 })).error);
});

test('duplicate_project_checked copies Chapters and placed + Unplaced Scenes into the new Manuscript; the stored total is the ordered (placed) total', async () => {
  const db = await seededDb();
  const r = await as(db, BRAM).rpc('duplicate_project_checked', { p_project_id: projectId('tide') });
  assert.equal(r.data?.status, 'ok', JSON.stringify(r));
  const copy = r.data.project;
  assert.equal(copy.title, 'fixture-project-tide — Draft 2');
  assert.equal(copy.word_count, 650 + 0 + 330 + 340, 'placed Scenes only (t1b, t2a, t3a, t3b)');
  const m = await manuscriptOf(db, copy.id);
  const scenes = (await db.query(`
    select c.position as chapter_position, s.chapter_id is null as unplaced, s.position, s.word_count, s.version
    from public.scenes s left join public.chapters c on c.id = s.chapter_id
    where s.manuscript_id = $1 order by unplaced, chapter_position, s.position`, [m])).rows;
  assert.deepEqual(scenes.map((s) => [s.unplaced, s.chapter_position, s.position, s.word_count]), [
    [false, 1, 1, 650], [false, 2, 0, 0], [false, 3, 0, 330], [false, 3, 1, 340],
    [true, null, 0, 700], [true, null, 1, 720],
  ]);
  assert.ok(scenes.every((s) => s.version === 1), 'copies are new Scenes');
  assert.equal((await as(db, BRAM).rpc('account_word_total')).data, 2740 * 2, 'the limit counts every copied Scene');
});

test('duplicate_project_checked is never blocked by a word limit (037), and only for the owner', async () => {
  const db = await seededDb();
  const r = await as(db, ALICE).rpc('duplicate_project_checked', { p_project_id: projectId('ash') });
  assert.equal(r.data?.status, 'ok', 'alice is past the old allowance: copied anyway');
  const m = await manuscriptOf(db, r.data.project.id);
  assert.equal((await one(db, `select count(*)::int as n from public.scenes where manuscript_id = $1`, [m])).n, 4, 'placed and Unplaced Scenes copied');
  const other = await as(db, BRAM).rpc('duplicate_project_checked', { p_project_id: projectId('ash') });
  assert.deepEqual(other.data, { status: 'error', error: 'Project not found' });
});

// ── triggers, history, deletion ───────────────────────────────────────────────

test('a Scene update bumps its version and updated_at, and its Project\'s updated_at (through the Manuscript)', async () => {
  const db = await seededDb();
  const before = await one(db, `select updated_at::text as t from public.projects where id = $1`, [projectId('hollow')]);
  const r = await as(db, ALICE).from('scenes').update({ title: 'renamed' }).eq('id', UNPLACED_ALICE).select('version, updated_at');
  assert.equal(r.data[0].version, 4);
  const after = await one(db, `select updated_at::text as t from public.projects where id = $1`, [projectId('hollow')]);
  assert.notEqual(after.t, before.t);
  const untouched = await one(db, `select updated_at::text as t from public.projects where id = $1`, [projectId('ash')]);
  assert.equal(untouched.t, '2026-08-03 12:30:00.25+00');
});

test('writing history attaches to Scenes: one row per writer, Scene and day; deleting a Scene keeps its history as Project-level history (migration 022)', async () => {
  const db = await seededDb();
  const bram = as(db, BRAM);
  const dup = await bram.from('writing_sessions').insert({ user_id: BRAM, project_id: projectId('tide'), scene_id: UNPLACED_BRAM, session_date: '2026-08-05', words_added: 1 });
  assert.equal(dup.error?.code, '23505', 'writing_sessions_scene_unique');
  const next = await bram.from('writing_sessions').insert({ user_id: BRAM, project_id: projectId('tide'), scene_id: UNPLACED_BRAM, session_date: '2026-08-07', words_added: 12 });
  assert.equal(next.error, null, 'writing in an Unplaced Scene is recorded like any other');
  const projectDay = await bram.from('writing_sessions').insert({ user_id: BRAM, project_id: projectId('tide'), session_date: '2026-08-04', words_added: 1 });
  assert.equal(projectDay.error?.code, '23505', 'writing_sessions_project_unique');

  const before = (await db.query(`select session_date::text as d, sum(words_added)::int as n from public.writing_sessions where user_id = $1 group by 1 order by 1`, [BRAM])).rows;
  // 037: a Scene is deleted only from Trash.
  assert.equal((await bram.from('scenes').delete().eq('id', UNPLACED_BRAM).select('id')).error?.code, '42501', 'no direct delete');
  assert.equal((await bram.rpc('trash_workspace_object', { p_type: 'scene', p_id: UNPLACED_BRAM })).data.status, 'ok');
  assert.equal((await bram.rpc('delete_trashed_workspace_object', { p_type: 'scene', p_id: UNPLACED_BRAM })).data.status, 'ok');
  const left = (await db.query(`select session_date::text as d, project_id, scene_id, words_added from public.writing_sessions where user_id = $1 order by session_date, scene_id`, [BRAM])).rows;
  assert.deepEqual(left.filter((r) => r.scene_id === null).map((r) => [r.d, r.project_id]),
    left.filter((r) => r.scene_id === null).map((r) => [r.d, projectId('tide')]), 'detached rows keep their Project');
  assert.ok(!left.some((r) => r.scene_id === UNPLACED_BRAM), 'nothing references the deleted Scene');
  const after = (await db.query(`select session_date::text as d, sum(words_added)::int as n from public.writing_sessions where user_id = $1 group by 1 order by 1`, [BRAM])).rows;
  assert.deepEqual(after, before, 'every day keeps its words');
});

test('a Chapter that still holds a Scene cannot be deleted (FK NO ACTION, migration 021) — and clients cannot delete Chapters at all (037)', async () => {
  const db = await seededDb();
  const before = (await db.query(`select * from public.scenes order by id`)).rows;
  const client = await as(db, ALICE).from('chapters').delete().eq('id', chapterId('hollow.ch5')).select('id');
  assert.equal(client.error?.code, '42501', 'no client DELETE: Trash or delete_chapter only');
  await assert.rejects(db.query(`delete from public.chapters where id = $1`, [chapterId('hollow.ch3')]), (e) => e.code === '23503',
    'refused even for the table owner: h3a is still placed in it');
  assert.deepEqual((await db.query(`select * from public.scenes order by id`)).rows, before, 'no Scene touched');
  assert.equal((await one(db, `select count(*)::int as n from public.chapters where id = $1`, [chapterId('hollow.ch3')])).n, 1);
  const empty = await db.query(`delete from public.chapters where id = $1`, [chapterId('hollow.ch5')]);
  assert.equal(empty.affectedRows, 1, 'an empty Chapter can be removed (delete_chapter / Trash run as the owner)');
});

// ── export (formerly FUTURE) ──────────────────────────────────────────────────

test('the REAL export loader returns placed Scenes only, in manuscript order, and nothing to other writers', async () => {
  const db = await seededDb();
  const ids = await EXPORT_LOAD(as(db, ALICE), projectId('hollow'));
  assert.deepEqual(ids, ['h1a', 'h2a', 'h3a', 'h4a', 'h4b', 'h4c', 'h6c'].map(pageId), 'chapters by position (ch5 empty, before ch4), Scenes by position');
  assert.ok(!ids.includes(UNPLACED_ALICE));
  assert.deepEqual(await EXPORT_LOAD(as(db, BRAM), projectId('hollow')), []);
  assert.deepEqual(await EXPORT_LOAD(as(db, null), projectId('hollow')), []);
});

// ── the REAL application modules ──────────────────────────────────────────────
// The autosave server action (actions/scenes.ts), its post-sync maintenance,
// the offline sync engine (offline/syncEngine.ts + db.ts over fake IndexedDB)
// and the writing-credit flush (actions/writingStats.ts), bundled from src/
// with only the framework and network boundaries mocked, against the Rune 2.0
// schema. (The export loader runs above.)

const BROWSER = path.join(HARNESS_DIR, 'mocks/supabaseBrowser.js');
let scenesAction;
let engine;
let offline; // offline/db.ts — its own bundle, same fake IndexedDB database as the engine's
before(async () => {
  scenesAction = await bundleForTest('src/lib/actions/scenes.ts', { name: 'r2_actions_scenes' });
  engine = await bundleForTest('src/lib/offline/syncEngine.ts', { name: 'r2_syncEngine', aliases: { '@/lib/supabase/client': BROWSER } });
  offline = await bundleForTest('src/lib/offline/db.ts', { name: 'r2_offline_db' });
});

/** Signs the browser and the server actions in as `userId` (null = signed out). */
function signIn(db, userId) {
  const sb = as(db, userId);
  globalThis.__runeBrowserClient = sb;
  engine.setServerClient(sb);
  scenesAction.setServerClient(sb);
  return sb;
}

async function queue(id, userId, words, label = 'queued') {
  await engine.writeToPendingQueue(id, userId, syntheticDoc(label, words), words);
}
async function pendingRow(id) {
  return (await (await offline.getOfflineDB()).get('pending_writes', id)) ?? null;
}

test('REAL autosave action: replays to an Unplaced Scene by ID; version_mismatch, word_limit_blocked and "Scene not found" keep their contract', async () => {
  const db = await seededDb();
  const save = (userId, id, words, version) => {
    scenesAction.setServerClient(as(db, userId));
    return scenesAction.syncSceneWithLimitCheck(id, syntheticDoc('autosave', words), words, version, 'offline_sync');
  };
  const ok = await save(BRAM, UNPLACED_BRAM, 730, 4);
  assert.equal(ok.status, 'ok', JSON.stringify(ok));
  assert.equal(ok.version, 5);
  assert.deepEqual(await one(db, `select chapter_id, word_count from public.scenes where id = $1`, [UNPLACED_BRAM]), { chapter_id: null, word_count: 730 });
  assert.deepEqual(await save(BRAM, UNPLACED_BRAM, 731, 4), { status: 'version_mismatch' });
  // 037: no free-word limit — alice, far past the old allowance, saves growth.
  const grown = await save(ALICE, PLACED_ALICE, 121, 4);
  assert.equal(grown.status, 'ok', JSON.stringify(grown));
  // The action still passes 'word_limit_blocked' through (the offline queue keeps
  // the prose): a database from before 037 can still answer it.
  await db.exec(`create or replace function public.free_word_limit_for_caller() returns integer language sql stable set search_path to '' as $$ select 2000 $$`);
  assert.deepEqual(await save(ALICE, PLACED_ALICE, 122, grown.version), { status: 'word_limit_blocked' }, 'a pre-037 limit answer keeps its contract');
  assert.deepEqual(await save(ALICE, UNPLACED_BRAM, 1, null), { status: 'error', error: 'Scene not found' });
  assert.equal((await one(db, `select word_count from public.scenes where id = $1`, [UNPLACED_BRAM])).word_count, 730, 'only the owner\'s write landed');
});

test('REAL save + afterSceneSync: the save itself stores the ordered (placed-only) total; afterSceneSync only touches a placed Scene\'s Chapter', async () => {
  const db = await seededDb();
  scenesAction.setServerClient(as(db, ALICE));
  const chapterAt = async (label) => (await one(db, `select updated_at::text as t from public.chapters where id = $1`, [chapterId(label)])).t;
  const stored = async () => (await one(db, `select word_count from public.projects where id = $1`, [projectId('ash')])).word_count;
  const versionOf = async (label) => (await one(db, `select version from public.scenes where id = $1`, [pageId(label)])).version;
  const before = { ch1: await chapterAt('ash.ch1'), ch2: await chapterAt('ash.ch2') };

  await scenesAction.afterSceneSync(pageId('a1a')); // Unplaced, 500 words
  assert.equal(await stored(), 999, 'afterSceneSync never writes the total (the fixture\'s stale 999 is untouched)');
  assert.equal(await chapterAt('ash.ch1'), before.ch1, 'an Unplaced Scene touches no Chapter');

  // alice is over her limit, so these saves shrink Scenes (never blocked).
  const saved = await scenesAction.syncSceneWithLimitCheck(pageId('a2a'), syntheticDoc('a2a', 50), 50, await versionOf('a2a'));
  assert.equal(saved.status, 'ok');
  assert.equal(await stored(), 90, 'the save recomputed it in its own transaction: a1b 0 + a2a 50 + a2b 40; the Unplaced 500 excluded');
  const unplacedSave = await scenesAction.syncSceneWithLimitCheck(pageId('a1a'), syntheticDoc('a1a', 400), 400, await versionOf('a1a'));
  assert.equal(unplacedSave.status, 'ok');
  assert.equal(await stored(), 90, 'an Unplaced save leaves the ordered total alone');

  await scenesAction.afterSceneSync(pageId('a2a'));
  assert.notEqual(await chapterAt('ash.ch2'), before.ch2);
  assert.equal(await stored(), 90);
});

test('REAL sync engine: a cached, queued edit syncs through save_scene_checked; Keep Local works; another writer gets not_found from "Scene not found"', async () => {
  const db = await seededDb();
  const bram = signIn(db, BRAM);

  // Editor load: the Chapter's Scenes from the real action, cached for offline use.
  const scenes = await scenesAction.getScenes(chapterId('tide.ch3'));
  assert.deepEqual(scenes.data.map((s) => s.id), [pageId('t3a'), pageId('t3b')]);
  await offline.cacheScene(scenes.data[0], projectId('tide'));

  await queue(pageId('t3a'), BRAM, 345);
  await engine.syncPendingWrite(pageId('t3a'), 'offline_sync');
  assert.equal(await pendingRow(pageId('t3a')), null, 'queue cleared');
  assert.deepEqual(await one(db, `select word_count, version from public.scenes where id = $1`, [pageId('t3a')]), { word_count: 345, version: 4 });
  assert.equal((await one(db, `select word_count from public.projects where id = $1`, [projectId('tide')])).word_count, 650 + 0 + 345 + 340,
    'afterSceneSync stored the ordered total');
  const used = bram.calls.map((c) => `${c.kind}:${c.name}`);
  assert.ok(used.includes('from:scenes') && used.includes('rpc:save_scene_checked'));
  assert.ok(!used.some((c) => /pages|page_checked/.test(c)), used.join(' '));

  // Keep Local on an Unplaced Scene (no cached baseline; bypasses conflict detection).
  await queue(UNPLACED_BRAM, BRAM, 740, 'keep');
  assert.deepEqual(await engine.forceWriteLocalContent(UNPLACED_BRAM), { status: 'ok', wordCount: 740 });
  assert.equal(await pendingRow(UNPLACED_BRAM), null);

  // Another writer: the RPC's literal not-found string is classified, and the queued prose is kept.
  // The sync engine asks the real workspace_trash_state, which answers 'missing' for a Scene
  // that is not this account's — a definitive answer, so the row retires (terminal, never
  // retried) with its prose kept instead of failing and retrying forever.
  signIn(db, ALICE);
  await queue(UNPLACED_BRAM, ALICE, 5, 'intruder');
  const denied = await engine.forceWriteLocalContent(UNPLACED_BRAM);
  assert.deepEqual(denied, { status: 'error', category: 'not_found', message: 'Scene not found' });
  await engine.syncPendingWrite(UNPLACED_BRAM, 'offline_sync');
  const kept = await pendingRow(UNPLACED_BRAM);
  assert.equal(kept?.syncStatus, 'retired', 'an invisible Scene retires the write, durably');
  assert.match(kept.retiredReason, /permanently deleted or is not this account/);
  assert.equal(kept.wordCount, 5, 'the queued prose is preserved');
  assert.equal((await one(db, `select word_count from public.scenes where id = $1`, [UNPLACED_BRAM])).word_count, 740);
  assert.deepEqual(await engine.flushPendingQueue(), { synced: 0, failed: 0, conflicts: 0 }, 'a retired row is not retried');
  assert.equal((await pendingRow(UNPLACED_BRAM))?.syncStatus, 'retired');
  await (await offline.getOfflineDB()).delete('pending_writes', UNPLACED_BRAM);
});

test('REAL offline writing credits land on writing_sessions.scene_id, for placed and Unplaced Scenes alike', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  await offline.storeOfflineWritingCredit(projectId('tide'), UNPLACED_BRAM, 12);
  await offline.storeOfflineWritingCredit(projectId('tide'), UNPLACED_BRAM, 3);
  await offline.storeOfflineWritingCredit(projectId('tide'), pageId('t3b'), 7);
  await engine.flushOfflineWritingCredits();
  const rows = (await db.query(`select scene_id, project_id, words_added from public.writing_sessions
    where user_id = $1 and session_date > '2026-09-01' order by words_added`, [BRAM])).rows; // after every fixture row
  assert.deepEqual(rows, [
    { scene_id: pageId('t3b'), project_id: projectId('tide'), words_added: 7 },
    { scene_id: UNPLACED_BRAM, project_id: projectId('tide'), words_added: 15 },
  ]);
  assert.deepEqual(await (await offline.getOfflineDB()).getAll('pending_writing_credits'), [], 'credits applied once');
});
