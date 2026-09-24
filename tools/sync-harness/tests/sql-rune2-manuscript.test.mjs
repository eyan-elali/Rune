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
// `pages.manuscript_id`), now executable against `scenes`. The query shapes
// below are the Scene equivalents of the app's current `pages` shapes: they
// are what the application task must send. The REAL app modules still target
// the legacy schema; running them here is deferred (last test).
//
// Shapes (Scene equivalents of the app's current shapes):
//   READ_SYNC / READ_DEEP / READ_CONFLICT / READ_VERIFY  syncEngine.ts, SyncConflictModal.tsx
//   KEEP_LOCAL   save_scene_checked(p_expected_version: null)
//   AUTOSAVE     save_scene_checked(p_expected_version: n)   (actions/pages.ts syncPageWithLimitCheck)
//   EXPORT_LOAD  Manuscript by Project → Chapters by Manuscript → Scenes .in(chapter_id)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
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

async function EXPORT_LOAD(sb, pid) {
  const { data: manuscript } = await sb.from('manuscripts').select('id').eq('project_id', pid).maybeSingle();
  if (!manuscript) return [];
  const { data: chapters } = await sb.from('chapters').select('*').eq('manuscript_id', manuscript.id).order('position', { ascending: true });
  if (!chapters?.length) return [];
  const { data: scenes } = await sb.from('scenes').select('*').in('chapter_id', chapters.map((c) => c.id)).order('position', { ascending: true });
  return (scenes ?? []).map((s) => s.id);
}

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;

let legacy; // seeded Rune 1.x database, read-only source for every test
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
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
  for (const t of ['chapters', 'scenes']) {
    for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
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
  const created = await alice.from('projects').insert({ user_id: ALICE, title: 'fresh' }).select('id').single();
  assert.equal(created.error, null);
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

test('Unplaced Scenes still count toward the free limit — no bypass; shrinking is never blocked', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  assert.equal((await alice.rpc('account_word_total')).data, 3035, 'every Scene, placed or Unplaced');
  const grow = await SAVE(alice, UNPLACED_ALICE, syntheticDoc('grow', 381), 381, 3);
  assert.deepEqual(grow.data, { status: 'word_limit_blocked', limit: 2000 });
  const growPlaced = await SAVE(alice, PLACED_ALICE, syntheticDoc('grow', 121), 121, 4);
  assert.equal(growPlaced.data.status, 'word_limit_blocked');
  const shrink = await SAVE(alice, UNPLACED_ALICE, syntheticDoc('shrink', 300), 300, 3);
  assert.equal(shrink.data.status, 'ok');
  assert.equal((await alice.rpc('account_word_total')).data, 2955);
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
  assert.equal(r1.error?.code, '23503', 'composite foreign key (chapter_id, manuscript_id)');
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
  const db = await seededDb();
  const r = await as(db, ALICE).from('scenes').insert({ chapter_id: chapterId('hollow.ch5'), title: 'Scene 1', position: 0 }).select('manuscript_id').single();
  assert.equal(r.error, null);
  assert.equal(r.data.manuscript_id, await manuscriptOf(db, projectId('hollow')));
  const orphan = await as(db, ALICE).from('scenes').insert({ title: 'nowhere', position: 0 });
  assert.ok(orphan.error, 'a Scene with neither Manuscript nor Chapter is refused');
});

// ── insert and duplicate RPCs ─────────────────────────────────────────────────

test('insert_scene_checked: a placed Scene in the Chapter\'s Manuscript; blocked over the limit; another writer\'s Chapter is refused', async () => {
  const db = await seededDb();
  const bram = as(db, BRAM);
  const ok = await bram.rpc('insert_scene_checked', { p_chapter_id: chapterId('tide.ch3'), p_title: 'Scene 3', p_content: null, p_word_count: 0, p_position: 2 });
  assert.equal(ok.data?.status, 'ok', JSON.stringify(ok));
  const row = await one(db, `select manuscript_id, chapter_id, version from public.scenes where id = $1`, [ok.data.id]);
  assert.deepEqual(row, { manuscript_id: await manuscriptOf(db, projectId('tide')), chapter_id: chapterId('tide.ch3'), version: 1 });

  const blocked = await as(db, ALICE).rpc('insert_scene_checked', { p_chapter_id: chapterId('hollow.ch5'), p_title: 'x', p_content: syntheticDoc('x', 5), p_word_count: 5, p_position: 0 });
  assert.deepEqual(blocked.data, { status: 'word_limit_blocked', limit: 2000 });
  const empty = await as(db, ALICE).rpc('insert_scene_checked', { p_chapter_id: chapterId('hollow.ch5'), p_title: 'x', p_content: null, p_word_count: 0, p_position: 0 });
  assert.equal(empty.data?.status, 'ok', 'an empty Scene is never blocked');

  const foreign = await bram.rpc('insert_scene_checked', { p_chapter_id: chapterId('hollow.ch5'), p_title: 'x', p_content: null, p_word_count: 0, p_position: 1 });
  assert.equal(foreign.error?.code, '42501', 'another writer\'s Chapter');
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
    [true, null, 0, 700], [true, null, 2, 720],
  ]);
  assert.ok(scenes.every((s) => s.version === 1), 'copies are new Scenes');
  assert.equal((await as(db, BRAM).rpc('account_word_total')).data, 2740 * 2, 'the limit counts every copied Scene');
});

test('duplicate_project_checked counts Unplaced Scenes against the limit', async () => {
  const db = await seededDb();
  const r = await as(db, ALICE).rpc('duplicate_project_checked', { p_project_id: projectId('ash') });
  assert.deepEqual(r.data, { status: 'word_limit_blocked', limit: 2000 });
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

test('writing history attaches to Scenes: one row per writer, Scene and day; deleting a Scene deletes its history, as in Rune 1.x', async () => {
  const db = await seededDb();
  const bram = as(db, BRAM);
  const dup = await bram.from('writing_sessions').insert({ user_id: BRAM, project_id: projectId('tide'), scene_id: UNPLACED_BRAM, session_date: '2026-08-05', words_added: 1 });
  assert.equal(dup.error?.code, '23505', 'writing_sessions_scene_unique');
  const next = await bram.from('writing_sessions').insert({ user_id: BRAM, project_id: projectId('tide'), scene_id: UNPLACED_BRAM, session_date: '2026-08-07', words_added: 12 });
  assert.equal(next.error, null, 'writing in an Unplaced Scene is recorded like any other');
  const projectDay = await bram.from('writing_sessions').insert({ user_id: BRAM, project_id: projectId('tide'), session_date: '2026-08-04', words_added: 1 });
  assert.equal(projectDay.error?.code, '23505', 'writing_sessions_project_unique');

  await bram.from('scenes').delete().eq('id', UNPLACED_BRAM);
  const left = (await db.query(`select scene_id, words_added from public.writing_sessions where user_id = $1 order by session_date`, [BRAM])).rows;
  assert.deepEqual(left, [{ scene_id: null, words_added: 15 }, { scene_id: pageId('t1b'), words_added: 650 }, { scene_id: pageId('t3a'), words_added: 330 }]);
});

test('deleting a Chapter deletes its placed Scenes (as Rune 1.x did) but never the Manuscript\'s Unplaced Scenes', async () => {
  const db = await seededDb();
  const del = await as(db, ALICE).from('chapters').delete().eq('id', chapterId('hollow.ch3')).select('id');
  assert.equal(del.data.length, 1);
  const r = (await db.query(`select id from public.scenes where id = any($1::uuid[]) order by id`, [[pageId('h3a'), pageId('h3b'), pageId('h3c')]])).rows;
  assert.deepEqual(r.map((x) => x.id), [pageId('h3b'), pageId('h3c')], 'h3a (placed) went with the Chapter; its former siblings are Unplaced and stay');
});

// ── export (formerly FUTURE) ──────────────────────────────────────────────────

test('the Rune 2.0 export loader returns placed Scenes only, and nothing to other writers', async () => {
  const db = await seededDb();
  const ids = await EXPORT_LOAD(as(db, ALICE), projectId('hollow'));
  assert.deepEqual(ids.sort(), ['h1a', 'h2a', 'h3a', 'h4a', 'h4b', 'h4c', 'h6c'].map(pageId).sort());
  assert.ok(!ids.includes(UNPLACED_ALICE));
  assert.deepEqual(await EXPORT_LOAD(as(db, BRAM), projectId('hollow')), []);
  assert.deepEqual(await EXPORT_LOAD(as(db, null), projectId('hollow')), []);
});

// ── deferred ──────────────────────────────────────────────────────────────────

test('DEFERRED: the REAL autosave action, sync engine and export against Scenes', (t) => {
  t.skip('pending: src/lib/actions/pages.ts, syncEngine.ts and the export loader still target the legacy `pages` schema — the application task moves them to Scenes and runs them here');
});
