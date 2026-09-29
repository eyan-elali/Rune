// Reading Mode and Scene-anchored revision (Rune 2.0, Milestone 18, migration
// 038): the REAL actions, loaders and pure rules against the Rune 2.0 schema
// in real Postgres + RLS.
//
//   * navigator: Groups reorder among their siblings and move into / out of
//     other Groups (move_manuscript_group, atomic); a Group can never move
//     into itself or a Group inside it; the navigator offers only valid places
//   * drag auto-scroll: the pure controller the navigator runs while
//     dragging — speed grows toward the edge, it stops the moment the pointer
//     leaves the zone, the list ends or the drag ends — driving long-distance
//     drags of a Scene, a Chapter and a Group, each then landing through the
//     real atomic move
//   * Reading Mode: the whole manuscript in canonical order, Unplaced Scenes
//     left out, headings and breaks, navigation (block → Scene → rail row),
//     read-only rendering, the live text (re-read after an edit), "Edit"
//     opening the canonical Scene
//   * a Scene View read: exactly the View's Scenes (its filters), in
//     manuscript order or the View's own sort, never duplicated, Trash left out
//   * Scene revision notes: create / edit / conflict / blank removes; they
//     follow the Scene through every move, Unplaced and back, Trash and
//     restore (with its Chapter too); permanent deletion removes them; writing
//     one never changes the Scene's version, words, history, writing sessions
//     or the manuscript total, and never reaches search or export
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow; bram owns tide. In hollow, reading order: ch1 [h1a 120], ch2
// [h2a 300], ch3 [h3a 410], ch5 [], ch4 [h4a 200, h4b 0, h4c 150], ch6 [h6c
// 270]; Unplaced: h3b 380, h3c 95, h6a 250, h6b 260.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const CH = (n) => chapterId(`hollow.ch${n}`);
const S = (label) => pageId(label);

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});
const words = (...paragraphs) => paragraphs.join(' ').split(/\s+/).filter(Boolean).length;

let legacy;
let scenes, chapters, structure, trash, props, views, notes, reading, search, manuscriptLoader;
let nav, readingModel, autoscroll, viewModel, sceneModel, propModel, refsModel, readingDoc, notesModel, exporter;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'rr_scenes' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'rr_chapters' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'rr_structure' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'rr_trash' });
  props = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'rr_props' });
  views = await bundleForTest('src/lib/actions/sceneViews.ts', { name: 'rr_views' });
  notes = await bundleForTest('src/lib/actions/sceneNotes.ts', { name: 'rr_notes' });
  reading = await bundleForTest('src/lib/actions/reading.ts', { name: 'rr_reading' });
  search = await bundleForTest('src/lib/actions/projectSearch.ts', { name: 'rr_search' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'rr_manuscript' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'rr_nav' });
  readingModel = await bundleForTest('src/lib/rune2/reading.ts', { name: 'rr_reading_model' });
  autoscroll = await bundleForTest('src/lib/rune2/dragAutoScroll.ts', { name: 'rr_autoscroll' });
  viewModel = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'rr_view_model' });
  sceneModel = await bundleForTest('src/lib/rune2/sceneViews.ts', { name: 'rr_scene_model' });
  propModel = await bundleForTest('src/lib/rune2/collectionProperties.ts', { name: 'rr_prop_model' });
  refsModel = await bundleForTest('src/lib/rune2/references.ts', { name: 'rr_refs_model' });
  notesModel = await bundleForTest('src/lib/rune2/sceneNotes.ts', { name: 'rr_notes_model' });
  readingDoc = await bundleForTest('src/components/rune2/ReadingDocument.tsx', { name: 'rr_reading_doc' });
  exporter = await bundleForTest('src/lib/export/projectExport.ts', { name: 'rr_export' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  signIn(db, ALICE);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [scenes, chapters, structure, trash, props, views, notes, reading, search, manuscriptLoader, exporter]) {
    mod.setServerClient(sb);
  }
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const moved = (r) => assert.equal(r.error, null, r.error);

/** The manuscript as the shell holds it, and its index. */
async function shell(projectId = HOLLOW) {
  const manuscript = await manuscriptLoader.loadProjectManuscript(projectId);
  return { manuscript, index: nav.indexManuscript(manuscript) };
}

/** The outline as [kind:id, depth] in reading order. */
function flatOutline(outline) {
  const out = [];
  const visit = (nodes) => nodes.forEach((n) => {
    if (n.kind === 'group') {
      out.push(`group:${n.group.id}@${n.depth}`);
      visit(n.children);
    } else {
      out.push(`chapter:${n.chapter.id}@${n.depth}`);
    }
  });
  visit(outline);
  return out;
}

/** Placed Scenes in canonical order, straight from the database through the export's own reader. */
async function canonicalPlacedOrder(db) {
  const { chapters: rows, scenesPerChapter } = await exporter.loadManuscriptForExport(createSupabaseAdapter(db, { userId: ALICE }), HOLLOW);
  return rows.flatMap((c) => [...(scenesPerChapter[c.id] ?? [])].sort((a, b) => a.position - b.position).map((s) => s.id));
}

const sceneState = (db, id) => one(db, `select id, chapter_id, position, title, content, word_count, version, updated_at, trashed_at from public.scenes where id = $1`, [id]);
/** A note as the client uses it (updated_at compared as an instant). */
const plainNote = (n) => n && { scene_id: n.scene_id, body: n.body, version: n.version, updated_at: new Date(n.updated_at).getTime() };
const noteRow = (db, id) => one(db, `select scene_id, manuscript_id, body, version from public.scene_revision_notes where scene_id = $1`, [id]);
/** Everything a note must never change. */
async function writingState(db) {
  return {
    scenes: await all(db, `select id, chapter_id, position, title, content, word_count, version, updated_at, trashed_at from public.scenes order by id`),
    projects: await all(db, `select id, word_count, updated_at from public.projects order by id`),
    sessions: await all(db, `select * from public.writing_sessions order by id`),
    revisions: await all(db, `select id, scene_id, reason from public.scene_revisions order by id`),
    events: await all(db, `select * from public.analytics_events order by id`),
  };
}

// ── 1. Group movement ─────────────────────────────────────────────────────────

test('Groups reorder among their siblings (Groups and Chapters together), atomically, keeping every id and Scene', async () => {
  const db = await seededDb();
  const a = ok(await structure.createGroup(HOLLOW, 'Part A'));
  const b = ok(await structure.createGroup(HOLLOW, 'Part B'));
  const c = ok(await structure.createGroup(HOLLOW, 'Part C'));
  moved(await structure.moveChapter(CH(1), a.id, null, HOLLOW));
  moved(await structure.moveChapter(CH(2), b.id, null, HOLLOW));
  const scenesBefore = await all(db, `select id, chapter_id, position, content, word_count, version from public.scenes order by id`);

  // C to the very top; then B one step up (the ⌥↑ path: index − 1 among its siblings).
  moved(await structure.moveGroup(c.id, null, 0, HOLLOW));
  let { manuscript } = await shell();
  const top = () => manuscript.outline.map((n) => (n.kind === 'group' ? n.group.id : n.chapter.id));
  assert.deepEqual(top(), [c.id, CH(3), CH(5), CH(4), CH(6), a.id, b.id]);
  const places = nav.manuscriptPlaces(manuscript);
  const at = places.get(b.id);
  moved(await structure.moveGroup(b.id, at.parentId, at.index - 1, HOLLOW));
  ({ manuscript } = await shell());
  assert.deepEqual(top(), [c.id, CH(3), CH(5), CH(4), CH(6), b.id, a.id]);

  // Siblings are numbered 1..n with no gap or tie; the Groups keep their Chapters.
  const siblings = await all(db, `select position from (
      select g.position from public.manuscript_groups g join public.manuscripts m on m.id = g.manuscript_id
       where m.project_id = $1 and g.parent_group_id is null
      union all select c.position from public.chapters c join public.manuscripts m on m.id = c.manuscript_id
       where m.project_id = $1 and c.group_id is null and c.trashed_at is null) s order by position`, [HOLLOW]);
  assert.deepEqual(siblings.map((r) => r.position), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal((await one(db, `select group_id from public.chapters where id = $1`, [CH(1)])).group_id, a.id);
  assert.equal((await one(db, `select group_id from public.chapters where id = $1`, [CH(2)])).group_id, b.id);
  assert.deepEqual(await all(db, `select id, chapter_id, position, content, word_count, version from public.scenes order by id`), scenesBefore,
    'a Group move touches no Scene: same ids, placement, prose, words, versions');
});

test('Groups move into, out of and between Groups, with everything inside them', async () => {
  await seededDb();
  const a = ok(await structure.createGroup(HOLLOW, 'Book One'));
  const b = ok(await structure.createGroup(HOLLOW, 'Part I'));
  const c = ok(await structure.createGroup(HOLLOW, 'Book Two'));
  moved(await structure.moveChapter(CH(1), b.id, null, HOLLOW));

  moved(await structure.moveGroup(b.id, a.id, null, HOLLOW)); // Part I into Book One
  let { manuscript } = await shell();
  let flat = flatOutline(manuscript.outline);
  assert.ok(flat.includes(`group:${b.id}@1`) && flat.includes(`chapter:${CH(1)}@2`), flat.join(' '));

  moved(await structure.moveGroup(b.id, c.id, 0, HOLLOW)); // … then into Book Two
  ({ manuscript } = await shell());
  flat = flatOutline(manuscript.outline);
  assert.equal(flat[flat.indexOf(`group:${c.id}@0`) + 1], `group:${b.id}@1`);
  assert.equal(flat[flat.indexOf(`group:${b.id}@1`) + 1], `chapter:${CH(1)}@2`);

  moved(await structure.moveGroup(c.id, a.id, null, HOLLOW)); // a Group with a Group inside it, nested again
  ({ manuscript } = await shell());
  flat = flatOutline(manuscript.outline);
  assert.ok(flat.includes(`group:${c.id}@1`) && flat.includes(`group:${b.id}@2`) && flat.includes(`chapter:${CH(1)}@3`));

  moved(await structure.moveGroup(b.id, null, null, HOLLOW)); // back out to the top level, last
  ({ manuscript } = await shell());
  assert.equal(manuscript.outline.at(-1).group?.id, b.id);
});

test('a Group can never move into itself or a Group inside it — refused, nothing changed; another writer cannot move it', async () => {
  const db = await seededDb();
  const outer = ok(await structure.createGroup(HOLLOW, 'Outer'));
  const middle = ok(await structure.createGroup(HOLLOW, 'Middle', outer.id));
  const inner = ok(await structure.createGroup(HOLLOW, 'Inner', middle.id));
  const snapshot = async () => ({
    groups: await all(db, `select * from public.manuscript_groups order by id`),
    chapters: await all(db, `select * from public.chapters order by id`),
  });
  const before = await snapshot();

  assert.equal((await structure.moveGroup(outer.id, outer.id, null, HOLLOW)).error, 'A Group cannot move inside itself');
  assert.equal((await structure.moveGroup(outer.id, middle.id, null, HOLLOW)).error, 'A Group cannot move inside itself');
  assert.equal((await structure.moveGroup(outer.id, inner.id, 0, HOLLOW)).error, 'A Group cannot move inside itself');
  assert.equal((await structure.moveGroup(middle.id, inner.id, null, HOLLOW)).error, 'A Group cannot move inside itself');
  signIn(db, BRAM);
  assert.equal((await structure.moveGroup(inner.id, null, 0, HOLLOW)).error, 'Group not found');
  signIn(db, ALICE);
  assert.deepEqual(await snapshot(), before, 'a refused move changes nothing');

  // The navigator only offers places that make sense: never itself or a Group inside it, never where it is.
  const { manuscript } = await shell();
  assert.deepEqual([...nav.groupSubtreeIds(manuscript.outline, outer.id)].sort(), [outer.id, middle.id, inner.id].sort());
  const places = nav.groupDestinations(manuscript.outline, outer.id, null).map((d) => d.groupId);
  assert.deepEqual(places, [], 'Outer, at the top level with only its own Groups: nowhere else to go');
  const forInner = nav.groupDestinations(manuscript.outline, inner.id, middle.id).map((d) => d.groupId);
  assert.deepEqual(forInner, [null, outer.id], 'Inner: the top level or Outer — not Middle (where it is), not itself');
});

// ── 2. Drag auto-scroll ───────────────────────────────────────────────────────

test('auto-scroll speed: nothing mid-list; gentle at the zone, fastest at and just beyond the edge; up is negative', () => {
  const box = { top: 100, bottom: 660 };
  const speed = (y) => autoscroll.autoScrollSpeed(y, box);
  const { edge, maxSpeed, minSpeed, overshoot } = autoscroll.AUTO_SCROLL_DEFAULTS;
  assert.equal(speed(380), 0);
  assert.equal(speed(box.bottom - edge - 1), 0);
  const ramp = [box.bottom - edge + 1, box.bottom - edge / 2, box.bottom - 8, box.bottom - 1].map(speed);
  assert.ok(ramp[0] >= minSpeed && ramp[0] < ramp[1] && ramp[1] < ramp[2] && ramp[2] <= ramp[3], ramp.join(','));
  assert.equal(speed(box.bottom + 20), maxSpeed, 'just beyond the edge still scrolls, at full speed');
  assert.equal(speed(box.bottom + overshoot + 1), 0, 'far outside: no scroll');
  assert.ok(speed(box.top + 4) < 0 && speed(box.top - 30) === -maxSpeed, 'the top edge scrolls up');
  const reduced = autoscroll.autoScrollSpeed(box.bottom - 1, box, autoscroll.AUTO_SCROLL_REDUCED);
  assert.ok(reduced > 0 && reduced < maxSpeed, 'reduced motion: still scrolls, gently');
  assert.equal(autoscroll.autoScrollSpeed(50, { top: 40, bottom: 60 }), -autoscroll.autoScrollSpeed(50, { top: 40, bottom: 60 }) || 0);
});

/**
 * A navigator list driven the way useDragAutoScroll drives it: a dragover (the
 * pointer's position) each frame, frames run one by one.
 */
function dragList(rowCount, { rowH = 28, top = 100, height = 560 } = {}) {
  let scrollTop = 0;
  const queue = [];
  const frames = {
    request: (cb) => { queue.push(cb); return queue.length; },
    cancel: () => { queue.length = 0; },
  };
  const controller = autoscroll.createAutoScroll({
    box: () => ({ top, bottom: top + height }),
    scrollTop: () => scrollTop,
    maxScrollTop: () => Math.max(0, rowCount * rowH - height),
    scrollBy: (dy) => { scrollTop += dy; },
  }, frames);
  return {
    controller,
    queue,
    get scrollTop() { return scrollTop; },
    visible: (i) => i * rowH >= scrollTop && (i + 1) * rowH <= scrollTop + height,
    /** The row under a pointer at y. */
    rowAt: (y) => Math.floor((y - top + scrollTop) / rowH),
    /** Holds the pointer at y until `done()` or the list stops scrolling; returns the frames run. */
    hold(y, done, limit = 5000) {
      controller.update(y);
      let n = 0;
      while (!done() && queue.length > 0 && n < limit) {
        queue.shift()();
        controller.update(y);
        n++;
      }
      return n;
    },
    bottomEdge: top + height - 4,
    middle: top + height / 2,
  };
}

/** The navigator's rows in order, as it lists them with every Group open (Chapters' Scenes closed). */
function navigatorRows(manuscript) {
  const rows = [];
  const visit = (nodes) => nodes.forEach((n) => {
    if (n.kind === 'group') { rows.push(n.group.id); visit(n.children); } else rows.push(n.chapter.id);
  });
  visit(manuscript.outline);
  return rows;
}

async function longManuscript() {
  const db = await seededDb();
  // 36 Chapters: ch1–ch6 and "Chapter 7" … "Chapter 36".
  for (let n = 7; n <= 36; n++) ok(await chapters.createChapter(HOLLOW, `Chapter ${n}`));
  const { manuscript, index } = await shell();
  const byTitle = (title) => [...index.values()].find((e) => e.kind === 'chapter' && e.title === title);
  return { db, manuscript, index, ch30: byTitle('Chapter 30') };
}

test('a long-distance Scene drag: held at the edge, the list scrolls to Chapter 30, and the Scene lands there (place_scene)', async () => {
  const { db, manuscript, ch30 } = await longManuscript();
  const rows = navigatorRows(manuscript);
  const target = rows.indexOf(ch30.id);
  assert.ok(target * 28 > 560 + 200, 'Chapter 30 is far below the first screen');
  const list = dragList(rows.length);
  assert.equal(list.visible(target), false);

  const frames = list.hold(list.bottomEdge, () => list.visible(target));
  assert.ok(list.visible(target), `reached Chapter 30 in ${frames} frames`);
  assert.ok(frames < 400, 'at a useful speed');
  // The pointer goes to the row; the auto-scroll stops on its own (the row is mid-list).
  const y = 100 + target * 28 - list.scrollTop + 14;
  assert.equal(list.rowAt(y), target);
  list.hold(y, () => false);
  assert.equal(list.controller.active(), false);
  list.controller.stop();

  const scene = S('h1a');
  const before = await sceneState(db, scene);
  moved(await scenes.placeScene(scene, ch30.id, null));
  const after = await sceneState(db, scene);
  assert.equal(after.chapter_id, ch30.id);
  assert.deepEqual([after.id, after.content, after.word_count, after.title], [before.id, before.content, before.word_count, before.title]);
  const { index } = await shell();
  assert.deepEqual(index.get(ch30.id).sceneIds.at(-1), scene);
});

test('a long-distance Chapter drag and a Group drag: scrolled into reach, each lands through its atomic move', async () => {
  const { manuscript, index, ch30 } = await longManuscript();
  const rows = navigatorRows(manuscript);
  const list = dragList(rows.length);
  list.hold(list.bottomEdge, () => list.visible(rows.indexOf(ch30.id)));
  assert.ok(list.visible(rows.indexOf(ch30.id)));
  list.controller.stop();

  // Chapter 2, dropped just after Chapter 30.
  const places = nav.manuscriptPlaces(manuscript);
  const at = places.get(ch30.id);
  moved(await structure.moveChapter(CH(2), at.parentId, nav.indexBeside(at.siblings, CH(2), ch30.id, 'after'), HOLLOW));
  let shown = await shell();
  let order = navigatorRows(shown.manuscript);
  assert.equal(order[order.indexOf(ch30.id) + 1], CH(2));
  assert.equal(index.get(CH(2)).sceneIds[0], shown.index.get(CH(2)).sceneIds[0], 'its Scene came with it');

  // A Group at the top (holding Chapter 1), dragged the same way to just after Chapter 30.
  const g = ok(await structure.createGroup(HOLLOW, 'Prologue'));
  moved(await structure.moveGroup(g.id, null, 0, HOLLOW));
  moved(await structure.moveChapter(CH(1), g.id, null, HOLLOW));
  shown = await shell();
  const rows2 = navigatorRows(shown.manuscript);
  assert.equal(rows2[0], g.id);
  const list2 = dragList(rows2.length);
  list2.hold(list2.bottomEdge, () => list2.visible(rows2.indexOf(ch30.id)));
  assert.ok(list2.visible(rows2.indexOf(ch30.id)));
  list2.controller.stop();
  const at2 = nav.manuscriptPlaces(shown.manuscript).get(ch30.id);
  moved(await structure.moveGroup(g.id, at2.parentId, nav.indexBeside(at2.siblings, g.id, ch30.id, 'after'), HOLLOW));
  shown = await shell();
  order = navigatorRows(shown.manuscript);
  assert.deepEqual(order.slice(order.indexOf(ch30.id) + 1, order.indexOf(ch30.id) + 3), [g.id, CH(1)], 'the Group, with its Chapter');
});

test('auto-scroll stops: when the pointer leaves the zone, when the drag ends, and at the end of the list', () => {
  const list = dragList(200);
  list.hold(list.bottomEdge, () => list.scrollTop > 300);
  assert.equal(list.controller.active(), true, 'scrolling while held at the edge');

  // Out of the zone: the next frame stops, and nothing is scheduled.
  list.hold(list.middle, () => false);
  assert.equal(list.controller.active(), false);
  const still = list.scrollTop;
  assert.equal(list.queue.length, 0);

  // The drag ends mid-scroll: stopped at once; a stray frame changes nothing.
  list.controller.update(list.bottomEdge);
  assert.equal(list.controller.active(), true);
  list.controller.stop();
  assert.equal(list.controller.active(), false);
  assert.equal(list.queue.length, 0);
  assert.ok(list.scrollTop >= still);
  const afterStop = list.scrollTop;
  list.controller.stop();
  assert.equal(list.scrollTop, afterStop);

  // Held at the bottom edge until the list can go no further: never past its end.
  const frames = list.hold(list.bottomEdge, () => false);
  assert.ok(frames < 5000);
  assert.equal(list.scrollTop, 200 * 28 - 560, 'exactly at the end');
  assert.equal(list.controller.active(), false);
  // And up again from the top edge, never below zero.
  list.hold(104, () => false);
  assert.equal(list.scrollTop, 0);
});

// ── 3. Reading Mode ───────────────────────────────────────────────────────────

test('the whole manuscript reads in canonical order: Groups, Chapters, placed Scenes, breaks — never an Unplaced Scene', async () => {
  const db = await seededDb();
  const part = ok(await structure.createGroup(HOLLOW, 'Part One'));
  moved(await structure.moveGroup(part.id, null, 0, HOLLOW));
  moved(await structure.moveChapter(CH(1), part.id, null, HOLLOW));
  moved(await structure.moveChapter(CH(2), part.id, null, HOLLOW));
  const { manuscript, index } = await shell();
  const plan = readingModel.manuscriptReadingPlan(manuscript.outline, index);

  assert.deepEqual(plan.sceneIds, await canonicalPlacedOrder(db), 'the export\'s canonical order, exactly');
  assert.deepEqual(plan.sceneIds, [S('h1a'), S('h2a'), S('h3a'), S('h4a'), S('h4b'), S('h4c'), S('h6c')]);
  for (const id of manuscript.unplaced.map((s) => s.id)) assert.ok(!plan.sceneIds.includes(id), 'no Unplaced Scene');
  assert.equal(new Set(plan.sceneIds).size, plan.sceneIds.length, 'each Scene once');
  assert.equal(plan.words, manuscript.manuscriptWords, 'what is read is the manuscript total');

  const shape = plan.blocks.map((b) => (b.kind === 'scene' ? `s:${b.id}${b.breakBefore ? '*' : ''}` : `${b.kind[0]}:${b.id}`));
  assert.deepEqual(shape, [
    `g:${part.id}`, `c:${CH(1)}`, `s:${S('h1a')}`, `c:${CH(2)}`, `s:${S('h2a')}`,
    `c:${CH(3)}`, `s:${S('h3a')}`, `c:${CH(5)}`,
    `c:${CH(4)}`, `s:${S('h4a')}`, `s:${S('h4b')}*`, `s:${S('h4c')}*`,
    `c:${CH(6)}`, `s:${S('h6c')}`,
  ], 'breaks only between a Chapter\'s own Scenes; the empty Chapter still has its heading');
  assert.equal(plan.blocks.find((b) => b.id === CH(5)).sceneCount, 0);
  assert.equal(plan.blocks[0].title, 'Part One');

  // The rail: Groups and Chapters; Scenes only for a Chapter divided into Scenes.
  assert.deepEqual(plan.nav.map((r) => `${r.kind}:${r.id}@${r.depth}`), [
    `group:${part.id}@0`, `chapter:${CH(1)}@1`, `chapter:${CH(2)}@1`, `chapter:${CH(3)}@0`, `chapter:${CH(5)}@0`,
    `chapter:${CH(4)}@0`, `scene:${S('h4a')}@1`, `scene:${S('h4b')}@1`, `scene:${S('h4c')}@1`, `chapter:${CH(6)}@0`,
  ]);
});

test('Reading Mode navigation: the block at the reading line, the Scene read there, and the rail row that marks it', async () => {
  await seededDb();
  const { manuscript, index } = await shell();
  const plan = readingModel.manuscriptReadingPlan(manuscript.outline, index);
  const { blockAt, sceneAt, navRowFor } = readingModel;
  // Offsets as the surface measures them, 100px a block.
  const tops = plan.blocks.map((_, i) => i * 100);
  assert.equal(blockAt(tops, -5), -1);
  assert.equal(blockAt(tops, 0), 0);
  assert.equal(blockAt(tops, 250), 2);
  assert.equal(blockAt(tops, 1e9), plan.blocks.length - 1);
  const i = (id) => plan.blocks.findIndex((b) => b.id === id);

  assert.equal(sceneAt(plan.blocks, -1), S('h1a'), 'before the first block: the first Scene');
  assert.equal(sceneAt(plan.blocks, i(CH(3))), S('h3a'), 'on a Chapter heading: its first Scene');
  assert.equal(sceneAt(plan.blocks, i(CH(5))), null, 'an empty Chapter has no Scene');
  assert.equal(sceneAt(plan.blocks, i(S('h4b'))), S('h4b'));
  assert.equal(navRowFor(plan, i(S('h4b'))), S('h4b'), 'a divided Chapter\'s Scene is its own row');
  assert.equal(navRowFor(plan, i(S('h3a'))), CH(3), 'a Chapter read as one piece: the Chapter\'s row');
  assert.equal(readingModel.readingLocation(index, S('h4b')), `${index.get(CH(4)).title} · ${index.get(S('h4b')).title}`);
  assert.equal(readingModel.readingLocation(index, S('h3a')), index.get(CH(3)).title);
  assert.equal(readingModel.readingLocation(index, S('h3b')), `Unplaced · ${index.get(S('h3b')).title}`);
  assert.equal(readingModel.readingLocation(index, CH(3)), null, 'only a Scene has a reading location');

  // Tabs: one Reading tab per source; its key is never an object id.
  const key = readingModel.readingTabKey({ kind: 'view', viewId: 'v1' });
  assert.deepEqual(readingModel.readingSourceOf(key), { kind: 'view', viewId: 'v1' });
  assert.deepEqual(readingModel.readingSourceOf(readingModel.readingTabKey({ kind: 'manuscript' })), { kind: 'manuscript' });
  assert.equal(readingModel.readingSourceOf(S('h1a')), null);
  assert.equal(readingModel.readingSourceOf('root:manuscript'), null);
});

test('Reading Mode is read-only: its text renders with no editable surface, each Scene once, in order', async () => {
  await seededDb();
  const { manuscript, index } = await shell();
  const plan = readingModel.manuscriptReadingPlan(manuscript.outline, index);
  const texts = new Map(ok(await reading.getReadingScenes(HOLLOW, plan.sceneIds)).map((s) => [s.id, s.content]));
  const html = renderToStaticMarkup(readingDoc.ReadingDocument({ plan, texts }));
  assert.doesNotMatch(html, /contenteditable/i);
  assert.doesNotMatch(html, /<(textarea|input|select)\b/i);
  assert.doesNotMatch(html, /\bdraggable\b/i);
  const markers = [...html.matchAll(/fixture-marker-(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(markers, ['h1a', 'h2a', 'h3a', 'h4a', 'h4c', 'h6c'], 'every placed Scene with text, once, in order (h4b is empty)');
  assert.match(html, /Empty scene\./);
  for (const id of plan.sceneIds) assert.equal(html.split(`id="${readingDoc.readingAnchor(id)}"`).length, 2, 'one anchor per Scene');
});

test('Reading Mode reads the live Scene rows: only this Project\'s active Scenes, re-read after an edit, never copied', async () => {
  const db = await seededDb();
  const counts = async () => ({
    scenes: (await one(db, `select count(*)::int as n from public.scenes`)).n,
    documents: (await one(db, `select count(*)::int as n from public.workspace_documents`)).n,
  });
  const before = await counts();
  const state = await writingState(db);

  const read = ok(await reading.getReadingScenes(HOLLOW, [S('h1a'), S('h2a'), pageId('t1b')]));
  assert.deepEqual(read.map((s) => s.id).sort(), [S('h1a'), S('h2a')].sort(), 'another Project\'s Scene is never returned');
  assert.equal((await reading.getReadingScenes(HOLLOW, Array.from({ length: 61 }, () => S('h1a')))).error, 'Too many scenes in one request');
  assert.deepEqual(await writingState(db), state, 'reading writes nothing');

  // The writer edits a Scene in the editor, then comes back to Reading Mode.
  const v1 = ok(await reading.getReadingVersions(HOLLOW));
  const { version } = await sceneState(db, S('h2a'));
  const r = await scenes.syncSceneWithLimitCheck(S('h2a'), doc('The river turned at dawn.'), 5, version);
  assert.equal(r.status, 'ok');
  const v2 = ok(await reading.getReadingVersions(HOLLOW));
  const changed = v2.filter((v) => v1.find((o) => o.id === v.id)?.version !== v.version).map((v) => v.id);
  assert.deepEqual(changed, [S('h2a')], 'only the edited Scene needs reading again');
  const [again] = ok(await reading.getReadingScenes(HOLLOW, [S('h2a')]));
  assert.deepEqual(again.content, doc('The river turned at dawn.'), 'the current canonical text');
  assert.deepEqual(await counts(), before, 'no Scene was created: Reading Mode holds no copy');

  // Trash: gone from reading at once.
  ok(await trash.trashWorkspaceObject('scene', S('h1a')));
  assert.deepEqual(ok(await reading.getReadingScenes(HOLLOW, [S('h1a')])), []);
  const { manuscript, index } = await shell();
  assert.ok(!readingModel.manuscriptReadingPlan(manuscript.outline, index).sceneIds.includes(S('h1a')));

  signIn(db, BRAM);
  assert.equal((await reading.getReadingScenes(HOLLOW, [S('h2a')])).error, 'Project not found');
});

test('"Edit" from Reading Mode opens the canonical Scene: a Chapter read as one piece opens its Chapter, else the Scene itself', async () => {
  await seededDb();
  const { index } = await shell();
  assert.equal(refsModel.openableId(index, S('h1a')), CH(1), 'ch1\'s only Scene: its Chapter, whose writing surface is that Scene');
  assert.deepEqual(index.get(CH(1)).sceneIds, [S('h1a')]);
  assert.equal(refsModel.openableId(index, S('h4b')), S('h4b'), 'a Scene of a divided Chapter opens itself');
  assert.equal(index.get(S('h4b')).kind, 'scene');
});

// ── 4. Reading a Scene View ───────────────────────────────────────────────────

/** A Scene View arranged exactly as the shell arranges it (useSceneItems), over the database's values. */
async function arrangedView(db, view) {
  const { manuscript, index } = await shell();
  const properties = [
    ...(await all(db, `select * from public.scene_property_definitions order by position`)),
    ...sceneModel.sceneNativeProperties(view.manuscript_id, HOLLOW),
  ];
  const order = sceneModel.manuscriptSceneOrder(index);
  const sceneIds = [...order.placed, ...order.unplaced];
  const values = new Map((await all(db, `select scene_id, property_id, value from public.scene_property_values`))
    .map((v) => [propModel.valueKey(v.scene_id, v.property_id), v.value]));
  for (const [k, v] of sceneModel.sceneNativeValues(index, sceneIds)) values.set(k, v);
  const arranged = viewModel.arrangeItems(view, {
    entryIds: sceneIds, properties, values, titleOf: (id) => sceneModel.sceneViewLabel(index, id)?.title ?? '',
  });
  return { manuscript, index, properties, arranged, sorted: readingModel.viewIsSorted(view, properties) };
}

async function statusSetup() {
  const db = await seededDb();
  let status = ok(await props.createSceneProperty(HOLLOW, 'Status', 'status'));
  status = ok(await props.updateSceneProperty(status.id, { options: [{ name: 'Drafting' }, { name: 'Needs Revision' }, { name: 'Done' }] })).property;
  const opt = Object.fromEntries(status.options.map((o) => [o.name, o.id]));
  for (const [label, name] of [['h4c', 'Needs Revision'], ['h1a', 'Needs Revision'], ['h3b', 'Needs Revision'], ['h6c', 'Needs Revision'], ['h2a', 'Done'], ['h4a', 'Drafting']]) {
    ok(await props.setScenePropertyValue(S(label), status.id, opt[name]));
  }
  return { db, status, opt };
}

test('a Scene View read: exactly its Scenes, in manuscript order under their headings, Unplaced apart — each once, by canonical id', async () => {
  const { db, status, opt } = await statusSetup();
  const view = ok(await views.createSceneView(HOLLOW, 'Needs revision', 'list', {
    properties: [], sort: null, filters: [{ property: status.id, op: 'is', value: opt['Needs Revision'] }], group_by: null,
  }));
  const { index, properties, arranged, sorted } = await arrangedView(db, view);
  assert.equal(sorted, false);
  const plan = readingModel.viewReadingPlan([...arranged, ...arranged], index, sorted);

  assert.deepEqual(plan.sceneIds, [S('h1a'), S('h4c'), S('h6c'), S('h3b')], 'the matching Scenes, placed in reading order, then Unplaced');
  assert.equal(new Set(plan.sceneIds).size, plan.sceneIds.length, 'never duplicated, even if asked twice');
  const shape = plan.blocks.map((b) => (b.kind === 'scene' ? `s:${b.id}${b.breakBefore ? '*' : ''}` : `${b.kind[0]}:${b.id}`));
  assert.deepEqual(shape, [`c:${CH(1)}`, `s:${S('h1a')}`, `c:${CH(4)}`, `s:${S('h4c')}`, `c:${CH(6)}`, `s:${S('h6c')}`, 'u:unplaced', `s:${S('h3b')}`],
    'only the Chapters holding a match get a heading');
  assert.deepEqual(readingModel.describeViewFilters(view, properties, () => null), ['Status is Needs Revision'], 'the active filter, said plainly');

  // The text read is each Scene's own row: same ids, same content.
  const texts = ok(await reading.getReadingScenes(HOLLOW, plan.sceneIds));
  for (const s of texts) {
    const row = await sceneState(db, s.id);
    assert.deepEqual(s.content, row.content);
  }
  // Opening one from the reading: the real Scene.
  assert.equal(refsModel.openableId(index, S('h4c')), S('h4c'));

  // Trash: a trashed match drops out of the View and the reading.
  ok(await trash.trashWorkspaceObject('scene', S('h4c')));
  const after = await arrangedView(db, view);
  const plan2 = readingModel.viewReadingPlan(after.arranged, after.index, after.sorted);
  assert.deepEqual(plan2.sceneIds, [S('h1a'), S('h6c'), S('h3b')]);
});

test('a sorted Scene View reads in the View\'s own order, each Scene saying where it lives; a sort on a missing property falls back to manuscript order', async () => {
  const { db, status } = await statusSetup();
  const view = ok(await views.createSceneView(HOLLOW, 'By status', 'table', {
    properties: [], sort: { by: status.id, direction: 'asc' }, filters: [{ property: status.id, op: 'is_not_empty' }], group_by: null,
  }));
  const { index, arranged, sorted } = await arrangedView(db, view);
  assert.equal(sorted, true);
  const plan = readingModel.viewReadingPlan(arranged, index, sorted);
  assert.deepEqual(plan.sceneIds, arranged, 'the View\'s order, untouched');
  assert.ok(plan.blocks.every((b) => b.kind === 'scene'), 'no headings: the View\'s order is not the manuscript\'s');
  assert.ok(plan.blocks.every((b) => b.context), 'each Scene says where it lives');
  assert.equal(plan.blocks.find((b) => b.id === S('h3b')).context, `Unplaced · ${index.get(S('h3b')).title}`);

  const orphan = { ...view, config: { ...view.config, sort: { by: 'no-such-property', direction: 'asc' } } };
  assert.equal(readingModel.viewIsSorted(orphan, (await arrangedView(db, view)).properties), false);
});

// ── 5. Scene revision notes ───────────────────────────────────────────────────

test('a Scene note is created, edited and removed through its one function; a stale save never overwrites a newer note', async () => {
  const db = await seededDb();
  const id = S('h4a');
  assert.equal(ok(await notes.getSceneNote(id)), null);

  let r = await notes.saveSceneNote(id, 'Nerai’s motive is unclear here.', 0);
  assert.equal(r.status, 'ok');
  assert.equal(r.note.version, 1);
  assert.deepEqual(plainNote(ok(await notes.getSceneNote(id))), plainNote(r.note));
  r = await notes.saveSceneNote(id, 'Nerai’s motive is unclear here.\nCut the second storm.', 1);
  assert.equal(r.note.version, 2);

  // Another window saved in between: refused, with what is stored.
  const stale = await notes.saveSceneNote(id, 'An older edit', 1);
  assert.equal(stale.status, 'conflict');
  assert.equal(stale.note.body, 'Nerai’s motive is unclear here.\nCut the second storm.');
  assert.equal((await noteRow(db, id)).version, 2, 'nothing written');
  assert.equal((await notes.saveSceneNote(id, 'first', 0)).status, 'conflict', '"there was no note" is stale too');
  // The writer chooses to keep theirs.
  r = await notes.saveSceneNote(id, 'Keep mine', null);
  assert.deepEqual([r.status, r.note.body, r.note.version], ['ok', 'Keep mine', 3]);

  // A blank note is no note.
  r = await notes.saveSceneNote(id, '   \n\t ', 3);
  assert.deepEqual(r, { status: 'ok', note: null });
  assert.equal(await noteRow(db, id), undefined);
  assert.equal(notesModel.noteIsBlank(' \n'), true);
  assert.equal(notesModel.noteBaseVersion(null), 0);

  assert.equal((await notes.saveSceneNote(id, 'x'.repeat(20001), 0)).status, 'error');
  assert.equal(notesModel.noteExcerpt('First line that is long\nsecond', 10), 'First lin…');
});

test('writing a Scene note changes nothing about the Scene or the writing record: version, words, history, sessions, totals', async () => {
  const db = await seededDb();
  const before = await writingState(db);
  for (const [label, body] of [['h1a', 'a'], ['h1a', 'a longer note with many words in it'], ['h3b', 'unplaced note'], ['h4b', 'empty scene note']]) {
    const current = await notes.getSceneNote(S(label));
    assert.equal((await notes.saveSceneNote(S(label), body, notesModel.noteBaseVersion(current.data))).status, 'ok');
  }
  assert.equal((await notes.saveSceneNote(S('h1a'), '', 2)).status, 'ok');
  assert.deepEqual(await writingState(db), before);
  assert.equal(ok(await reading.getReadingVersions(HOLLOW)).find((v) => v.id === S('h4b')).version,
    before.scenes.find((s) => s.id === S('h4b')).version, 'Reading Mode sees no change to re-read');

  // Not searched as prose, not exported.
  const found = ok(await search.searchProjectContent(HOLLOW, 'unplaced note'));
  assert.deepEqual(found, [], 'a note is not manuscript text');
  const { chapters: rows, scenesPerChapter, groups } = await exporter.loadManuscriptForExport(createSupabaseAdapter(db, { userId: ALICE }), HOLLOW);
  const exported = JSON.stringify(exporter.planManuscriptExport(rows, scenesPerChapter, groups));
  assert.doesNotMatch(exported, /empty scene note|unplaced note/);
});

test('a note follows its Scene: between Chapters, to Unplaced and back, reordered — the same row every time', async () => {
  const db = await seededDb();
  const id = S('h4c');
  const saved = (await notes.saveSceneNote(id, 'Tighten the ending.', 0)).note;
  const row = await noteRow(db, id);
  assert.equal(row.manuscript_id, (await one(db, `select manuscript_id from public.scenes where id = $1`, [id])).manuscript_id);
  const same = async () => {
    assert.deepEqual(await noteRow(db, id), row);
    assert.deepEqual(plainNote(ok(await notes.getSceneNote(id))), plainNote(saved));
  };
  moved(await scenes.placeScene(id, CH(2), 0));
  assert.equal((await sceneState(db, id)).chapter_id, CH(2));
  await same();
  moved(await scenes.moveSceneToUnplaced(id));
  assert.equal((await sceneState(db, id)).chapter_id, null);
  await same();
  assert.ok(ok(await notes.listSceneNotes(HOLLOW)).some((n) => n.scene_id === id), 'an Unplaced Scene keeps its note');
  moved(await scenes.placeScene(id, CH(6), null));
  moved(await scenes.placeScene(id, CH(6), 0));
  await same();
  // A Chapter moving (into a Group) carries its Scenes' notes with it.
  const g = ok(await structure.createGroup(HOLLOW, 'Part'));
  moved(await structure.moveChapter(CH(6), g.id, null, HOLLOW));
  await same();
});

test('Trash and restore keep a note (hidden and unwritable while trashed); a Chapter going with its Scenes too; permanent deletion removes it', async () => {
  const db = await seededDb();
  const id = S('h1a');
  await notes.saveSceneNote(id, 'Open on the bell, not the rain.', 0);
  ok(await trash.trashWorkspaceObject('scene', id));
  assert.equal(ok(await notes.getSceneNote(id)), null, 'hidden while in Trash');
  assert.ok(!ok(await notes.listSceneNotes(HOLLOW)).some((n) => n.scene_id === id));
  assert.deepEqual(await notes.saveSceneNote(id, 'x', 1), { status: 'error', error: 'Scene not found' });
  assert.equal((await noteRow(db, id)).body, 'Open on the bell, not the rain.', 'kept, untouched');
  ok(await trash.restoreWorkspaceObject('scene', id));
  assert.equal(ok(await notes.getSceneNote(id)).body, 'Open on the bell, not the rain.');

  // A Chapter to Trash with its Scenes, and back.
  const inChapter = S('h4b');
  await notes.saveSceneNote(inChapter, 'Write this one.', 0);
  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  assert.equal(ok(await notes.getSceneNote(inChapter)), null);
  ok(await trash.restoreWorkspaceObject('chapter', CH(4)));
  assert.equal(ok(await notes.getSceneNote(inChapter)).version, 1);

  // Permanently deleting the Scene deletes its note — and only its note.
  ok(await trash.trashWorkspaceObject('scene', id));
  ok(await trash.deleteTrashedWorkspaceObject('scene', id));
  assert.equal(await noteRow(db, id), undefined);
  assert.equal((await noteRow(db, inChapter)).body, 'Write this one.');
  // And a Chapter deleted permanently takes its Scenes' notes.
  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  ok(await trash.deleteTrashedWorkspaceObject('chapter', CH(4)));
  assert.equal(await noteRow(db, inChapter), undefined);
});

test('notes are the owner\'s alone: another writer can neither read nor write them; clients cannot write the table directly', async () => {
  const db = await seededDb();
  await notes.saveSceneNote(S('h2a'), 'private', 0);
  const bram = signIn(db, BRAM);
  assert.equal(ok(await notes.getSceneNote(S('h2a'))), null);
  assert.deepEqual(await notes.saveSceneNote(S('h2a'), 'mine now', null), { status: 'error', error: 'Scene not found' });
  assert.equal((await notes.listSceneNotes(HOLLOW)).error, 'Project not found');
  const direct = await bram.from('scene_revision_notes').insert({ scene_id: pageId('t1b'), manuscript_id: (await one(db, `select manuscript_id from public.scenes where id = $1`, [pageId('t1b')])).manuscript_id, body: 'x' });
  assert.match(direct.error?.message ?? '', /permission denied/);
  const alice = signIn(db, ALICE);
  const update = await alice.from('scene_revision_notes').update({ body: 'changed' }).eq('scene_id', S('h2a'));
  assert.match(update.error?.message ?? '', /permission denied/);
  assert.equal((await noteRow(db, S('h2a'))).body, 'private');
});

test('Reading Mode can write the note of the Scene being read, and its marks see it', async () => {
  const db = await seededDb();
  const { manuscript, index } = await shell();
  const plan = readingModel.manuscriptReadingPlan(manuscript.outline, index);
  const at = plan.blocks.findIndex((b) => b.id === CH(4));
  const current = readingModel.sceneAt(plan.blocks, at);
  assert.equal(current, S('h4a'), 'reading Chapter 4\'s heading: its first Scene');
  const before = await sceneState(db, current);
  assert.equal((await notes.saveSceneNote(current, 'The storm repeats chapter 2.', 0)).status, 'ok');
  const marks = new Set(ok(await notes.listSceneNotes(HOLLOW)).map((n) => n.scene_id));
  assert.ok(marks.has(current));
  assert.deepEqual(await sceneState(db, current), before);
});
