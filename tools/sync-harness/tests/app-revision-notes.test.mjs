// Revision Notes (Rune 2.0, pre-Milestone 19, migration 039): the REAL
// actions, pure rules and sync engine against the Rune 2.0 schema in real
// Postgres + RLS.
//
//   * data model: many notes on a Scene and on a Chapter; each edited and
//     deleted on its own; blank never stored; an invalid or foreign target
//     refused; another writer can neither read nor write; clients cannot write
//     the table; a retried create is one note
//   * aggregation: a Scene shows its own and its Chapter's notes — never a
//     sibling Scene's; a Chapter shows its own and every Scene's in it now;
//     moving a Scene (another Chapter, Unplaced) moves its notes in the
//     aggregation with nothing written
//   * Reading Mode: its quick add is the same store writing the same rows
//     (no reading-note storage); Chapter and Scene notes both visible
//   * Trash: Scene and Chapter Trash hide and restore; permanent deletion
//     removes exactly the right notes
//   * reliability: a failed save keeps the note (memory and device); leaving
//     the Scene keeps it; reconnecting saves it; a conflict never overwrites
//     a newer note; a reload recovers the device copy
//   * regression: notes never change prose, version, words, totals, writing
//     sessions, Today, History, Milestones, search or export
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow; bram owns tide. In hollow: ch1 [h1a], ch2 [h2a], ch3 [h3a],
// ch5 [], ch4 [h4a, h4b, h4c], ch6 [h6c]; Unplaced: h3b, h3c, h6a, h6b.
import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, readRepoFile, REPO_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');
const CH = (n) => chapterId(`hollow.ch${n}`);
const S = (label) => pageId(label);

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

let legacy;
let notes, scenes, structure, chapters, trash, milestones, history, reading, search, manuscriptLoader, exporter;
let model, syncLib, nav, readingModel, drafts, noteDrafts;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  notes = await bundleForTest('src/lib/actions/revisionNotes.ts', { name: 'rn_notes' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'rn_scenes' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'rn_structure' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'rn_chapters' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'rn_trash' });
  milestones = await bundleForTest('src/lib/actions/manuscriptMilestones.ts', { name: 'rn_milestones' });
  history = await bundleForTest('src/lib/actions/sceneHistory.ts', { name: 'rn_history' });
  reading = await bundleForTest('src/lib/actions/reading.ts', { name: 'rn_reading' });
  search = await bundleForTest('src/lib/actions/projectSearch.ts', { name: 'rn_search' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'rn_manuscript' });
  exporter = await bundleForTest('src/lib/export/projectExport.ts', { name: 'rn_export' });
  model = await bundleForTest('src/lib/rune2/revisionNotes.ts', { name: 'rn_model' });
  syncLib = await bundleForTest('src/lib/rune2/revisionNoteSync.ts', { name: 'rn_sync' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'rn_nav' });
  readingModel = await bundleForTest('src/lib/rune2/reading.ts', { name: 'rn_reading_model' });
  drafts = await bundleForTest('src/lib/rune2/workspaceDrafts.ts', { name: 'rn_drafts' });
  noteDrafts = await bundleForTest('src/lib/rune2/noteDrafts.ts', { name: 'rn_note_drafts' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  signIn(db, ALICE);
  MS = (await one(db, `select id from public.manuscripts where project_id = $1`, [HOLLOW])).id;
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [notes, scenes, structure, chapters, trash, milestones, history, reading, search, manuscriptLoader, exporter]) {
    mod.setServerClient(sb);
  }
  return sb;
}

/** The index the shell holds. */
async function indexOf(projectId = HOLLOW) {
  const manuscript = await manuscriptLoader.loadProjectManuscript(projectId);
  return { manuscript, index: nav.indexManuscript(manuscript) };
}

const add = async (type, target, body) => {
  const r = await notes.createRevisionNote(randomUUID(), type, target, body);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  return r.note;
};
const listed = async () => ok(await notes.listRevisionNotes(HOLLOW));
/** The hollow Manuscript's id (set by seededDb). */
let MS;
/** The scope of an id (a Scene, Chapter or Group), or the Manuscript for null. */
const scopeOf = (index, id) => model.noteScopeOf(id ? index.get(id) : null, MS);
const bodiesIn = (list, scope, index) => model.notesInScope(list, scope, index).map((n) => n.body);
/** What a level's Revision Notes view shows, by body, from a fresh read. */
async function viewOf(id, list) {
  const { index } = await indexOf();
  return bodiesIn(list ?? (await listed()), scopeOf(index, id), index);
}
const noteRows = (db) => all(db, `select id, target_type, target_id, scene_id, chapter_id, body, version from public.revision_notes order by created_at, id`);

/** Everything a note must never change. */
async function writingState(db) {
  return {
    scenes: await all(db, `select id, chapter_id, position, title, content, word_count, version, updated_at, trashed_at from public.scenes order by id`),
    chapters: await all(db, `select id, title, position, group_id, updated_at, trashed_at from public.chapters order by id`),
    projects: await all(db, `select id, word_count, updated_at from public.projects order by id`),
    sessions: await all(db, `select * from public.writing_sessions order by id`),
    revisions: await all(db, `select id, scene_id, reason from public.scene_revisions order by id`),
    milestones: await all(db, `select * from public.manuscript_milestone_scenes order by milestone_id, scene_id`),
    events: await all(db, `select * from public.analytics_events order by id`),
  };
}

/** A sync engine on the real actions, with a network that can be cut, a device store, and a manual clock. */
function engine({ storage = memoryStorage(), userId = ALICE, projectId = HOLLOW } = {}) {
  const net = { down: false, calls: 0 };
  const guard = (fn) => async (...args) => {
    net.calls += 1;
    if (net.down) throw new Error('Failed to fetch');
    return fn(...args);
  };
  const timers = [];
  const sync = new syncLib.NoteSync({
    transport: {
      list: guard(notes.listRevisionNotes),
      create: guard(notes.createRevisionNote),
      update: guard(notes.updateRevisionNote),
      remove: guard(notes.deleteRevisionNote),
    },
    storage,
    userId,
    projectId,
    newId: randomUUID,
    schedule: (fn) => { timers.push(fn); return () => {}; },
  });
  return { sync, net, storage, runTimers: async () => { for (const fn of timers.splice(0)) fn(); await sync.flush(); } };
}

function memoryStorage() {
  const map = new Map();
  return {
    map,
    load: async (userId, projectId) => [...map.values()].filter((p) => p.userId === userId && p.projectId === projectId).map((p) => ({ ...p })),
    put: async (p) => { map.set(p.noteId, { ...p }); },
    remove: async (id) => { map.delete(id); },
  };
}

// ── 1. Data model ─────────────────────────────────────────────────────────────

test('many notes on a Scene and on a Chapter; each edited and deleted on its own; blank never stored', async () => {
  const db = await seededDb();
  const s1 = await add('scene', S('h4a'), 'Nerai’s motive is unclear here.');
  const s2 = await add('scene', S('h4a'), 'Cut the second storm.');
  const s3 = await add('scene', S('h4a'), 'Line one\nLine two');
  const c1 = await add('chapter', CH(4), 'The chapter drags in the middle.');
  const c2 = await add('chapter', CH(4), 'Move the letter earlier.');
  assert.deepEqual([s1, s2, s3].map((n) => [n.target_type, n.target_id, n.version]), [['scene', S('h4a'), 1], ['scene', S('h4a'), 1], ['scene', S('h4a'), 1]]);
  assert.equal(s3.body, 'Line one\nLine two', 'multiline kept exactly');
  assert.deepEqual([c1, c2].map((n) => [n.target_type, n.target_id]), [['chapter', CH(4)], ['chapter', CH(4)]]);
  assert.equal(s1.project_id, HOLLOW);
  assert.equal((await noteRows(db)).length, 5);

  // Edit one: only that one changes.
  let r = await notes.updateRevisionNote(s2.id, 'Cut the second storm entirely.', 1);
  assert.deepEqual([r.status, r.note.body, r.note.version], ['ok', 'Cut the second storm entirely.', 2]);
  const rows = await noteRows(db);
  assert.deepEqual(rows.filter((n) => n.id !== s2.id).map((n) => [n.body, n.version]),
    [[s1.body, 1], [s3.body, 1], [c1.body, 1], [c2.body, 1]]);
  // Re-sending the same text is 'ok' and writes nothing (a retry that landed).
  r = await notes.updateRevisionNote(s2.id, 'Cut the second storm entirely.', 1);
  assert.deepEqual([r.status, r.note.version], ['ok', 2]);

  // Delete one: only that one goes.
  assert.equal((await notes.deleteRevisionNote(c1.id, 1)).status, 'ok');
  assert.deepEqual((await noteRows(db)).map((n) => n.id).sort(), [s1.id, s2.id, s3.id, c2.id].sort());
  assert.equal((await notes.deleteRevisionNote(c1.id, 1)).status, 'ok', 'already gone is ok');

  // Blank: never created, never saved over a note.
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'scene', S('h4a'), '  \n\t '), { status: 'error', error: 'blank' });
  assert.deepEqual(await notes.updateRevisionNote(s1.id, '   ', 1), { status: 'error', error: 'blank' });
  assert.equal((await notes.createRevisionNote(randomUUID(), 'scene', S('h4a'), 'x'.repeat(20001))).status, 'error');
  assert.equal((await noteRows(db)).length, 4);
  assert.equal(model.noteIsBlank(' \n'), true);
  assert.equal(model.noteExcerpt('First line that is long\nsecond', 10), 'First lin…');
});

test('a retried create is one note; invalid targets are refused; the target never changes', async () => {
  const db = await seededDb();
  const id = randomUUID();
  const first = await notes.createRevisionNote(id, 'scene', S('h1a'), 'Open on the bell.');
  const again = await notes.createRevisionNote(id, 'scene', S('h1a'), 'Open on the bell.');
  assert.equal(first.status, 'ok');
  assert.deepEqual(again, first, 'the same note, not a second one');
  assert.equal((await noteRows(db)).length, 1);
  assert.deepEqual(await notes.createRevisionNote(id, 'chapter', CH(1), 'other'), { status: 'error', error: 'invalid' }, 'an id is one note');

  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'group', CH(1), 'x'), { status: 'unavailable' }, 'a Chapter id is no Group');
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'scene', CH(1), 'x'), { status: 'unavailable' }, 'a Chapter id is no Scene');
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'chapter', S('h1a'), 'x'), { status: 'unavailable' }, 'a Scene id is no Chapter');
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'scene', randomUUID(), 'x'), { status: 'unavailable' });
  assert.deepEqual(await notes.updateRevisionNote(randomUUID(), 'x', 1), { status: 'missing' });

  // The database itself refuses a note whose target is of another Manuscript, or a changed target.
  await assert.rejects(db.query(
    `insert into public.revision_notes (project_id, manuscript_id, target_type, scene_id, target_id, body)
     select $1, m.id, 'scene', $2, $2, 'x' from public.manuscripts m where m.project_id = $1`, [HOLLOW, S('t1b')]), /Scene must be of its Manuscript/);
  await assert.rejects(db.query(
    `insert into public.revision_notes (project_id, manuscript_id, target_type, chapter_id, target_id, body)
     select $1, m.id, 'chapter', $2, $2, 'x' from public.manuscripts m where m.project_id = $1`, [HOLLOW, chapterId('tide.ch1')]), /foreign key/);
  await assert.rejects(db.query(
    `insert into public.revision_notes (project_id, manuscript_id, target_type, scene_id, chapter_id, target_id, body)
     select $1, m.id, 'scene', $2, $3, $2, 'x' from public.manuscripts m where m.project_id = $1`, [HOLLOW, S('h1a'), CH(1)]), /revision_notes_target_check/);
  await assert.rejects(db.query(`update public.revision_notes set scene_id = $1, target_id = $1 where id = $2`, [S('h2a'), id]), /keeps its target/);
});

test('notes are the owner\'s alone: another writer can neither read nor write them; clients cannot write the table', async () => {
  const db = await seededDb();
  const mine = await add('scene', S('h2a'), 'private');
  const chapterNote = await add('chapter', CH(2), 'also private');
  const bram = signIn(db, BRAM);
  assert.deepEqual(ok(await notes.listRevisionNotes(HOLLOW)), []);
  assert.deepEqual(await notes.updateRevisionNote(mine.id, 'mine now', null), { status: 'missing' });
  assert.deepEqual(await notes.deleteRevisionNote(chapterNote.id, null), { status: 'ok', note: null }, 'looks gone to him');
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'scene', S('h2a'), 'x'), { status: 'unavailable' });
  assert.deepEqual(await notes.createRevisionNote(mine.id, 'scene', S('h2a'), 'private'), { status: 'error', error: 'invalid' }, 'an id is no way in');
  const direct = await bram.from('revision_notes').insert({ project_id: TIDE, manuscript_id: randomUUID(), target_type: 'scene', scene_id: S('t1b'), target_id: S('t1b'), body: 'x' });
  assert.match(direct.error?.message ?? '', /permission denied/);
  const alice = signIn(db, ALICE);
  const update = await alice.from('revision_notes').update({ body: 'changed' }).eq('id', mine.id);
  assert.match(update.error?.message ?? '', /permission denied/);
  const del = await alice.from('revision_notes').delete().eq('id', mine.id);
  assert.match(del.error?.message ?? '', /permission denied/);
  assert.deepEqual((await noteRows(db)).map((n) => n.body).sort(), ['also private', 'private']);
});

// ── 2. Scope and aggregation ─────────────────────────────────────────────────

test('a note may be on the Manuscript, a Group, a Chapter or a Scene; mixed or foreign targets are refused', async () => {
  const db = await seededDb();
  const g = ok(await structure.createGroup(HOLLOW, 'Part One'));
  const m = await add('manuscript', MS, 'The middle sags.');
  const gn = await add('group', g.id, 'Part One ends too quietly.');
  assert.deepEqual([m.target_type, m.target_id], ['manuscript', MS]);
  assert.deepEqual([gn.target_type, gn.target_id], ['group', g.id]);
  const rows = await all(db, `select target_type, scene_id, chapter_id, group_id, target_id from public.revision_notes order by created_at`);
  assert.deepEqual(rows, [
    { target_type: 'manuscript', scene_id: null, chapter_id: null, group_id: null, target_id: MS },
    { target_type: 'group', scene_id: null, chapter_id: null, group_id: g.id, target_id: g.id },
  ]);
  // Edited and deleted like any note.
  assert.equal((await notes.updateRevisionNote(m.id, 'The middle sags badly.', 1)).status, 'ok');
  assert.equal((await notes.deleteRevisionNote(gn.id, 1)).status, 'ok');

  // Wrong kinds of id, another writer's Manuscript, unknown types.
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'manuscript', CH(1), 'x'), { status: 'unavailable' });
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'group', S('h1a'), 'x'), { status: 'unavailable' });
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'group', MS, 'x'), { status: 'unavailable' });
  const tideMs = (await one(db, `select id from public.manuscripts where project_id = $1`, [TIDE])).id;
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'manuscript', tideMs, 'x'), { status: 'unavailable' });
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'part', g.id, 'x'), { status: 'error', error: 'invalid' });
  // The database refuses a row naming two targets, or a Manuscript note naming one.
  await assert.rejects(db.query(
    `insert into public.revision_notes (project_id, manuscript_id, target_type, group_id, chapter_id, target_id, body)
     values ($1, $2, 'group', $3, $4, $3, 'x')`, [HOLLOW, MS, g.id, CH(1)]), /revision_notes_target_check/);
  await assert.rejects(db.query(
    `insert into public.revision_notes (project_id, manuscript_id, target_type, scene_id, target_id, body)
     values ($1, $2, 'manuscript', $3, $2, 'x')`, [HOLLOW, MS, S('h1a')]), /revision_notes_target_check/);
  await assert.rejects(db.query(
    `insert into public.revision_notes (project_id, manuscript_id, target_type, group_id, target_id, body)
     values ($1, $2, 'group', $3, $3, 'x')`, [HOLLOW, tideMs, g.id]), /Manuscript must be its Project|foreign key/);
  await assert.rejects(db.query(`update public.revision_notes set group_id = $1, target_type = 'group', target_id = $1 where id = $2`, [g.id, m.id]), /keeps its target/);
  // Another writer sees neither.
  signIn(db, BRAM);
  assert.deepEqual(ok(await notes.listRevisionNotes(HOLLOW)), []);
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'manuscript', MS, 'x'), { status: 'unavailable' });
});

/** hollow with Groups: Part A [Part A.1 [ch1], ch2], Part B [ch4]; ch3, ch5, ch6 at the top level. Notes on every level. */
async function hierarchy() {
  const db = await seededDb();
  const a = ok(await structure.createGroup(HOLLOW, 'Part A'));
  const a1 = ok(await structure.createGroup(HOLLOW, 'Part A.1', a.id));
  const b = ok(await structure.createGroup(HOLLOW, 'Part B'));
  assert.equal((await structure.moveChapter(CH(1), a1.id, null, HOLLOW)).error, null);
  assert.equal((await structure.moveChapter(CH(2), a.id, null, HOLLOW)).error, null);
  assert.equal((await structure.moveChapter(CH(4), b.id, null, HOLLOW)).error, null);
  await add('manuscript', MS, 'M: the ending');
  await add('group', a.id, 'A: part note');
  await add('group', a1.id, 'A1: nested part note');
  await add('chapter', CH(1), 'ch1 note');
  await add('scene', S('h1a'), 'h1a note');
  await add('chapter', CH(2), 'ch2 note');
  await add('scene', S('h2a'), 'h2a note');
  await add('group', b.id, 'B: part note');
  await add('chapter', CH(4), 'ch4 note');
  await add('scene', S('h4a'), 'h4a one');
  await add('scene', S('h4a'), 'h4a two');
  await add('scene', S('h4c'), 'h4c sibling');
  await add('scene', S('h3a'), 'h3a top-level chapter');
  await add('scene', S('h3b'), 'h3b unplaced');
  return { db, a, a1, b };
}

test('each level shows its own notes and those below it, once each, in manuscript order — a Scene only its own', async () => {
  const { a, a1, b } = await hierarchy();
  const { index } = await indexOf();
  const list = await listed();

  assert.deepEqual(await viewOf(S('h4a'), list), ['h4a one', 'h4a two'], 'a Scene: its own notes only — no Chapter, sibling, Group or Manuscript note');
  assert.deepEqual(await viewOf(CH(4), list), ['ch4 note', 'h4a one', 'h4a two', 'h4c sibling'], 'a Chapter: its own, then its Scenes\' in Scene order');
  assert.deepEqual(await viewOf(b.id, list), ['B: part note', 'ch4 note', 'h4a one', 'h4a two', 'h4c sibling']);
  assert.deepEqual(await viewOf(a1.id, list), ['A1: nested part note', 'ch1 note', 'h1a note']);
  assert.deepEqual(await viewOf(a.id, list), ['A: part note', 'A1: nested part note', 'ch1 note', 'h1a note', 'ch2 note', 'h2a note'], 'nested Groups inside, in order');
  const whole = await viewOf(null, list);
  assert.equal(whole[0], 'M: the ending', 'the Manuscript\'s own first');
  assert.equal(whole.at(-1), 'h3b unplaced', 'Unplaced Scenes last');
  assert.equal(whole.length, list.length, 'every active note, each once');
  // Manuscript order: the order of the targets in the reading order of the index.
  const sections = model.noteSections(list, scopeOf(index, null), index);
  const readingOrder = [...index.keys()];
  const positions = sections.slice(1).map((sec) => readingOrder.indexOf(sec.target.id));
  assert.deepEqual(positions, [...positions].sort((x, y) => x - y));
  assert.ok(positions.every((p) => p >= 0));

  // Defaults: a new note goes to the level shown.
  assert.deepEqual(scopeOf(index, S('h4a')), { type: 'scene', id: S('h4a') });
  assert.deepEqual(scopeOf(index, CH(4)), { type: 'chapter', id: CH(4) });
  assert.deepEqual(scopeOf(index, b.id), { type: 'group', id: b.id });
  assert.deepEqual(scopeOf(index, null), { type: 'manuscript', id: MS });
  assert.deepEqual(scopeOf(index, S('h3b')), { type: 'scene', id: S('h3b') }, 'an Unplaced Scene is a Scene');
  assert.equal(model.noteScopeOf({ kind: 'workspacePage', id: 'p', path: [] }, MS), null, 'no notes on Workspace objects');

  // Labels and the trail up.
  const chapterSections = model.noteSections(list, scopeOf(index, CH(4)), index);
  assert.equal(model.targetLabel(chapterSections[0].target, index), 'This chapter');
  assert.equal(model.targetLabel(chapterSections[1].target, index), index.get(S('h4a')).title);
  const wholeSections = model.noteSections(list, scopeOf(index, null), index);
  assert.equal(model.targetLabel(wholeSections[0].target, index), 'Whole manuscript');
  assert.equal(model.targetLabel(wholeSections.at(-1).target, index), `${index.get(S('h3b')).title} · Unplaced`);
  assert.deepEqual(model.scopeTrail(scopeOf(index, S('h1a')), index, MS).map((t) => t.scope.type),
    ['manuscript', 'group', 'group', 'chapter', 'scene'], 'Manuscript / Part A / Part A.1 / Chapter 1 / the Scene');
  assert.deepEqual(model.scopeTrail(scopeOf(index, S('h1a')), index, MS).slice(1, 3).map((t) => t.scope.id), [a.id, a1.id]);
});

test('the notebook tree (noteTree): the same notes as noteSections, under their Groups and Chapters in manuscript order, containers kept only while something inside holds a note', async () => {
  const { a, a1, b } = await hierarchy();
  const { index } = await indexOf();
  const list = await listed();
  const shape = (nodes) => nodes.map((n) => [model.targetLabel(n.target, index), n.notes.map((x) => x.body), n.count, shape(n.children)]);

  // The Manuscript: its own note first, then — in the outline's order — Chapter 3 (one Scene: its
  // Scene's note reads as the Chapter's), Part A (holding Part A.1 → Chapter 1, and Chapter 2),
  // Part B → Chapter 4 → its Scenes, Unplaced last.
  const whole = model.noteTree(list, scopeOf(index, null), index);
  assert.deepEqual(whole.own.map((n) => n.body), ['M: the ending']);
  assert.deepEqual(shape(whole.nodes), [
    [index.get(CH(3)).title, ['h3a top-level chapter'], 1, []],
    ['Part A', ['A: part note'], 6, [
      ['Part A.1', ['A1: nested part note'], 3, [[index.get(CH(1)).title, ['ch1 note', 'h1a note'], 2, []]]],
      [index.get(CH(2)).title, ['ch2 note', 'h2a note'], 2, []],
    ]],
    ['Part B', ['B: part note'], 5, [
      [index.get(CH(4)).title, ['ch4 note'], 4, [
        [index.get(S('h4a')).title, ['h4a one', 'h4a two'], 2, []],
        [index.get(S('h4c')).title, ['h4c sibling'], 1, []],
      ]],
    ]],
    [`${index.get(S('h3b')).title} · Unplaced`, ['h3b unplaced'], 1, []],
  ]);
  const flat = (nodes) => nodes.flatMap((n) => [...n.notes.map((x) => x.body), ...flat(n.children)]);
  assert.deepEqual([...whole.own.map((n) => n.body), ...flat(whole.nodes)], bodiesIn(list, scopeOf(index, null), index), 'exactly noteSections\' notes, in its order');

  // A Group: only what is inside it. A Chapter: its Scenes as leaves. A Scene: no tree at all.
  assert.deepEqual(shape(model.noteTree(list, scopeOf(index, a.id), index).nodes).map((n) => n[0]), ['Part A.1', index.get(CH(2)).title]);
  assert.deepEqual(model.noteTree(list, scopeOf(index, a1.id), index).own.map((n) => n.body), ['A1: nested part note']);
  const ch4 = model.noteTree(list, scopeOf(index, CH(4)), index);
  assert.deepEqual(ch4.own.map((n) => n.body), ['ch4 note']);
  assert.deepEqual(shape(ch4.nodes).map((n) => [n[0], n[1]]), [[index.get(S('h4a')).title, ['h4a one', 'h4a two']], [index.get(S('h4c')).title, ['h4c sibling']]]);
  const h4a = model.noteTree(list, scopeOf(index, S('h4a')), index);
  assert.deepEqual([h4a.own.map((n) => n.body), h4a.nodes], [['h4a one', 'h4a two'], []], 'a Scene: its own notes, no tree');

  // A container with nothing under it is left out: Part B's Chapter 4 keeps Part B, but a Group with no notes anywhere inside never appears.
  const c = ok(await structure.createGroup(HOLLOW, 'Part C'));
  const after = await indexOf();
  assert.ok(!shape(model.noteTree(await listed(), scopeOf(after.index, null), after.index).nodes).some((n) => n[0] === 'Part C'));
  void b;
});

test('a Chapter with one Scene reads as the Chapter: its Scene\'s notes fold into the Chapter\'s section (targets unchanged); a second Scene brings the grouping back', async () => {
  const { db, b } = await hierarchy();
  const sectionsOf = async (id) => {
    const { index } = await indexOf();
    const list = await listed();
    return model.noteSections(list, model.presentedScope(scopeOf(index, id), index), index)
      .map((sec) => [model.targetLabel(sec.target, index), sec.target.type, sec.notes.map((n) => n.body)]);
  };
  // Chapter 4 has several Scenes: its Scene's notes are grouped under the Scene.
  assert.deepEqual(await sectionsOf(CH(4)), [
    ['This chapter', 'chapter', ['ch4 note']],
    [(await indexOf()).index.get(S('h4a')).title, 'scene', ['h4a one', 'h4a two']],
    [(await indexOf()).index.get(S('h4c')).title, 'scene', ['h4c sibling']],
  ]);
  const before = await noteRows(db);

  // Its other Scenes leave (one to Unplaced, one to Trash): one Scene, shown as just the Chapter.
  ok(await scenes.moveSceneToUnplaced(S('h4c')));
  const trashed = await trash.trashWorkspaceObject('scene', S('h4b'));
  assert.equal(trashed.error, null, JSON.stringify(trashed));
  assert.deepEqual(await sectionsOf(CH(4)), [['This chapter', 'chapter', ['ch4 note', 'h4a one', 'h4a two']]],
    'one section: no "Scene 1" the writer never sees');
  // From the Group and the Manuscript, too: under the Chapter's title, never the Scene's.
  const groupView = await sectionsOf(b.id);
  assert.deepEqual(groupView.map(([, type, bodies]) => [type, bodies]), [['group', ['B: part note']], ['chapter', ['ch4 note', 'h4a one', 'h4a two']]]);
  assert.equal(groupView[1][0], (await indexOf()).index.get(CH(4)).title);
  const whole = await sectionsOf(null);
  assert.ok(!whole.some(([, type, bodies]) => type === 'scene' && bodies.includes('h4a one')));
  const { index } = await indexOf();
  // The Scene's level (Reading Mode, search) is presented as the Chapter, trail included.
  assert.deepEqual(model.presentedScope(scopeOf(index, S('h4a')), index), { type: 'chapter', id: CH(4) });
  assert.deepEqual(model.scopeTrail(model.presentedScope(scopeOf(index, S('h4a')), index), index, MS).map((t) => t.scope.type),
    ['manuscript', 'group', 'chapter']);
  // Unplaced Scenes are never folded.
  assert.deepEqual(model.presentedScope(scopeOf(index, S('h4c')), index), { type: 'scene', id: S('h4c') });
  // Presentation only: every note row — target, id, body, version — as it was.
  assert.deepEqual(await noteRows(db), before);
  const h4a = (await noteRows(db)).filter((n) => n.body.startsWith('h4a'));
  assert.deepEqual(h4a.map((n) => [n.target_type, n.target_id, n.scene_id]), [['scene', S('h4a'), S('h4a')], ['scene', S('h4a'), S('h4a')]]);

  // A second Scene again: the Scene grouping is back, with nothing rewritten.
  assert.equal((await scenes.placeScene(S('h4c'), CH(4), null)).error, null);
  assert.deepEqual((await sectionsOf(CH(4))).map(([, type, bodies]) => [type, bodies]), [
    ['chapter', ['ch4 note']], ['scene', ['h4a one', 'h4a two']], ['scene', ['h4c sibling']],
  ]);
  const again = await indexOf();
  assert.deepEqual(model.presentedScope(scopeOf(again.index, S('h4a')), again.index), { type: 'scene', id: S('h4a') });
  assert.deepEqual(await noteRows(db), before);
});

test('moves are read from the live structure — Scene between Chapters, to Unplaced, Chapter and Group between Groups — with no note rewritten', async () => {
  const { db, a, a1, b } = await hierarchy();
  const before = await noteRows(db);

  // Scene: Chapter 4 (Part B) → Chapter 1 (Part A / A.1).
  assert.equal((await scenes.placeScene(S('h4c'), CH(1), null)).error, null);
  assert.ok(!(await viewOf(CH(4))).includes('h4c sibling'));
  assert.ok(!(await viewOf(b.id)).includes('h4c sibling'));
  assert.deepEqual(await viewOf(CH(1)), ['ch1 note', 'h1a note', 'h4c sibling']);
  assert.ok((await viewOf(a.id)).includes('h4c sibling') && (await viewOf(a1.id)).includes('h4c sibling'));
  assert.deepEqual(await viewOf(S('h4c')), ['h4c sibling'], 'still its own');

  // Scene → Unplaced: kept, under no Chapter or Group, still in the Manuscript.
  ok(await scenes.moveSceneToUnplaced(S('h4c')));
  for (const id of [CH(1), a1.id, a.id]) assert.ok(!(await viewOf(id)).includes('h4c sibling'));
  assert.deepEqual(await viewOf(S('h4c')), ['h4c sibling']);
  assert.ok((await viewOf(null)).includes('h4c sibling'));

  // Chapter between Groups: Chapter 4 leaves Part B for Part A.
  assert.equal((await structure.moveChapter(CH(4), a.id, null, HOLLOW)).error, null);
  assert.deepEqual(await viewOf(b.id), ['B: part note']);
  assert.deepEqual((await viewOf(a.id)).slice(-3), ['ch4 note', 'h4a one', 'h4a two']);

  // Group into another Group: Part B into Part A.1 — everything under it follows.
  assert.equal((await structure.moveGroup(b.id, a1.id, null, HOLLOW)).error, null);
  assert.ok((await viewOf(a1.id)).includes('B: part note'));
  assert.ok((await viewOf(a.id)).includes('B: part note'));

  assert.deepEqual(await noteRows(db), before, 'no note row was written by any move');
});

// ── 3. Trash ─────────────────────────────────────────────────────────────────

test('Scene Trash hides its notes (and refuses writes) until restored; permanent deletion removes only its notes', async () => {
  const db = await seededDb();
  const a = await add('scene', S('h1a'), 'Open on the bell, not the rain.');
  await add('scene', S('h1a'), 'Second thought.');
  const keep = await add('chapter', CH(1), 'chapter one');
  ok(await trash.trashWorkspaceObject('scene', S('h1a')));
  assert.deepEqual((await listed()).map((n) => n.body), ['chapter one'], 'hidden while in Trash');
  assert.deepEqual(await notes.updateRevisionNote(a.id, 'x', 1), { status: 'unavailable' });
  assert.deepEqual(await notes.deleteRevisionNote(a.id, 1), { status: 'unavailable' });
  assert.deepEqual(await notes.createRevisionNote(randomUUID(), 'scene', S('h1a'), 'x'), { status: 'unavailable' });
  assert.equal((await noteRows(db)).length, 3, 'kept, untouched');
  ok(await trash.restoreWorkspaceObject('scene', S('h1a')));
  assert.deepEqual((await listed()).map((n) => n.body).sort(), ['Open on the bell, not the rain.', 'Second thought.', 'chapter one']);

  ok(await trash.trashWorkspaceObject('scene', S('h1a')));
  ok(await trash.deleteTrashedWorkspaceObject('scene', S('h1a')));
  assert.deepEqual((await noteRows(db)).map((n) => n.id), [keep.id], 'its notes gone; the Chapter\'s kept');
});

test('Chapter Trash hides its notes and its Scenes\' notes, restore brings them back; permanent deletion removes both', async () => {
  const db = await seededDb();
  await add('chapter', CH(4), 'chapter four');
  await add('scene', S('h4b'), 'Write this one.');
  await add('scene', S('h4c'), 'And this.');
  const unplaced = await add('scene', S('h3b'), 'unplaced note');
  const other = await add('chapter', CH(2), 'chapter two');
  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  assert.deepEqual((await listed()).map((n) => n.id).sort(), [unplaced.id, other.id].sort());
  ok(await trash.restoreWorkspaceObject('chapter', CH(4)));
  assert.deepEqual(await viewOf(CH(4)), ['chapter four', 'Write this one.', 'And this.']);

  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  ok(await trash.deleteTrashedWorkspaceObject('chapter', CH(4)));
  assert.deepEqual((await noteRows(db)).map((n) => n.id).sort(), [unplaced.id, other.id].sort());
});

test('regression: a Scene trashed and restored shows its notes again in the open shell (the store re-reads for the restored structure)', async () => {
  const db = await seededDb();
  await add('scene', S('h1a'), 'first thought');
  await add('scene', S('h1a'), 'second thought');
  await add('chapter', CH(1), 'chapter one');
  const { sync } = engine();
  await sync.start();
  const structure_ = async () => {
    const { index } = await indexOf();
    return { index, key: [...index.values()].filter((e) => ['group', 'chapter', 'scene', 'unplacedScene'].includes(e.kind)).map((e) => e.id).sort().join(',') };
  };
  let { index, key } = await structure_();
  await sync.structureChanged(key); // the shell mounts
  assert.deepEqual(bodiesIn(sync.notes(), scopeOf(index, S('h1a')), index), ['first thought', 'second thought']);

  ok(await trash.trashWorkspaceObject('scene', S('h1a')));
  ({ index, key } = await structure_());
  await sync.structureChanged(key);
  assert.equal(index.has(S('h1a')), false);
  assert.deepEqual(sync.notes().map((n) => n.body), ['chapter one'], 'hidden while in Trash');
  assert.equal((await noteRows(db)).length, 3, 'rows kept');

  ok(await trash.restoreWorkspaceObject('scene', S('h1a')));
  ({ index, key } = await structure_());
  await sync.structureChanged(key); // the same structure as at first: must still read again
  assert.deepEqual(bodiesIn(sync.notes(), scopeOf(index, S('h1a')), index), ['first thought', 'second thought'], 'back, same Scene id');
  assert.deepEqual(await viewOf(CH(1)), ['chapter one', 'first thought', 'second thought']);

  // Permanent deletion removes the Scene's notes, and only those.
  ok(await trash.trashWorkspaceObject('scene', S('h1a')));
  ok(await trash.deleteTrashedWorkspaceObject('scene', S('h1a')));
  assert.deepEqual((await noteRows(db)).map((n) => n.body), ['chapter one']);
});

test('deleting an empty Group deletes its own notes; Groups have no Trash, and a Group\'s notes never hold its contents\' notes', async () => {
  const db = await seededDb();
  const g = ok(await structure.createGroup(HOLLOW, 'Part'));
  const outer = ok(await structure.createGroup(HOLLOW, 'Outer'));
  await add('group', g.id, 'group note');
  const kept = await add('group', outer.id, 'outer note');
  const m = await add('manuscript', MS, 'manuscript note');
  assert.equal((await structure.deleteGroup(g.id, HOLLOW)).error, null);
  assert.deepEqual((await noteRows(db)).map((n) => n.id).sort(), [kept.id, m.id].sort());
  assert.deepEqual(await viewOf(null), ['manuscript note', 'outer note']);
});

test('removing a Chapter but keeping its Scenes (removeChapterKeepScenes): its Chapter notes go, its Scenes keep theirs, now Unplaced', async () => {
  const db = await seededDb();
  await add('chapter', CH(4), 'chapter four');
  const sceneNote = await add('scene', S('h4a'), 'kept with the scene');
  assert.equal((await chapters.removeChapterKeepScenes(CH(4), HOLLOW)).error, null);
  assert.deepEqual((await noteRows(db)).map((n) => n.id), [sceneNote.id]);
  assert.deepEqual(await viewOf(S('h4a')), ['kept with the scene']);
  assert.ok((await viewOf(null)).includes('kept with the scene'), 'an Unplaced Scene\'s note is in the Manuscript view');
});

// ── 4. Reading Mode ───────────────────────────────────────────────────────────

test('Reading Mode quick add: ordinary Scene notes, several in a row, at once in the Scene\'s, Chapter\'s, Group\'s and Manuscript\'s views', async () => {
  const db = await seededDb();
  const part = ok(await structure.createGroup(HOLLOW, 'Part'));
  assert.equal((await structure.moveChapter(CH(4), part.id, null, HOLLOW)).error, null);
  await add('chapter', CH(4), 'The chapter drags.');
  const { manuscript, index } = await indexOf();
  const plan = readingModel.manuscriptReadingPlan(manuscript.outline, index);
  const current = readingModel.sceneAt(plan.blocks, plan.blocks.findIndex((b) => b.id === S('h4b')));
  assert.equal(current, S('h4b'));

  // The quick add is a NoteComposer for { type: 'scene', id: <the Scene read> } on the shared store.
  const { sync } = engine();
  await sync.start();
  for (const body of ['The storm repeats chapter 2.', 'Name the horse.', 'Too many adverbs.']) sync.create('scene', current, body);
  // Shown at once, before any save lands, at every level above.
  assert.deepEqual(bodiesIn(sync.notes(), scopeOf(index, current), index), ['The storm repeats chapter 2.', 'Name the horse.', 'Too many adverbs.']);
  for (const id of [CH(4), part.id, null]) {
    const shown = bodiesIn(sync.notes(), scopeOf(index, id), index);
    assert.ok(['The storm repeats chapter 2.', 'Name the horse.', 'Too many adverbs.'].every((b) => shown.includes(b)), `in the view of ${id ?? 'the Manuscript'}`);
  }
  await sync.flush();
  assert.equal(sync.pendingChanges().length, 0);
  // Ordinary Revision Notes rows, read back by any view.
  assert.deepEqual((await noteRows(db)).filter((n) => n.target_type === 'scene').map((n) => [n.scene_id, n.body]),
    [[S('h4b'), 'The storm repeats chapter 2.'], [S('h4b'), 'Name the horse.'], [S('h4b'), 'Too many adverbs.']]);
  assert.deepEqual(await viewOf(current), ['The storm repeats chapter 2.', 'Name the horse.', 'Too many adverbs.']);
  assert.deepEqual(model.noteCountsByTarget(sync.notes()).get(S('h4b')), 3, 'the margin mark counts');

  // No Reading Mode or Inspector note storage: one note table, and neither
  // surface calls a note action of its own.
  const tables = (await all(db, `select tablename from pg_tables where schemaname = 'public' and tablename like '%note%' order by 1`)).map((r) => r.tablename);
  assert.deepEqual(tables, ['founder_notes', 'project_notes', 'revision_notes', 'scene_revision_notes_038'], 'Pulse\'s founder notes, the legacy checklist, Revision Notes and 038\'s archive — nothing for reading');
  const source = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
  const readingSource = source('src/components/rune2/ReadingMode.tsx');
  assert.match(readingSource, /useRevisionNotes/);
  assert.match(readingSource, /target=\{\{ type: "scene", id: quickAdd \}\}/, 'the quick add targets the Scene');
  assert.doesNotMatch(readingSource, /actions\/(revisionNotes|sceneNotes|notes)|togglePanel\("inspector"\)/, 'no note action, and no Inspector');
  const panelSource = source('src/components/rune2/Rune2Panel.tsx');
  const inspector = panelSource.slice(panelSource.indexOf('function InspectorView'));
  assert.doesNotMatch(inspector, /RevisionNotes|useRevisionNotes|NoteComposer/, 'the Inspector holds no Revision Notes');
});

// ── 5. Reliability ────────────────────────────────────────────────────────────

test('a failed save keeps the note — shown, on the device, through leaving the Scene — and reconnecting saves it once', async () => {
  const db = await seededDb();
  const storage = memoryStorage();
  const { sync, net, runTimers } = engine({ storage });
  await sync.start();
  net.down = true;
  const id = sync.create('scene', S('h2a'), 'Do not lose me.');
  await sync.flush();
  assert.equal(sync.offline, true);
  assert.deepEqual(sync.notes().map((n) => [n.id, n.body, n.pending]), [[id, 'Do not lose me.', 'pending']]);
  assert.equal(storage.map.get(id).body, 'Do not lose me.', 'kept on the device');
  assert.equal((await noteRows(db)).length, 0);

  // "Leaving the Scene": the Inspector section unmounts; the store and device copy stay.
  const { index } = await indexOf();
  assert.deepEqual(bodiesIn(sync.notes(), scopeOf(index, S('h2a')), index), ['Do not lose me.']);
  await runTimers();
  assert.equal(storage.map.has(id), true, 'a retry while still down keeps it');

  net.down = false;
  await sync.refresh(); // what the 'online' event does
  assert.equal(sync.offline, false);
  assert.equal(storage.map.size, 0);
  assert.deepEqual((await noteRows(db)).map((n) => [n.id, n.body]), [[id, 'Do not lose me.']], 'saved once, with its own id');
});

test('an edit and a delete made offline survive a reload (a new engine reading the device) and then save', async () => {
  const db = await seededDb();
  const a = await add('scene', S('h4a'), 'first');
  const b = await add('scene', S('h4a'), 'second');
  const storage = memoryStorage();
  const first = engine({ storage });
  await first.sync.start();
  first.net.down = true;
  first.sync.edit(a.id, 'first, revised');
  first.sync.remove(b.id);
  const c = first.sync.create('chapter', CH(4), 'made offline');
  first.sync.edit(c, 'made offline, then edited');
  await first.sync.flush();
  first.sync.dispose(); // the tab closes

  const second = engine({ storage }); // the next visit
  await second.sync.start();
  assert.equal(second.sync.pendingChanges().length, 0);
  assert.deepEqual((await noteRows(db)).map((n) => [n.body, n.version]).sort(), [['first, revised', 2], ['made offline, then edited', 1]]);
});

test('the real device store (IndexedDB) keeps pending notes per writer and Project, and never loses Page drafts', async () => {
  await drafts.putPageDraft({ id: 'p1', userId: ALICE, projectId: HOLLOW, content: doc('page'), baseVersion: 1, dirty: true, savedAt: 1 });
  const pending = { noteId: 'n1', userId: ALICE, projectId: HOLLOW, kind: 'create', targetType: 'scene', targetId: S('h1a'), body: 'kept', baseVersion: 0, queuedAt: new Date().toISOString(), state: 'pending', remote: null, rev: 1 };
  await drafts.putNoteChange(pending);
  await drafts.putNoteChange({ ...pending, noteId: 'n2', userId: BRAM });
  assert.deepEqual(await drafts.loadNoteChanges(ALICE, HOLLOW), [pending]);
  assert.deepEqual(await drafts.loadNoteChanges(ALICE, TIDE), []);
  await drafts.deleteNoteChange('n1');
  assert.deepEqual(await drafts.loadNoteChanges(ALICE, HOLLOW), []);
  assert.deepEqual((await drafts.getPageDraft('p1', ALICE)).content, doc('page'));
});

test('unsent add-field text survives a reload (per writer, Project and level), and is forgotten once cleared', async () => {
  const store = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  } };
  try {
    noteDrafts.writeNoteDraft(ALICE, HOLLOW, `scene:${S('h1a')}`, 'half a thought');
    // "Reload": nothing in memory, read from the device.
    assert.equal(noteDrafts.readNoteDraft(ALICE, HOLLOW, `scene:${S('h1a')}`), 'half a thought');
    assert.equal(noteDrafts.readNoteDraft(ALICE, HOLLOW, `chapter:${CH(1)}`), '', 'per level');
    assert.equal(noteDrafts.readNoteDraft(BRAM, HOLLOW, `scene:${S('h1a')}`), '', 'never another writer\'s');
    assert.equal(noteDrafts.readNoteDraft(undefined, HOLLOW, `scene:${S('h1a')}`), '');
    noteDrafts.writeNoteDraft(ALICE, HOLLOW, `scene:${S('h1a')}`, '');
    assert.equal(store.size, 0, 'saved or cleared: forgotten');
    // Storage that throws never breaks the field.
    globalThis.window = { get localStorage() { throw new Error('blocked'); } };
    noteDrafts.writeNoteDraft(ALICE, HOLLOW, 'x', 'y');
    assert.equal(noteDrafts.readNoteDraft(ALICE, HOLLOW, 'x'), '');
  } finally {
    globalThis.window = previous;
  }
});

test('a conflict never overwrites a newer note: the change waits for the writer, who keeps theirs or takes the other', async () => {
  const db = await seededDb();
  const note = await add('scene', S('h4a'), 'original');
  const { sync, net } = engine();
  await sync.start();
  net.down = true;
  sync.edit(note.id, 'my offline edit');
  await sync.flush();
  // Meanwhile, another window edits it.
  assert.equal((await notes.updateRevisionNote(note.id, 'their newer edit', 1)).status, 'ok');
  net.down = false;
  await sync.flush();
  assert.equal((await one(db, `select body from public.revision_notes where id = $1`, [note.id])).body, 'their newer edit', 'not overwritten');
  let shown = sync.notes().find((n) => n.id === note.id);
  assert.deepEqual([shown.pending, shown.body, shown.remote.body], ['conflict', 'my offline edit', 'their newer edit']);
  // Still waiting after another flush: never resolved silently.
  await sync.flush();
  assert.equal(sync.notes().find((n) => n.id === note.id).pending, 'conflict');

  sync.resolve(note.id, 'mine');
  await sync.flush();
  assert.deepEqual(await one(db, `select body, version from public.revision_notes where id = $1`, [note.id]), { body: 'my offline edit', version: 3 });

  // "Use theirs" takes the stored text and drops the local change.
  net.down = true;
  sync.edit(note.id, 'another local try');
  await sync.flush();
  net.down = false;
  assert.equal((await notes.updateRevisionNote(note.id, 'theirs again', 3)).status, 'ok');
  await sync.flush();
  sync.resolve(note.id, 'theirs');
  shown = sync.notes().find((n) => n.id === note.id);
  assert.deepEqual([shown.pending, shown.body], [null, 'theirs again']);
  assert.equal((await one(db, `select body from public.revision_notes where id = $1`, [note.id])).body, 'theirs again');

  // A delete of a note changed elsewhere waits too.
  net.down = true;
  sync.remove(note.id);
  await sync.flush();
  net.down = false;
  assert.equal((await notes.updateRevisionNote(note.id, 'changed after your delete', 4)).status, 'ok');
  await sync.flush();
  shown = sync.notes().find((n) => n.id === note.id);
  assert.deepEqual([shown.pending, shown.deleting], ['conflict', true]);
  assert.ok(await one(db, `select 1 from public.revision_notes where id = $1`, [note.id]), 'not deleted');
  sync.resolve(note.id, 'theirs');
  assert.equal(sync.notes().find((n) => n.id === note.id).body, 'changed after your delete');
});

test('an edit of a note deleted elsewhere is kept and can be saved again as a new note; a same-text conflict resolves itself', async () => {
  const db = await seededDb();
  const note = await add('chapter', CH(2), 'original');
  const { sync, net } = engine();
  await sync.start();
  net.down = true;
  sync.edit(note.id, 'my version');
  await sync.flush();
  assert.equal((await notes.deleteRevisionNote(note.id, 1)).status, 'ok');
  net.down = false;
  await sync.refresh();
  let shown = sync.notes().find((n) => n.id === note.id);
  assert.deepEqual([shown.pending, shown.body], ['missing', 'my version'], 'the text is still there');
  sync.resolve(note.id, 'mine');
  await sync.flush();
  assert.deepEqual((await noteRows(db)).map((n) => [n.target_type, n.target_id, n.body]), [['chapter', CH(2), 'my version']]);

  // Two windows made the same edit: nothing to choose.
  const [row] = await noteRows(db);
  net.down = true;
  sync.edit(row.id, 'same words');
  await sync.flush();
  assert.equal((await notes.updateRevisionNote(row.id, 'same words', 1)).status, 'ok');
  net.down = false;
  await sync.flush();
  shown = sync.notes().find((n) => n.id === row.id);
  assert.deepEqual([shown.pending, shown.body], [null, 'same words']);
});

test('a create whose answer was lost is sent again without making a second note; changes made mid-send are not dropped', async () => {
  const db = await seededDb();
  const storage = memoryStorage();
  let loseAnswer = true;
  const sync = new syncLib.NoteSync({
    transport: {
      list: notes.listRevisionNotes,
      create: async (...args) => {
        const r = await notes.createRevisionNote(...args);
        if (loseAnswer) { loseAnswer = false; throw new Error('Failed to fetch'); }
        return r;
      },
      update: notes.updateRevisionNote,
      remove: notes.deleteRevisionNote,
    },
    storage, userId: ALICE, projectId: HOLLOW, newId: randomUUID, schedule: () => () => {},
  });
  await sync.start();
  const id = sync.create('scene', S('h6c'), 'landed, answer lost');
  await sync.flush();
  assert.equal(storage.map.has(id), true);
  await sync.flush();
  assert.equal((await noteRows(db)).length, 1, 'one note');
  assert.equal(storage.map.size, 0);

  // An edit made while its create is in flight becomes an edit of the created note.
  let release;
  const gate = new Promise((r) => { release = r; });
  const slow = new syncLib.NoteSync({
    transport: {
      list: notes.listRevisionNotes,
      create: async (...args) => { await gate; return notes.createRevisionNote(...args); },
      update: notes.updateRevisionNote,
      remove: notes.deleteRevisionNote,
    },
    storage: memoryStorage(), userId: ALICE, projectId: HOLLOW, newId: randomUUID, schedule: () => () => {},
  });
  await slow.start();
  const n = slow.create('scene', S('h6c'), 'first words');
  const sending = slow.flush();
  slow.edit(n, 'first words, and more');
  release();
  await sending;
  await slow.flush();
  assert.deepEqual(await one(db, `select body, version from public.revision_notes where id = $1`, [n]), { body: 'first words, and more', version: 2 });
  assert.equal(slow.pendingChanges().length, 0);
});

test('a note waiting on a trashed Scene is kept, and saved once the Scene is restored', async () => {
  const db = await seededDb();
  const { sync, net } = engine();
  await sync.start();
  net.down = true;
  sync.create('scene', S('h2a'), 'written just before the trash');
  await sync.flush();
  ok(await trash.trashWorkspaceObject('scene', S('h2a')));
  net.down = false;
  await sync.flush();
  assert.equal(sync.pendingChanges()[0].state, 'unavailable');
  assert.equal((await noteRows(db)).length, 0);
  ok(await trash.restoreWorkspaceObject('scene', S('h2a')));
  await sync.refresh(); // the shell reads notes again when the structure changes
  assert.deepEqual((await noteRows(db)).map((n) => n.body), ['written just before the trash']);
  assert.equal(sync.pendingChanges().length, 0);
});

// ── 6. Regression ─────────────────────────────────────────────────────────────

test('notes never change prose, version, words, totals, sessions, Today, History, Milestones, search or export', async () => {
  const db = await seededDb();
  const milestone = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  const snapshotBefore = ok(await milestones.getManuscriptMilestone(milestone.id));
  const historyBefore = ok(await history.listSceneHistory(S('h1a')));
  const versionsBefore = ok(await reading.getReadingVersions(HOLLOW));
  const before = await writingState(db);

  const a = await add('scene', S('h1a'), 'a scene note with many words in it');
  await add('scene', S('h3b'), 'unplaced scene note');
  const c = await add('chapter', CH(1), 'chapter note words');
  assert.equal((await notes.updateRevisionNote(a.id, 'edited scene note', 1)).status, 'ok');
  assert.equal((await notes.deleteRevisionNote(c.id, 1)).status, 'ok');
  const { sync } = engine();
  await sync.start();
  sync.create('scene', S('h4b'), 'through the engine');
  await sync.flush();

  assert.deepEqual(await writingState(db), before, 'no Scene, Chapter, total, session, History or Milestone row changed');
  assert.deepEqual(ok(await reading.getReadingVersions(HOLLOW)), versionsBefore, 'Reading Mode sees nothing to re-read');
  assert.deepEqual(ok(await history.listSceneHistory(S('h1a'))), historyBefore);
  assert.deepEqual(ok(await milestones.getManuscriptMilestone(milestone.id)), snapshotBefore);
  const later = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 2'));
  assert.doesNotMatch(JSON.stringify(ok(await milestones.getManuscriptMilestone(later.id))), /scene note|through the engine/, 'a Milestone captures no note');
  assert.deepEqual(ok(await search.searchProjectContent(HOLLOW, 'unplaced scene note')), [], 'a note is not manuscript text');
  const { chapters: rows, scenesPerChapter, groups } = await exporter.loadManuscriptForExport(createSupabaseAdapter(db, { userId: ALICE }), HOLLOW);
  assert.doesNotMatch(JSON.stringify(exporter.planManuscriptExport(rows, scenesPerChapter, groups)), /scene note|through the engine|chapter note/);
});
