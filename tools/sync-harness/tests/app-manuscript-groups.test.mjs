// Manuscript Groups + final structure cleanup (Rune 2.0 Phase 1, Task 9,
// migration 022): the REAL structure / chapter / scene / project / writing
// stats actions, the export and the offline credit flush, against the Rune 2.0
// schema in real Postgres + RLS.
//
//   * Groups: recursive, no prose; create, rename, delete (empty only), move
//   * one ordering model: (manuscript, parent, position), unique across Groups
//     and Chapters; reading order is depth-first
//   * cycles and cross-Manuscript placement are refused
//   * Unplaced Scenes have unique positions per Manuscript
//   * deleting a Scene keeps its writing history (Project-level)
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema
// (lib/legacy-to-rune2.mjs). alice owns hollow: ch1(1) [h1a 120],
// ch2(2) [h2a 300], ch3(3) [h3a 410], ch5(4) [], ch4(5) [h4a 200, h4b 0,
// h4c 150], ch6(7) [h6c 270]; Unplaced [h3b, h3c, h6a, h6b]; ordered total
// 1450. alice also owns ash; bram owns tide (ch1..ch3).
import 'fake-indexeddb/auto';
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTestDb, readRepoFile, HARNESS_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, chapterTitleFor, markerFor, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const CH = (n) => chapterId(`hollow.ch${n}`);

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;
const storedTotal = async (db, pid) => (await one(db, `select word_count from public.projects where id = $1`, [pid])).word_count;

const snapshot = async (db) => ({
  groups: await all(db, `select * from public.manuscript_groups order by id`),
  chapters: await all(db, `select * from public.chapters order by id`),
  scenes: await all(db, `select * from public.scenes order by id`),
  sessions: await all(db, `select * from public.writing_sessions order by id`),
  projects: await all(db, `select * from public.projects order by id`),
});

/**
 * The Manuscript's reading order, computed here independently of the app:
 * depth-first over (parent, position). Groups as "[title", "]"; Chapters by id.
 */
async function outline(db, pid) {
  const m = await manuscriptOf(db, pid);
  const groups = await all(db, `select id, parent_group_id as parent, title, position from public.manuscript_groups where manuscript_id = $1`, [m]);
  const chapters = await all(db, `select id, group_id as parent, position from public.chapters where manuscript_id = $1`, [m]);
  const walk = (parent) => [
    ...groups.filter((g) => g.parent === parent).map((g) => ({ ...g, kind: 'group' })),
    ...chapters.filter((c) => c.parent === parent).map((c) => ({ ...c, kind: 'chapter' })),
  ].sort((a, b) => a.position - b.position).flatMap((n) => (n.kind === 'group' ? [`[${n.title}`, ...walk(n.id), ']'] : [n.id]));
  return walk(null);
}
const chapterOrder = async (db, pid) => (await outline(db, pid)).filter((x) => !x.startsWith('[') && x !== ']');

/** Sibling positions unique across Groups and Chapters, all positive; no cycle; every Chapter/Group in its own Manuscript. */
async function assertStructure(db) {
  const ties = await all(db, `
    select manuscript_id, parent, position, count(*)::int as n from (
      select manuscript_id, parent_group_id as parent, position from public.manuscript_groups
      union all select manuscript_id, group_id, position from public.chapters) s
    group by 1, 2, 3 having count(*) > 1 or min(position) < 1`);
  assert.deepEqual(ties, [], 'no two children of one parent share a position');
  const cycles = await all(db, `
    with recursive up(start, id, n) as (
      select g.id, g.parent_group_id, 1 from public.manuscript_groups g where g.parent_group_id is not null
      union all select up.start, g.parent_group_id, up.n + 1 from public.manuscript_groups g join up on g.id = up.id
       where g.parent_group_id is not null and up.n < 100)
    select distinct start from up where id = start`);
  assert.deepEqual(cycles, [], 'no Group is inside itself');
  const unplacedTies = await all(db, `select manuscript_id, position from public.scenes where chapter_id is null group by 1, 2 having count(*) > 1`);
  assert.deepEqual(unplacedTies, [], 'Unplaced positions unique per Manuscript');
}

const BROWSER = path.join(HARNESS_DIR, 'mocks/supabaseBrowser.js');
let legacy;
let structure, chapters, scenes, projects, writingStats, exporter, engine, offline, trash;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'groups_structure' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'groups_chapters' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'groups_scenes' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'groups_trash' });
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'groups_projects' });
  writingStats = await bundleForTest('src/lib/actions/writingStats.ts', { name: 'groups_writingStats' });
  exporter = await bundleForTest('src/lib/export/projectExport.ts', {
    name: 'groups_projectExport', aliases: { jspdf: path.join(HARNESS_DIR, 'mocks/jspdf.js') },
  });
  engine = await bundleForTest('src/lib/offline/syncEngine.ts', { name: 'groups_syncEngine', aliases: { '@/lib/supabase/client': BROWSER } });
  offline = await bundleForTest('src/lib/offline/db.ts', { name: 'groups_offline_db' });
});

beforeEach(async () => {
  const idb = await offline.getOfflineDB();
  for (const store of ['pending_writes', 'page_cache', 'chapter_meta', 'pending_writing_credits']) await idb.clear(store);
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = as(db, userId);
  globalThis.__runeBrowserClient = sb;
  for (const mod of [structure, chapters, scenes, projects, writingStats, exporter, engine, trash]) mod.setServerClient?.(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r; };

/**
 * Book One [ Part I [ ch1, ch2 ], ch6 ], ch5, ch4, Part II [ ch3 ] — built
 * through the real actions only.
 */
async function buildHollowStructure() {
  const book = ok(await structure.createGroup(HOLLOW, '  Book One ')).data;
  const part1 = ok(await structure.createGroup(HOLLOW, 'Part I', book.id)).data;
  ok(await structure.moveChapter(CH(1), part1.id, null, HOLLOW));
  ok(await structure.moveChapter(CH(2), part1.id, null, HOLLOW));
  ok(await structure.moveChapter(CH(6), book.id, null, HOLLOW));
  ok(await structure.moveGroup(book.id, null, 0, HOLLOW));
  const part2 = ok(await structure.createGroup(HOLLOW, 'Part II')).data;
  ok(await structure.moveChapter(CH(3), part2.id, null, HOLLOW));
  return { book, part1, part2 };
}

// ── 1. nested Groups, Chapter placement ────────────────────────────────────────

test('nested Groups: Chapters move into and out of Groups; ids, Scenes, history and totals are untouched; the app reads in the new order', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const before = await snapshot(db);

  const book = ok(await structure.createGroup(HOLLOW, '  Book One ')).data;
  assert.deepEqual([book.title, book.parent_group_id, book.position], ['Book One', null, 8], 'appended after ch6 (position 7)');
  const part1 = ok(await structure.createGroup(HOLLOW, 'Part I', book.id)).data;
  assert.deepEqual([part1.parent_group_id, part1.position], [book.id, 1]);
  ok(await structure.moveChapter(CH(1), part1.id, null, HOLLOW));
  ok(await structure.moveChapter(CH(2), part1.id, null, HOLLOW));
  ok(await structure.moveChapter(CH(6), book.id, null, HOLLOW));
  ok(await structure.moveGroup(book.id, null, 0, HOLLOW));
  const part2 = ok(await structure.createGroup(HOLLOW, 'Part II')).data;
  ok(await structure.moveChapter(CH(3), part2.id, null, HOLLOW));

  assert.deepEqual(await outline(db, HOLLOW), ['[Book One', '[Part I', CH(1), CH(2), ']', CH(6), ']', CH(5), CH(4), '[Part II', CH(3), ']']);
  const inPart1 = await all(db, `select id, position from public.chapters where group_id = $1 order by position`, [part1.id]);
  assert.deepEqual(inPart1, [{ id: CH(1), position: 1 }, { id: CH(2), position: 2 }]);
  assert.equal(part2.position, 5, 'after book(1), ch5(3), ch4(4) — the gap ch3 left at 2 is harmless');

  // The app's own reads follow the structure.
  const listed = ok(await chapters.getChapters(HOLLOW)).data.map((c) => c.id);
  assert.deepEqual(listed, await chapterOrder(db, HOLLOW));

  const after = await snapshot(db);
  assert.deepEqual(after.scenes, before.scenes, 'no Scene written: same ids, placement, prose, versions');
  assert.deepEqual(after.sessions, before.sessions);
  assert.deepEqual(after.chapters.map(({ group_id, position, ...c }) => c), before.chapters.map(({ group_id, position, ...c }) => c),
    'Chapters keep their ids, titles, completion and timestamps');
  assert.equal(await storedTotal(db, HOLLOW), 1450, 'Groups never change the ordered total');

  // Out again: a Chapter to the top level, then Part I (with ch2) to the top level.
  ok(await structure.moveChapter(CH(1), null, 0, HOLLOW));
  ok(await structure.moveGroup(part1.id, null, null, HOLLOW));
  assert.deepEqual(await outline(db, HOLLOW), [CH(1), '[Book One', CH(6), ']', CH(5), CH(4), '[Part II', CH(3), ']', '[Part I', CH(2), ']']);
  await assertStructure(db);
});

test('a Group is renamed, made untitled, and only its title changes; blank titles are never stored', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const g = ok(await structure.createGroup(HOLLOW, '   ')).data;
  assert.equal(g.title, null, 'blank = untitled');
  ok(await structure.moveChapter(CH(1), g.id, null, HOLLOW));
  const before = await snapshot(db);
  const renamed = ok(await structure.renameGroup(g.id, '  Act I ', HOLLOW)).data;
  assert.equal(renamed.title, 'Act I');
  const after = await snapshot(db);
  assert.deepEqual(after.chapters, before.chapters);
  assert.deepEqual(after.groups.map(({ title, updated_at, ...x }) => x), before.groups.map(({ title, updated_at, ...x }) => x));
  assert.equal(ok(await structure.renameGroup(g.id, '', HOLLOW)).data.title, null);
  const blank = await as(db, ALICE).from('manuscript_groups').update({ title: '  ' }).eq('id', g.id).select('id');
  assert.equal(blank.error?.code, '23514', 'manuscript_groups_title_not_blank');
  signIn(db, BRAM);
  assert.deepEqual(await structure.renameGroup(g.id, 'Mine', HOLLOW), { data: null, error: 'Group not found' });
});

// ── 2. ordering ───────────────────────────────────────────────────────────────

test('reordering: one ordering model for Groups and Chapters together; siblings renumbered 1..n in one step; moving to the same place writes nothing', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const { book, part2 } = await buildHollowStructure();
  // Top level: Book One(1), ch5(3), ch4(4), Part II(5).
  const top = async () => (await outline(db, HOLLOW)).filter((x, i, arr) => {
    let depth = 0;
    for (let j = 0; j < i; j++) depth += arr[j].startsWith('[') ? 1 : arr[j] === ']' ? -1 : 0;
    return depth === 0 && x !== ']';
  });
  assert.deepEqual(await top(), ['[Book One', CH(5), CH(4), '[Part II']);

  // Part II up two places: a Group passes two Chapters.
  ok(await structure.moveGroup(part2.id, null, 1, HOLLOW));
  assert.deepEqual(await top(), ['[Book One', '[Part II', CH(5), CH(4)]);
  const m = await manuscriptOf(db, HOLLOW);
  const positions = await all(db, `
    select id, position from (select id, position from public.manuscript_groups where manuscript_id = $1 and parent_group_id is null
      union all select id, position from public.chapters where manuscript_id = $1 and group_id is null) s order by position`, [m]);
  assert.deepEqual(positions.map((p) => p.position), [1, 2, 3, 4], 'renumbered 1..n');

  // A Chapter above a Group (a swap across the two tables).
  ok(await structure.moveChapter(CH(4), null, 0, HOLLOW));
  assert.deepEqual(await top(), [CH(4), '[Book One', '[Part II', CH(5)]);
  // Down one place, and an index past the end means last.
  ok(await structure.moveGroup(book.id, null, 2, HOLLOW));
  assert.deepEqual(await top(), [CH(4), '[Part II', '[Book One', CH(5)]);
  ok(await structure.moveChapter(CH(4), null, 99, HOLLOW));
  assert.deepEqual(await top(), ['[Part II', '[Book One', CH(5), CH(4)]);

  const before = await snapshot(db);
  assert.deepEqual(await structure.moveChapter(CH(4), null, 3, HOLLOW), { error: null, moved: false });
  assert.deepEqual(await structure.moveChapter(CH(4), null, null, HOLLOW), { error: null, moved: false });
  assert.deepEqual(await snapshot(db), before, 'nothing written');
  await assertStructure(db);
});

test('ordering uniqueness: simultaneous moves, Group creations and Chapter creations never tie; writers cannot write placement directly; a tie is refused whoever writes it', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const { book, part1, part2 } = await buildHollowStructure();
  const results = await Promise.all([
    structure.moveChapter(CH(5), part1.id, 0, HOLLOW),
    structure.moveChapter(CH(4), part1.id, 1, HOLLOW),
    structure.moveGroup(part2.id, book.id, 0, HOLLOW),
    structure.createGroup(HOLLOW, 'Interlude'),
    structure.createGroup(HOLLOW, 'Coda', book.id),
    chapters.createChapter(HOLLOW, 'Chapter 7'),
    chapters.createChapter(HOLLOW, 'Chapter 8'),
    structure.moveChapter(CH(1), null, 0, HOLLOW),
  ]);
  for (const r of results) assert.equal(r.error, null, r.error);
  await assertStructure(db);
  assert.equal((await chapterOrder(db, HOLLOW)).length, 8, 'every Chapter is still in the manuscript');

  // Placement is the database's: direct writes are refused (42501)…
  const alice = as(db, ALICE);
  for (const [table, patch, id] of [
    ['chapters', { position: 1 }, CH(2)], ['chapters', { group_id: null }, CH(2)],
    ['manuscript_groups', { position: 1 }, part1.id], ['manuscript_groups', { parent_group_id: null }, part1.id],
  ]) {
    const r = await alice.from(table).update(patch).eq('id', id).select('id');
    assert.equal(r.error?.code, '42501', `${table} ${JSON.stringify(patch)}`);
  }
  const m = await manuscriptOf(db, HOLLOW);
  assert.equal((await alice.from('manuscript_groups').insert({ manuscript_id: m, title: 'x', position: 99 })).error?.code, '42501');
  assert.equal((await alice.from('manuscript_groups').delete().eq('id', book.id).select('id')).error?.code, '42501');
  // …and even the table owner cannot put a Group and a Chapter in one slot.
  const slot = (await one(db, `select position from public.manuscript_groups where id = $1`, [part1.id])).position;
  await assert.rejects(db.query(`update public.chapters set group_id = $1, position = $2 where id = $3`, [book.id, slot, CH(2)]),
    /shares position/);
  await assertStructure(db);
});

// ── 3. refusals ───────────────────────────────────────────────────────────────

test('cycles are refused: a Group into itself or any Group inside it — by the functions and by the table itself', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const { book, part1 } = await buildHollowStructure();
  const deep = ok(await structure.createGroup(HOLLOW, 'Deep', part1.id)).data;
  const before = await snapshot(db);
  for (const target of [book.id, part1.id, deep.id]) {
    assert.deepEqual(await structure.moveGroup(book.id, target, null, HOLLOW), { error: 'A Group cannot move inside itself' });
  }
  assert.deepEqual(await structure.moveGroup(part1.id, deep.id, 0, HOLLOW), { error: 'A Group cannot move inside itself' });
  assert.deepEqual(await snapshot(db), before, 'nothing changed');

  await assert.rejects(db.query(`update public.manuscript_groups set parent_group_id = $1 where id = $2`, [deep.id, book.id]),
    /cannot be placed inside itself/);
  await assert.rejects(db.query(`update public.manuscript_groups set parent_group_id = id where id = $1`, [book.id]),
    /cannot be placed inside itself|manuscript_groups_not_own_parent/);
  // A legitimate nesting still works: Deep to the top level, then Book One into Deep.
  ok(await structure.moveGroup(deep.id, null, null, HOLLOW));
  ok(await structure.moveGroup(book.id, deep.id, null, HOLLOW));
  assert.deepEqual((await outline(db, HOLLOW)).slice(0, 3), [CH(5), CH(4), '[Part II']);
  await assertStructure(db);
});

test('cross-Manuscript and other writers: refused, writing nothing', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const { part1 } = await buildHollowStructure();
  const ashGroup = ok(await structure.createGroup(projectId('ash'), 'Elsewhere')).data;
  const before = await snapshot(db);

  assert.deepEqual(await structure.moveChapter(CH(4), ashGroup.id, null, HOLLOW), { error: 'A Chapter can only move within its own manuscript' });
  assert.deepEqual(await structure.moveGroup(part1.id, ashGroup.id, null, HOLLOW), { error: 'A Group can only move within its own manuscript' });
  assert.deepEqual(await structure.moveGroup(ashGroup.id, part1.id, null, HOLLOW), { error: 'A Group can only move within its own manuscript' });
  assert.deepEqual(await structure.createGroup(HOLLOW, 'x', ashGroup.id), { data: null, error: 'Group not found' });

  signIn(db, BRAM);
  assert.deepEqual(await structure.moveChapter(chapterId('tide.ch1'), part1.id, null, projectId('tide')), { error: 'Group not found' });
  assert.deepEqual(await structure.moveChapter(CH(4), null, 0, HOLLOW), { error: 'Chapter not found' });
  assert.deepEqual(await structure.moveGroup(part1.id, null, 0, HOLLOW), { error: 'Group not found' });
  assert.deepEqual(await structure.deleteGroup(ashGroup.id, projectId('ash')), { error: 'Group not found' });
  assert.deepEqual(await structure.createGroup(HOLLOW, 'x'), { data: null, error: 'Project not found' });
  assert.equal((await as(db, BRAM).from('manuscript_groups').select('id')).data.length, 0, 'another writer\'s Groups are invisible');
  assert.ok((await as(db, null).rpc('move_chapter', { p_chapter_id: CH(4), p_parent_group_id: null, p_index: 0 })).error, 'anon has no EXECUTE');
  assert.ok((await as(db, ALICE).rpc('place_in_manuscript_structure', { p_manuscript_id: await manuscriptOf(db, HOLLOW),
    p_parent_group_id: null, p_kind: 'chapter', p_id: CH(4), p_index: 0 })).error, 'the internal renumbering is not callable');
  signIn(db, null);
  assert.deepEqual(await structure.moveChapter(CH(4), null, 0, HOLLOW), { error: 'Not authenticated' });
  assert.deepEqual(await snapshot(db), before);

  // The composite foreign keys hold even for the table owner.
  await assert.rejects(db.query(`update public.chapters set group_id = $1 where id = $2`, [ashGroup.id, CH(4)]), /chapters_group_same_manuscript_fkey/);
  await assert.rejects(db.query(`update public.manuscript_groups set parent_group_id = $1 where id = $2`, [ashGroup.id, part1.id]),
    /manuscript_groups_parent_same_manuscript_fkey/);
});

test('deleteGroup: only an empty Group; a non-empty one is refused unchanged; no Chapter or Scene is ever deleted with a Group', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const { book, part1, part2 } = await buildHollowStructure();
  const before = await snapshot(db);
  for (const g of [book, part1, part2]) {
    assert.deepEqual(await structure.deleteGroup(g.id, HOLLOW), { error: 'Only an empty Group can be deleted' });
  }
  assert.deepEqual(await snapshot(db), before);
  await assert.rejects(db.query(`delete from public.manuscript_groups where id = $1`, [part2.id]), /chapters_group_same_manuscript_fkey/);
  const outer = ok(await structure.createGroup(HOLLOW, 'Outer')).data;
  const inner = ok(await structure.createGroup(HOLLOW, 'Inner', outer.id)).data;
  assert.deepEqual(await structure.deleteGroup(outer.id, HOLLOW), { error: 'Only an empty Group can be deleted' }, 'holding only a Group');
  await assert.rejects(db.query(`delete from public.manuscript_groups where id = $1`, [outer.id]), /manuscript_groups_parent_same_manuscript_fkey/);
  ok(await structure.deleteGroup(inner.id, HOLLOW));
  ok(await structure.deleteGroup(outer.id, HOLLOW));

  ok(await structure.moveChapter(CH(3), null, null, HOLLOW));
  assert.deepEqual(await structure.deleteGroup(part2.id, HOLLOW), { error: null });
  const after = await snapshot(db);
  assert.deepEqual(after.groups.map((g) => g.id).sort(), [book.id, part1.id].sort());
  assert.deepEqual(after.scenes, before.scenes);
  assert.equal(after.chapters.length, before.chapters.length);
  await assertStructure(db);
});

// ── 4. creation, duplication, deletion of the Project ─────────────────────────

test('createChapter appends after the last top-level Group; duplicateProject copies the Groups and reads in the same order; deleting a Project removes its Groups', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const { part2 } = await buildHollowStructure();
  const created = ok(await chapters.createChapter(HOLLOW, 'Chapter 7')).data;
  assert.deepEqual([created.group_id, created.position], [null, part2.position + 1]);
  assert.equal((await chapterOrder(db, HOLLOW)).at(-1), created.id, 'last in reading order');

  // Duplication as bram (alice is over her free limit): Part One [ ch2, Act [ ch3 ] ], ch1 moved last.
  signIn(db, BRAM);
  const TIDE = projectId('tide');
  const partOne = ok(await structure.createGroup(TIDE, 'Part One')).data;
  const act = ok(await structure.createGroup(TIDE, 'Act', partOne.id)).data;
  ok(await structure.moveChapter(chapterId('tide.ch2'), partOne.id, 0, TIDE));
  ok(await structure.moveChapter(chapterId('tide.ch3'), act.id, null, TIDE));
  ok(await structure.moveChapter(chapterId('tide.ch1'), null, null, TIDE));
  const dup = ok(await projects.duplicateProject(TIDE)).data;
  const titles = async (pid) => {
    const byId = new Map((await all(db, `select id, title from public.chapters`)).map((c) => [c.id, c.title]));
    return (await outline(db, pid)).map((x) => byId.get(x) ?? x);
  };
  assert.deepEqual(await titles(dup.id), ['[Part One', chapterTitleFor('tide.ch2'), '[Act', chapterTitleFor('tide.ch3'), ']', ']', chapterTitleFor('tide.ch1')]);
  assert.deepEqual(await titles(dup.id), await titles(TIDE), 'same Groups, same nesting, same order');
  const dupGroups = await all(db, `select id from public.manuscript_groups where manuscript_id = $1`, [await manuscriptOf(db, dup.id)]);
  assert.equal(dupGroups.length, 2);
  assert.ok(!dupGroups.some((g) => [partOne.id, act.id].includes(g.id)), 'new Groups, not shared ones');
  assert.equal(await storedTotal(db, dup.id), 1320);
  await assertStructure(db);

  assert.deepEqual(await projects.deleteProject(dup.id), { error: null });
  signIn(db, ALICE);
  assert.deepEqual(await projects.deleteProject(HOLLOW), { error: null }, 'nested Groups do not block a Project deletion');
  signIn(db, BRAM);
  assert.deepEqual(await projects.deleteProject(TIDE), { error: null });
  assert.equal((await one(db, `select count(*)::int as n from public.manuscript_groups`)).n, 0);
});

// ── 5. export ─────────────────────────────────────────────────────────────────

test('the REAL export prints Chapters in Group reading order, under their titled Groups\' headings', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  await buildHollowStructure();
  const recording = (globalThis.__runeTestPdf ??= { texts: [], saved: [] });
  recording.texts.length = 0;
  const loaded = await exporter.loadManuscriptForExport(as(db, ALICE), HOLLOW);
  assert.deepEqual(loaded.chapters.map((c) => c.id), await chapterOrder(db, HOLLOW), 'the loader returns reading order');
  await exporter.exportProjectAsPdf({ title: 'fixture-project' }, loaded.chapters, loaded.scenesPerChapter, loaded.groups);
  const headings = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [chapterTitleFor(`hollow.ch${n}`).toUpperCase(), CH(n)]));
  const markers = Object.fromEntries(['h1a', 'h2a', 'h3a', 'h4a', 'h4b', 'h4c', 'h6c'].map((l) => [markerFor(l), pageId(l)]));
  assert.deepEqual(recording.texts.filter((t) => headings[t]).map((t) => headings[t]), [CH(1), CH(2), CH(6), CH(4), CH(3)],
    'ch5 has no Scene and is skipped, as before');
  assert.deepEqual(recording.texts.filter((t) => markers[t]).map((t) => markers[t]),
    ['h1a', 'h2a', 'h6c', 'h4a', 'h4c', 'h3a'].map(pageId), 'Scenes in Scene order within each Chapter');
  // Titled Groups print as headings (architecture §4, Milestone 19), each before its first Chapter.
  const structural = { ...headings, 'BOOK ONE': 'Book One', 'PART I': 'Part I', 'PART II': 'Part II' };
  assert.deepEqual(recording.texts.filter((t) => structural[t]).map((t) => structural[t]),
    ['Book One', 'Part I', CH(1), CH(2), CH(6), CH(4), 'Part II', CH(3)]);

  // planManuscriptExport ignores the order it is given: the structure decides.
  const shuffled = [...loaded.chapters].reverse();
  assert.deepEqual(exporter.planManuscriptExport(shuffled, loaded.scenesPerChapter, loaded.groups).map((e) => e.chapter.id),
    [CH(1), CH(2), CH(6), CH(4), CH(3)]);
  // Without Groups, Chapters are by position, as before.
  const flat = await seededDb();
  const plain = await exporter.loadManuscriptForExport(as(flat, ALICE), HOLLOW);
  assert.deepEqual(plain.chapters.map((c) => c.id), [1, 2, 3, 5, 4, 6].map(CH));
});

// ── 6. Unplaced order ─────────────────────────────────────────────────────────

test('Unplaced Scenes: unique positions per Manuscript under simultaneous moves, creations and Chapter deletions; existing Unplaced Scenes are never renumbered', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const m = await manuscriptOf(db, HOLLOW);
  const existing = await all(db, `select id, position, version from public.scenes where manuscript_id = $1 and chapter_id is null order by position`, [m]);
  assert.deepEqual(existing.map((s) => s.position), [0, 1, 2, 3]);

  const results = await Promise.all([
    scenes.moveSceneToUnplaced(pageId('h1a')),
    scenes.moveSceneToUnplaced(pageId('h4a')),
    scenes.createUnplacedScene(HOLLOW, 'A loose scene'),
    scenes.createUnplacedScene(HOLLOW, 'Another'),
    chapters.removeChapterKeepScenes(CH(6), HOLLOW),
    scenes.moveSceneToChapter(pageId('h3c'), CH(2)),
  ]);
  for (const r of results) assert.equal(r.error, null, r.error);
  await assertStructure(db);
  const now = await all(db, `select id, position, version from public.scenes where manuscript_id = $1 and chapter_id is null order by position`, [m]);
  assert.equal(now.length, 4 + 2 + 2 + 1 - 1);
  for (const s of existing.filter((e) => e.id !== pageId('h3c'))) {
    assert.deepEqual(now.find((n) => n.id === s.id), s, 'an Unplaced Scene that did not move keeps its position and version');
  }
  assert.deepEqual((await scenes.getUnplacedScenes(HOLLOW)).data.map((s) => s.id), now.map((s) => s.id), 'the app lists them in that order');

  // A tie is refused, whatever writes it.
  const r = await as(db, ALICE).from('scenes').update({ position: now[0].position }).eq('id', now[1].id).select('id');
  assert.equal(r.error?.code, '23P01');
  // A one-statement swap is fine (deferrable, for a future Unplaced reorder).
  await db.query(`update public.scenes set position = case id when $1 then $3::int else $4::int end where id in ($1, $2)`,
    [now[0].id, now[1].id, now[1].position, now[0].position]);
  await assertStructure(db);
});

/**
 * Permanent deletion of a Scene: only from Trash (migration 037) — to Trash,
 * then deleted there. Same database effect as the old direct delete.
 */
async function purgeScene(id) {
  const t = await trash.trashWorkspaceObject('scene', id);
  if (t.error !== null) return { error: t.error };
  const d = await trash.deleteTrashedWorkspaceObject('scene', id);
  return { error: d.error };
}

// ── 7. Scene deletion keeps writing history ───────────────────────────────────

test('deleting a Scene keeps its writing history: same words, days, Project and writer; merged into an existing Project-level row; never a Scene title or prose', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const sessionsOn = (userId, date) => all(db, `select id, project_id, scene_id, words_added from public.writing_sessions
    where user_id = $1 and session_date = $2 order by words_added`, [userId, date]);
  const s4 = (await one(db, `select id from public.writing_sessions where scene_id = $1`, [pageId('h4c')])).id;

  // 2026-08-02: h3a 25, h4c 150, no Project-level row. The first deletion
  // detaches h4c's row in place (same row id)…
  assert.deepEqual(await purgeScene(pageId('h4c')), { error: null });
  assert.deepEqual(await sessionsOn(ALICE, '2026-08-02'), [
    { id: (await one(db, `select id from public.writing_sessions where scene_id = $1 and session_date = '2026-08-02'`, [pageId('h3a')])).id,
      project_id: HOLLOW, scene_id: pageId('h3a'), words_added: 25 },
    { id: s4, project_id: HOLLOW, scene_id: null, words_added: 150 },
  ]);
  // …the second merges into it (one Project-level row per writer, Project and day).
  assert.deepEqual(await purgeScene(pageId('h3a')), { error: null });
  assert.deepEqual(await sessionsOn(ALICE, '2026-08-02'), [{ id: s4, project_id: HOLLOW, scene_id: null, words_added: 175 }]);
  assert.deepEqual((await sessionsOn(ALICE, '2026-08-01')).map((r) => [r.scene_id, r.words_added]), [[pageId('h3b'), 380], [null, 410]],
    'h3a\'s other day kept too');

  // An existing Project-level row (bram, 2026-08-04: 15) absorbs a Scene's words.
  await db.query(`insert into public.writing_sessions (user_id, project_id, scene_id, session_date, words_added) values ($1, $2, $3, '2026-08-04', 7)`,
    [BRAM, projectId('tide'), pageId('t1b')]);
  signIn(db, BRAM);
  assert.deepEqual(await purgeScene(pageId('t1b')), { error: null });
  assert.deepEqual((await sessionsOn(BRAM, '2026-08-04')).map((r) => [r.project_id, r.scene_id, r.words_added]), [[projectId('tide'), null, 22]]);
  assert.deepEqual((await sessionsOn(BRAM, '2026-08-05')).map((r) => [r.scene_id, r.words_added]), [[null, 650], [pageId('t1c'), 720]]);

  // A Scene row with no Project gets its Scene's Project (never the account-level game bucket).
  await db.query(`insert into public.writing_sessions (user_id, project_id, scene_id, session_date, words_added) values ($1, null, $2, '2026-08-10', 9)`,
    [ALICE, pageId('h1a')]);
  signIn(db, ALICE);
  assert.deepEqual(await purgeScene(pageId('h1a')), { error: null });
  assert.deepEqual((await sessionsOn(ALICE, '2026-08-10')).map((r) => [r.project_id, r.scene_id, r.words_added]), [[HOLLOW, null, 9]]);

  const columns = (await all(db, `select column_name from information_schema.columns where table_name = 'writing_sessions' order by 1`)).map((c) => c.column_name);
  assert.deepEqual(columns, ['created_at', 'id', 'project_id', 'scene_id', 'session_date', 'user_id', 'words_added'], 'no title or prose is kept anywhere');
});

test('Today\'s Words, streaks, daily history and all-time words do not drop when a Scene is deleted — nor when its credit arrives after the deletion', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  // Local calendar dates, as the editor and the offline credit store use.
  const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = localDate(new Date());
  const yesterday = localDate(new Date(Date.now() - 864e5));
  await writingStats.recordWordsWritten(HOLLOW, 40, pageId('h6c'), yesterday);
  await writingStats.recordWordsWritten(HOLLOW, 30, pageId('h6c'), today);
  await writingStats.recordWordsWritten(HOLLOW, 12, pageId('h2a'), today);
  await writingStats.recordWordsWritten(HOLLOW, 5, null, today); // a Project-level row today (e.g. Arena)
  const stats = async () => ({
    today: await writingStats.getTodayWords(ALICE, today),
    streak: await writingStats.getWritingStreak(ALICE, today),
    byDay: await writingStats.getWordsByDay(ALICE, 7),
    history: await writingStats.getContributionHistory(ALICE),
    allTime: (await one(db, `select sum(words_added)::int as n from public.writing_sessions where user_id = $1`, [ALICE])).n,
  });
  const before = await stats();
  assert.equal(before.today, 47);
  assert.equal(before.streak.currentStreak, 2);

  assert.deepEqual(await purgeScene(pageId('h6c')), { error: null });
  assert.deepEqual(await purgeScene(pageId('h2a')), { error: null });
  assert.deepEqual(await stats(), before, 'nothing about the writer\'s history changed');
  assert.deepEqual((await all(db, `select words_added from public.writing_sessions where user_id = $1 and session_date = $2`, [ALICE, today]))
    .map((r) => r.words_added), [47], 'today is one Project-level row');

  // A credit for the deleted Scene still arrives (online, late): recorded at Project level.
  await writingStats.recordWordsWritten(HOLLOW, 8, pageId('h6c'), today);
  assert.equal(await writingStats.getTodayWords(ALICE, today), 55);
  // One queued offline, flushed by the REAL sync engine after the deletion.
  await offline.storeOfflineWritingCredit(HOLLOW, pageId('h2a'), 6);
  await engine.flushOfflineWritingCredits();
  assert.equal(await writingStats.getTodayWords(ALICE, today), 61);
  assert.deepEqual(await (await offline.getOfflineDB()).getAll('pending_writing_credits'), [], 'the credit was applied, not dropped');
  assert.deepEqual((await all(db, `select words_added from public.writing_sessions where user_id = $1 and session_date = $2`, [ALICE, today]))
    .map((r) => r.words_added), [61]);

  // Deleting a whole Project still removes that Project's history (unchanged).
  assert.deepEqual(await projects.deleteProject(projectId('ash')), { error: null });
  assert.equal((await one(db, `select count(*)::int as n from public.writing_sessions where project_id = $1`, [projectId('ash')])).n, 0);
  assert.equal((await one(db, `select count(*)::int as n from public.writing_sessions where user_id = $1 and session_date = '2026-08-03'`, [ALICE])).n, 1,
    'hollow\'s row that day stays');
});
