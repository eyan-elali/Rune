// Manuscript workflow (Rune 2.0, pre-Milestone 18 cleanup, migration 037):
// the REAL actions, loaders and pure rules against the Rune 2.0 schema in real
// Postgres + RLS.
//
//   * Milestone navigation: the snapshot's navigator (Groups, Chapters,
//     Scenes, Unplaced Scenes), jumping to a Chapter or Scene, and the
//     Milestones that hold a live Scene or Chapter (Inspector) — read-only,
//     no live row changes
//   * movement: Chapters among siblings and into / out of / between Groups;
//     Scenes within a Chapter, between Chapters, to and from Unplaced, and
//     among the Unplaced Scenes — same ids, prose, history, properties,
//     references and writing history; no words counted as written
//   * Trash: placed and Unplaced Scenes; a Chapter with its Scenes as one
//     unit, restored in place or safely elsewhere; permanent deletion only
//     from Trash; "remove chapter, keep its scenes" kept apart from deletion
//   * no free-word limit: writing, creation, import, duplication and history
//     restore are never gated; ordinary counts still behave
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// (starter_2k, free, already OVER the old 2,000-word allowance) owns hollow;
// bram owns tide. In hollow, reading order: ch1 [h1a 120], ch2 [h2a 300],
// ch3 [h3a 410], ch5 [], ch4 [h4a 200, h4b 0, h4c 150], ch6 [h6c 270];
// Unplaced: h3b 380, h3c 95, h6a 250, h6b 260. h3b and h4c have writing sessions.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, asUser, createAuthUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const DANA = 'aaaaaaaa-0000-4000-8000-0000000000d5';
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');
const CH = (n) => chapterId(`hollow.ch${n}`);

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});
const words = (...paragraphs) => paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
const uuid = () => crypto.randomUUID();

let legacy;
let milestones, history, scenes, chapters, structure, trash, refs, collections, props, projects, manuscriptLoader, workspaceLoader;
let model, nav, trashModel, importRoute;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  milestones = await bundleForTest('src/lib/actions/manuscriptMilestones.ts', { name: 'mw_milestones' });
  history = await bundleForTest('src/lib/actions/sceneHistory.ts', { name: 'mw_history' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'mw_scenes' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'mw_chapters' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'mw_structure' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'mw_trash' });
  refs = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'mw_refs' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'mw_collections' });
  props = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'mw_props' });
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'mw_projects' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'mw_manuscript' });
  workspaceLoader = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'mw_workspace' });
  importRoute = await bundleForTest('src/app/api/manuscript-import/route.ts', { name: 'mw_import' });
  model = await bundleForTest('src/lib/rune2/history.ts', { name: 'mw_model' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'mw_nav' });
  trashModel = await bundleForTest('src/lib/rune2/trash.ts', { name: 'mw_trash_model' });
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
  for (const mod of [milestones, history, scenes, chapters, structure, trash, refs, collections, props, projects, manuscriptLoader, workspaceLoader, importRoute]) {
    mod.setServerClient(sb);
  }
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const refused = (r, message) => { assert.equal(r.data ?? null, null); if (message) assert.equal(r.error, message); else assert.ok(r.error); };
const moved = (r) => assert.equal(r.error, null, r.error);

const sceneRow = (db, id) => one(db, `select id, manuscript_id, chapter_id, title, content, word_count, position, version, updated_at, trashed_at, trashed_from_chapter_id, trashed_with_chapter
  from public.scenes where id = $1`, [id]);
/** What a move or Trash must never change about a Scene. */
const keep = ({ id, manuscript_id, title, content, word_count }) => ({ id, manuscript_id, title, content, word_count });
const projectWords = async (db, id = HOLLOW) => (await one(db, `select word_count from public.projects where id = $1`, [id])).word_count;
const sessions = (db) => all(db, `select id, user_id, project_id, scene_id, session_date, words_added from public.writing_sessions order by id`);
const revisions = (db) => all(db, `select id, scene_id, content, word_count, reason from public.scene_revisions order by id`);

/** The manuscript as the shell shows it: Chapters in reading order with their Scenes, Unplaced, totals. */
async function shown(projectId = HOLLOW) {
  const m = await manuscriptLoader.loadProjectManuscript(projectId);
  const order = [];
  const visit = (nodes, group) => nodes.forEach((n) => (n.kind === 'group'
    ? visit(n.children, n.group.id)
    : order.push({ id: n.chapter.id, group, scenes: n.chapter.scenes.map((s) => s.id) })));
  visit(m.outline, null);
  return {
    chapters: order.map((c) => c.id),
    groupOf: Object.fromEntries(order.map((c) => [c.id, c.group])),
    scenesOf: Object.fromEntries(order.map((c) => [c.id, c.scenes])),
    unplaced: m.unplaced.map((s) => s.id),
    manuscriptWords: m.manuscriptWords,
    unplacedWords: m.unplacedWords,
    manuscript: m,
  };
}

/** Every live manuscript row, for "nothing changed" comparisons. */
async function liveState(db) {
  return {
    projects: await all(db, `select id, word_count, updated_at from public.projects order by id`),
    groups: await all(db, `select * from public.manuscript_groups order by id`),
    chapters: await all(db, `select * from public.chapters order by id`),
    scenes: await all(db, `select * from public.scenes order by id`),
    sessions: await sessions(db),
    references: await all(db, `select * from public.object_references order by id`),
    values: await all(db, `select * from public.scene_property_values order by scene_id, property_id`),
    events: await all(db, `select * from public.analytics_events order by id`),
  };
}

/** A Scene with everything that must survive a move or Trash: a property value, a reference both ways, history. */
async function furnish(db, sceneId) {
  const people = ok(await collections.createWorkspaceCollection(HOLLOW, 'People')).collection;
  const nerai = ok(await collections.createCollectionEntry(people.id, 'Nerai'));
  const appears = ok(await refs.createRelationshipProperty(people.id, 'Appears in', 'scene', null, true));
  ok(await refs.setEntryRelationship(nerai.id, appears.id, [sceneId]));
  ok(await refs.addObjectReference('scene', sceneId, 'entry', nerai.id));
  const pov = ok(await props.createSceneProperty(HOLLOW, 'POV', 'text'));
  ok(await props.setScenePropertyValue(sceneId, pov.id, 'Nerai'));
  // A checkpoint: the fixture text, kept by the next save after a long pause.
  const { version } = await sceneRow(db, sceneId);
  const r = await scenes.syncSceneWithLimitCheck(sceneId, doc('The tide came in grey.'), 5, version);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  return { nerai, appears, pov };
}

async function attachments(db, sceneId) {
  return {
    references: await all(db, `select id, source_type, target_type, source_scene_id, target_scene_id, property_id from public.object_references
      where source_scene_id = $1 or target_scene_id = $1 order by id`, [sceneId]),
    values: await all(db, `select property_id, value from public.scene_property_values where scene_id = $1 order by property_id`, [sceneId]),
    history: await all(db, `select id, content, word_count, reason from public.scene_revisions where scene_id = $1 order by id`, [sceneId]),
    sessions: await all(db, `select id, session_date, words_added from public.writing_sessions where scene_id = $1 order by id`, [sceneId]),
  };
}

// ── 1. Milestone navigation ─────────────────────────────────────────────────────

test('Milestone navigator: the snapshot’s Groups, Chapters, divided Chapters’ Scenes and Unplaced Scenes, in reading order', async () => {
  const db = await seededDb();
  const part = ok(await structure.createGroup(HOLLOW, 'Part One'));
  moved(await structure.moveChapter(CH(3), part.id, null, HOLLOW));
  moved(await structure.moveChapter(CH(4), part.id, null, HOLLOW));
  ok(await scenes.renameScene(pageId('h4a'), 'The quay'));
  // An unnamed Scene is labelled by its place ("Scene 2"), never stored.
  await db.query(`update public.scenes set title = '' where id = $1`, [pageId('h4b')]);
  const { id } = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  const snap = ok(await milestones.getManuscriptMilestone(id));
  const rows = model.milestoneNavigator(model.milestoneReadingOrder(snap));
  // The Group was added at the end of the top level; ch3 and ch4 were moved into it.
  assert.deepEqual(rows.map((r) => r.kind).filter((k) => k !== 'scene'), [
    'chapter', 'chapter', 'chapter', 'chapter', 'group', 'chapter', 'chapter', 'unplacedHeading',
  ]);
  assert.deepEqual(rows.filter((r) => r.kind === 'chapter').map((r) => r.id), [CH(1), CH(2), CH(5), CH(6), CH(3), CH(4)]);
  assert.deepEqual(rows.find((r) => r.kind === 'group'), { kind: 'group', id: part.id, label: 'Part One', depth: 0 });
  assert.deepEqual(rows.filter((r) => r.kind === 'chapter' && r.depth === 1).map((r) => r.id), [CH(3), CH(4)]);
  // Only a divided Chapter lists its Scenes: ch4, with its unnamed Scenes labelled by position.
  const ch4Scenes = rows.filter((r) => r.kind === 'scene' && r.chapterId === CH(4));
  assert.deepEqual(ch4Scenes.map((r) => [r.id, r.label, r.depth, r.words]), [
    [pageId('h4a'), 'The quay', 2, 200], [pageId('h4b'), 'Scene 2', 2, 0], [pageId('h4c'), (await sceneRow(db, pageId('h4c'))).title, 2, 150],
  ]);
  assert.equal(rows.filter((r) => r.kind === 'scene' && r.chapterId === CH(1)).length, 0, 'a one-Scene Chapter reads as the Chapter');
  // Unplaced Scenes after a heading, none of them in a Chapter.
  const heading = rows.findIndex((r) => r.kind === 'unplacedHeading');
  assert.deepEqual(rows.slice(heading + 1).map((r) => [r.kind, r.chapterId, r.depth]), Array(4).fill(['scene', null, 1]));
  assert.deepEqual(new Set(rows.slice(heading + 1).map((r) => r.id)), new Set([pageId('h3b'), pageId('h3c'), pageId('h6a'), pageId('h6b')]));
  // Every place has its own anchor.
  const anchors = rows.filter((r) => r.kind === 'chapter' || r.kind === 'scene').map((r) => model.milestoneAnchor({ kind: r.kind, id: r.id }));
  assert.equal(new Set(anchors).size, anchors.length);
  assert.equal(model.milestoneAnchor({ kind: 'scene', id: pageId('h3b') }), `r2-milestone-scene-${pageId('h3b')}`);
});

test('Milestone jump targets: a Chapter, a placed Scene, an Unplaced Scene — present; something made later — absent', async () => {
  const db = await seededDb();
  const { id } = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  const later = ok(await scenes.createUnplacedScene(HOLLOW, 'Later'));
  const snap = ok(await milestones.getManuscriptMilestone(id));
  assert.equal(model.milestoneHas(snap, { kind: 'chapter', id: CH(4) }), true);
  assert.equal(model.milestoneHas(snap, { kind: 'chapter', id: CH(5) }), true, 'an empty Chapter is still a place');
  assert.equal(model.milestoneHas(snap, { kind: 'scene', id: pageId('h4c') }), true);
  assert.equal(model.milestoneHas(snap, { kind: 'scene', id: pageId('h1a') }), true, 'a one-Scene Chapter’s Scene is anchored too');
  assert.equal(model.milestoneHas(snap, { kind: 'scene', id: pageId('h6a') }), true, 'Unplaced');
  assert.equal(model.milestoneHas(snap, { kind: 'scene', id: later.id }), false);
  assert.equal(model.milestoneHas(snap, { kind: 'chapter', id: pageId('h4c') }), false, 'kinds are not confused');
});

test('Inspector: the Milestones that hold a Scene — with where it was — apart from its automatic History; opening them changes nothing', async () => {
  const db = await seededDb();
  const first = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  moved(await scenes.placeScene(pageId('h4a'), null, 0));
  const second = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Before rewrite'));
  moved(await scenes.placeScene(pageId('h4a'), CH(1), null));
  ok(await milestones.createManuscriptMilestone(HOLLOW, 'Sent to editor'));
  const before = await liveState(db);

  const list = ok(await milestones.listObjectMilestones('scene', pageId('h4a')));
  assert.deepEqual(list.map((m) => m.name), ['Sent to editor', 'Before rewrite', 'Draft 1'], 'newest first');
  const [sent, rewrite, draft] = list;
  assert.deepEqual([draft.chapter_id, draft.chapter_title, draft.word_count], [CH(4), (await one(db, `select title from public.chapters where id = $1`, [CH(4)])).title, 200]);
  assert.deepEqual([rewrite.chapter_id, rewrite.chapter_title], [null, null], 'Unplaced then');
  assert.equal(sent.chapter_id, CH(1));
  assert.equal(model.objectMilestonePlace('scene', rewrite), 'unplaced · 200 words');
  assert.match(model.objectMilestonePlace('scene', draft), /^in .+ · 200 words$/);
  assert.equal(draft.id, first.id);
  assert.equal(rewrite.id, second.id);

  // Opening the Milestone at that Scene reads the snapshot; the Scene is there, in its Chapter then.
  const snap = ok(await milestones.getManuscriptMilestone(draft.id));
  assert.equal(snap.scenes.find((s) => s.scene_id === pageId('h4a')).chapter_id, CH(4));
  assert.equal(model.milestoneHas(snap, { kind: 'scene', id: pageId('h4a') }), true);
  // Automatic history is a separate thing: the Scene's history still lists its versions, each
  // Milestone's text marked by name, and reading it changes nothing either.
  const h = ok(await history.listSceneHistory(pageId('h4a')));
  assert.ok(h.revisions.some((r) => r.milestones.includes('Draft 1')));
  assert.deepEqual(await liveState(db), before, 'listing and opening change no live row');
  // A Scene in no Milestone yet.
  const fresh = ok(await scenes.createUnplacedScene(HOLLOW, 'Fresh'));
  assert.deepEqual(ok(await milestones.listObjectMilestones('scene', fresh.id)), []);
});

test('Inspector: the Milestones that hold a Chapter — its title, Scenes and words then — and a Chapter made later is in none', async () => {
  const db = await seededDb();
  const { id } = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  ok(await chapters.updateChapter(CH(4), { title: 'The Harbour' }, HOLLOW));
  moved(await scenes.placeScene(pageId('h4c'), null, null));
  ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 2'));
  const newer = ok(await chapters.createChapter(HOLLOW, 'Coda'));
  const before = await liveState(db);

  const list = ok(await milestones.listObjectMilestones('chapter', CH(4)));
  assert.deepEqual(list.map((m) => [m.name, m.chapter_title, m.scene_count, m.word_count]), [
    ['Draft 2', 'The Harbour', 2, 200],
    ['Draft 1', list[1].chapter_title, 3, 350],
  ]);
  assert.notEqual(list[1].chapter_title, 'The Harbour', 'its title as it was then');
  assert.equal(model.objectMilestonePlace('chapter', list[1]), '3 scenes · 350 words');
  const snap = ok(await milestones.getManuscriptMilestone(id));
  assert.equal(model.milestoneHas(snap, { kind: 'chapter', id: CH(4) }), true);
  assert.deepEqual(ok(await milestones.listObjectMilestones('chapter', newer.id)), []);
  assert.deepEqual(await liveState(db), before);
});

test('Milestone lookups are the owner’s only, and unknown kinds are refused', async () => {
  const db = await seededDb();
  ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  signIn(db, BRAM);
  refused(await milestones.listObjectMilestones('scene', pageId('h4a')), 'Scene not found');
  refused(await milestones.listObjectMilestones('chapter', CH(4)), 'Chapter not found');
  signIn(db, ALICE);
  refused(await milestones.listObjectMilestones('page', pageId('h4a')), 'Unknown item type');
  const anon = await createSupabaseAdapter(db, { role: 'anon' }).rpc('list_object_milestones', { p_type: 'scene', p_id: pageId('h4a') });
  assert.ok(anon.error, 'anon cannot call it');
});

// ── 2. Movement ─────────────────────────────────────────────────────────────────

test('Chapters: reorder among siblings, into a Group, between Groups and back out — same rows, totals unchanged', async () => {
  const db = await seededDb();
  const chaptersBefore = await all(db, `select id, title, manuscript_id, created_at from public.chapters order by id`);
  const words = await projectWords(db);
  let view = await shown();
  assert.deepEqual(view.chapters, [CH(1), CH(2), CH(3), CH(5), CH(4), CH(6)]);

  // Reorder: ch6 to the front; ch1 one step down.
  moved(await structure.moveChapter(CH(6), null, 0, HOLLOW));
  moved(await structure.moveChapter(CH(1), null, 2, HOLLOW));
  view = await shown();
  assert.deepEqual(view.chapters, [CH(6), CH(2), CH(1), CH(3), CH(5), CH(4)]);

  // Into a Group, between Groups, out again.
  const one_ = ok(await structure.createGroup(HOLLOW, 'Part One'));
  const two = ok(await structure.createGroup(HOLLOW, 'Part Two'));
  moved(await structure.moveChapter(CH(3), one_.id, null, HOLLOW));
  moved(await structure.moveChapter(CH(4), one_.id, 0, HOLLOW));
  view = await shown();
  assert.deepEqual([view.groupOf[CH(4)], view.groupOf[CH(3)]], [one_.id, one_.id]);
  moved(await structure.moveChapter(CH(4), two.id, null, HOLLOW));
  view = await shown();
  assert.equal(view.groupOf[CH(4)], two.id);
  moved(await structure.moveChapter(CH(3), null, 0, HOLLOW));
  view = await shown();
  assert.equal(view.groupOf[CH(3)], null);
  assert.equal(view.chapters[0], CH(3));

  assert.deepEqual(await all(db, `select id, title, manuscript_id, created_at from public.chapters order by id`), chaptersBefore, 'same Chapters, titles, owners');
  assert.deepEqual(view.scenesOf[CH(4)], [pageId('h4a'), pageId('h4b'), pageId('h4c')], 'its Scenes go with it');
  assert.equal(await projectWords(db), words, 'order never changes the total');
  // One sibling order: every active sibling has its own position.
  const dupes = await all(db, `select manuscript_id, group_id, position, count(*) from public.chapters where trashed_at is null
    group by 1, 2, 3 having count(*) > 1`);
  assert.deepEqual(dupes, []);
});

test('the navigator’s move rules: places, beside-a-row indexes, and destinations that would change something', async () => {
  const db = await seededDb();
  const part = ok(await structure.createGroup(HOLLOW, 'Part One'));
  moved(await structure.moveChapter(CH(4), part.id, null, HOLLOW));
  const { manuscript } = await shown();
  const places = nav.manuscriptPlaces(manuscript);
  assert.deepEqual(places.get(CH(4)), { parentId: part.id, siblings: [CH(4)], index: 0 });
  assert.deepEqual(places.get(pageId('h4c')), { parentId: CH(4), siblings: [pageId('h4a'), pageId('h4b'), pageId('h4c')], index: 2 });
  assert.equal(places.get(pageId('h3b')).parentId, null, 'an Unplaced Scene: no Chapter');
  assert.equal(places.get(CH(1)).siblings.includes(part.id), true, 'Groups and Chapters share one sibling order');

  assert.equal(nav.indexBeside(['a', 'b', 'c', 'd'], 'a', 'c', 'after'), 2, 'down past c');
  assert.equal(nav.indexBeside(['a', 'b', 'c', 'd'], 'd', 'b', 'before'), 1, 'up before b');
  assert.equal(nav.indexBeside(['a', 'b'], 'x', 'b', 'after'), 2, 'from elsewhere, after the last');

  assert.deepEqual(nav.chapterDestinations(manuscript.outline, part.id), [{ groupId: null, depth: 0 }]);
  assert.deepEqual(nav.chapterDestinations(manuscript.outline, null), [{ groupId: part.id, depth: 1 }]);
  const forScene = nav.sceneDestinations(manuscript.outline, CH(4));
  assert.equal(forScene.some((d) => d.chapterId === CH(4)), false, 'not where it is');
  assert.deepEqual(forScene.at(-1), { chapterId: null, depth: 0 }, 'Unplaced Scenes last');
  assert.equal(nav.sceneDestinations(manuscript.outline, null).some((d) => d.chapterId === null), false);
});

test('Scenes: reorder in a Chapter, move between Chapters at a place, to Unplaced, back into a Chapter, reorder Unplaced — nothing but placement changes', async () => {
  const db = await seededDb();
  const kept = await furnish(db, pageId('h4a'));
  const scene0 = await sceneRow(db, pageId('h4a'));
  const attached = await attachments(db, pageId('h4a'));
  assert.ok(attached.history.length > 0 && attached.references.length === 2 && attached.values.length === 1);
  const allSessions = await sessions(db);
  const words = await projectWords(db);

  // Within its Chapter.
  moved(await scenes.placeScene(pageId('h4a'), CH(4), 2));
  let view = await shown();
  assert.deepEqual(view.scenesOf[CH(4)], [pageId('h4b'), pageId('h4c'), pageId('h4a')]);
  assert.equal(await projectWords(db), words);
  // Into another Chapter, at a place.
  moved(await scenes.placeScene(pageId('h4a'), CH(3), 0));
  view = await shown();
  assert.deepEqual(view.scenesOf[CH(3)], [pageId('h4a'), pageId('h3a')]);
  assert.deepEqual(view.scenesOf[CH(4)], [pageId('h4b'), pageId('h4c')]);
  assert.equal(await projectWords(db), words, 'placed to placed: the total is the same');
  // Out to Unplaced Scenes, second place.
  moved(await scenes.placeScene(pageId('h4a'), null, 1));
  view = await shown();
  assert.equal(view.unplaced[1], pageId('h4a'));
  assert.equal(await projectWords(db), words - 5, 'its words leave the ordered total');
  // Reorder among the Unplaced.
  const unplacedBefore = view.unplaced;
  moved(await scenes.placeScene(unplacedBefore[0], null, null));
  view = await shown();
  assert.deepEqual(view.unplaced, [...unplacedBefore.slice(1), unplacedBefore[0]]);
  // Back into a Chapter (the empty one).
  moved(await scenes.placeScene(pageId('h4a'), CH(5), null));
  view = await shown();
  assert.deepEqual(view.scenesOf[CH(5)], [pageId('h4a')]);
  assert.equal(await projectWords(db), words);

  // The same Scene throughout: id, prose, words; history, properties, references, writing history.
  assert.deepEqual(keep(await sceneRow(db, pageId('h4a'))), keep(scene0));
  assert.deepEqual(await attachments(db, pageId('h4a')), attached);
  assert.deepEqual(await sessions(db), allSessions, 'moving is not writing: no session, no words');
  const loaded = await workspaceLoader.loadProjectWorkspace(HOLLOW);
  assert.ok(loaded.references.some((r) => r.target.id === pageId('h4a') && r.source.id === kept.nerai.id));
  // Positions: never tied (the list a Scene lands in is numbered 0..n-1; the one it left keeps a gap).
  for (const chapter of [CH(3), CH(4), CH(5)]) {
    const ps = (await all(db, `select position from public.scenes where chapter_id = $1 order by position`, [chapter])).map((r) => r.position);
    assert.equal(new Set(ps).size, ps.length, chapter);
  }
  assert.deepEqual((await all(db, `select position from public.scenes where chapter_id = $1`, [CH(5)])).map((r) => r.position), [0]);
  const unplacedPositions = (await all(db, `select position from public.scenes s join public.manuscripts m on m.id = s.manuscript_id
    where m.project_id = $1 and s.chapter_id is null and s.trashed_at is null order by position`, [HOLLOW])).map((r) => r.position);
  assert.equal(new Set(unplacedPositions).size, unplacedPositions.length);
  // An edit queued before the moves still lands on the same Scene.
  const now = await sceneRow(db, pageId('h4a'));
  const saved = await scenes.syncSceneWithLimitCheck(pageId('h4a'), doc('The tide came in grey, then gold.'), 7, now.version);
  assert.equal(saved.status, 'ok');
});

test('Scene placement is refused — changing nothing — for a Chapter in Trash, of another manuscript, another writer’s, or a trashed Scene', async () => {
  const db = await seededDb();
  ok(await trash.trashWorkspaceObject('chapter', CH(5)));
  ok(await trash.trashWorkspaceObject('scene', pageId('h3c')));
  const before = await liveState(db);
  assert.deepEqual(await scenes.placeScene(pageId('h4a'), CH(5), null), { error: 'Chapter not found' });
  assert.deepEqual(await scenes.placeScene(pageId('h4a'), chapterId('ash.ch1'), null), { error: 'A Scene can only move within its own manuscript' });
  assert.deepEqual(await scenes.placeScene(pageId('h3c'), CH(1), null), { error: 'Scene not found' });
  assert.deepEqual(await scenes.placeScene(pageId('h4a'), chapterId('tide.ch1'), null), { error: 'Chapter not found' });
  refused(await structure.moveChapter(CH(5), null, 0, HOLLOW), 'Chapter not found');
  signIn(db, BRAM);
  assert.deepEqual(await scenes.placeScene(pageId('h4a'), null, null), { error: 'Scene not found' });
  assert.deepEqual(await liveState(db), before);
});

test('simultaneous Scene moves into one Chapter never tie', async () => {
  const db = await seededDb();
  const ids = [pageId('h3b'), pageId('h3c'), pageId('h6a'), pageId('h6b')];
  const results = await Promise.all(ids.map((id) => scenes.placeScene(id, CH(1), 0)));
  results.forEach(moved);
  const rows = await all(db, `select id, position from public.scenes where chapter_id = $1 order by position`, [CH(1)]);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2, 3, 4]);
});

// ── 3. Trash ────────────────────────────────────────────────────────────────────

test('Scene Trash: a placed and an Unplaced Scene go to Trash — never to Unplaced — and come back where they were', async () => {
  const db = await seededDb();
  const view = await shown();
  ok(await trash.trashWorkspaceObject('scene', pageId('h4c')));
  ok(await trash.trashWorkspaceObject('scene', pageId('h6a')));
  const now = await shown();
  assert.equal(now.unplaced.includes(pageId('h4c')), false, 'a trashed placed Scene is not Unplaced');
  assert.equal(now.unplaced.includes(pageId('h6a')), false);
  assert.deepEqual(new Set(ok(await trash.listWorkspaceTrash(HOLLOW)).map((i) => i.id)), new Set([pageId('h4c'), pageId('h6a')]));
  ok(await trash.restoreWorkspaceObject('scene', pageId('h4c')));
  ok(await trash.restoreWorkspaceObject('scene', pageId('h6a')));
  const back = await shown();
  assert.deepEqual(back.scenesOf, view.scenesOf);
  assert.deepEqual(back.unplaced, view.unplaced);
});

test('Chapter Trash: the Chapter and its Scenes leave together — hidden, out of the totals, one Trash item — every row kept whole', async () => {
  const db = await seededDb();
  const kept = await furnish(db, pageId('h4a'));
  const attached = await attachments(db, pageId('h4a'));
  const scenesBefore = await Promise.all(['h4a', 'h4b', 'h4c'].map((l) => sceneRow(db, pageId(l))));
  const chapterBefore = await one(db, `select * from public.chapters where id = $1`, [CH(4)]);
  const view = await shown();
  const words = await projectWords(db);
  const allSessions = await sessions(db);

  const ch4Words = scenesBefore.reduce((n, sc) => n + sc.word_count, 0);
  const r = ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  assert.deepEqual(r, { moved: 0 });
  const now = await shown();
  assert.equal(now.chapters.includes(CH(4)), false);
  assert.deepEqual(now.unplaced, view.unplaced, 'Trash is not Unplaced Scenes');
  assert.equal(await projectWords(db), words - ch4Words, 'its placed words leave the ordered total');
  assert.equal(now.manuscriptWords, words - ch4Words);
  // Each Scene: same row, prose, words, version and updated_at; remembered as trashed with its Chapter.
  for (const b of scenesBefore) {
    const a = await sceneRow(db, b.id);
    assert.deepEqual(keep(a), keep(b));
    assert.deepEqual([a.version, a.updated_at.getTime(), a.position], [b.version, b.updated_at.getTime(), b.position]);
    assert.deepEqual([a.chapter_id, a.trashed_from_chapter_id, a.trashed_with_chapter], [null, CH(4), true]);
  }
  assert.deepEqual(await attachments(db, pageId('h4a')), attached, 'history, values, references and sessions all kept');
  assert.deepEqual(await sessions(db), allSessions);
  // One item in Trash: the Chapter, with its Scenes counted.
  const items = ok(await trash.listWorkspaceTrash(HOLLOW));
  assert.deepEqual(items.map((i) => [i.type, i.id, i.scenes, i.words, i.from_group_id]), [['chapter', CH(4), 3, ch4Words, null]]);
  assert.equal(trashModel.trashContext(items[0]), '3 scenes');
  assert.match(trashModel.deletionWarning(items[0]), new RegExp(`and its 3 scenes permanently\\? Their prose .*\\(${ch4Words} words\\).*writing history is kept`));
  // Hidden from every reader: RLS, references, the navigator's loaders.
  await asUser(db, ALICE, async (tx) => {
    assert.equal((await tx.query(`select id from public.chapters where id = $1`, [CH(4)])).rows.length, 0);
    assert.equal((await tx.query(`select id from public.scenes where id = $1`, [pageId('h4a')])).rows.length, 0);
  });
  const loaded = await workspaceLoader.loadProjectWorkspace(HOLLOW);
  assert.equal(loaded.references.some((ref) => ref.target.id === pageId('h4a') || ref.source.id === pageId('h4a')), false, 'dormant');
  assert.equal(loaded.chapterTrashable, true);
  // Nothing new can go into it; its Scenes can't be restored or deleted apart from it.
  refused(await scenes.createScene(CH(4), null), 'Chapter not found');
  refused(await trash.restoreWorkspaceObject('scene', pageId('h4a')), 'Restore its chapter first');
  refused(await trash.deleteTrashedWorkspaceObject('scene', pageId('h4a')), 'It is in Trash with its chapter');
  refused(await trash.trashWorkspaceObject('chapter', CH(4)), 'Already in Trash');
  const save = await scenes.syncSceneWithLimitCheck(pageId('h4a'), doc('late'), 1, scenesBefore[0].version);
  assert.deepEqual(save, { status: 'error', error: 'Scene not found' }, 'a queued save waits for the restore');
  assert.equal((await one(db, `select title from public.chapters where id = $1`, [CH(4)])).title, chapterBefore.title);
  assert.ok(kept.nerai.id);
});

test('Chapter restore: back in its Group at its old place, its Scenes inside it in order, totals and references back — nothing counted as written', async () => {
  const db = await seededDb();
  const part = ok(await structure.createGroup(HOLLOW, 'Part One'));
  moved(await structure.moveChapter(CH(3), part.id, null, HOLLOW));
  moved(await structure.moveChapter(CH(4), part.id, null, HOLLOW));
  moved(await structure.moveChapter(CH(6), part.id, null, HOLLOW));
  const kept = await furnish(db, pageId('h4c'));
  const attached = await attachments(db, pageId('h4c'));
  const view = await shown();
  assert.deepEqual(view.chapters.filter((c) => view.groupOf[c] === part.id), [CH(3), CH(4), CH(6)]);
  const words = await projectWords(db);
  const allSessions = await sessions(db);
  const versions = await all(db, `select id, version, updated_at from public.scenes where chapter_id = $1 order by id`, [CH(4)]);

  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  // Meanwhile: the Group's order changes; a new Chapter arrives in it.
  const extra = ok(await chapters.createChapter(HOLLOW, 'Interlude'));
  moved(await structure.moveChapter(extra.id, part.id, 1, HOLLOW));
  assert.deepEqual(ok(await trash.restoreWorkspaceObject('chapter', CH(4))), { location: 'original' });

  const back = await shown();
  assert.deepEqual(back.chapters.filter((c) => back.groupOf[c] === part.id), [CH(3), CH(4), extra.id, CH(6)], 'its old index in the Group');
  assert.deepEqual(back.scenesOf[CH(4)], [pageId('h4a'), pageId('h4b'), pageId('h4c')]);
  assert.equal(await projectWords(db), words, 'the same total again (the new Chapter is empty)');
  assert.deepEqual(await all(db, `select id, version, updated_at from public.scenes where chapter_id = $1 order by id`, [CH(4)]), versions,
    'no version or save time changed');
  assert.deepEqual(await attachments(db, pageId('h4c')), attached);
  assert.deepEqual(await sessions(db), allSessions, 'restoring is not writing');
  const loaded = await workspaceLoader.loadProjectWorkspace(HOLLOW);
  assert.ok(loaded.references.some((r) => r.target.id === pageId('h4c') && r.source.id === kept.nerai.id), 'references active again');
  assert.deepEqual(ok(await trash.listWorkspaceTrash(HOLLOW)), []);
  const row = await one(db, `select trashed_at, trashed_from_group_id, trashed_from_index from public.chapters where id = $1`, [CH(4)]);
  assert.deepEqual(row, { trashed_at: null, trashed_from_group_id: null, trashed_from_index: null });
  const scenesBack = await all(db, `select trashed_at, trashed_from_chapter_id, trashed_with_chapter from public.scenes where chapter_id = $1`, [CH(4)]);
  assert.ok(scenesBack.every((sc) => sc.trashed_at === null && sc.trashed_from_chapter_id === null && sc.trashed_with_chapter === false));
});

test('a reference to a Chapter goes dormant while it is in Trash and comes back with it', async () => {
  const db = await seededDb();
  const people = ok(await collections.createWorkspaceCollection(HOLLOW, 'People')).collection;
  const nerai = ok(await collections.createCollectionEntry(people.id, 'Nerai'));
  await db.query(`insert into public.object_references (project_id, source_type, source_entry_id, target_type, target_chapter_id, origin, position)
    values ($1, 'entry', $2, 'chapter', $3, 'inline', 1)`, [HOLLOW, nerai.id, CH(4)]);
  const toChapter = async () => (await workspaceLoader.loadProjectWorkspace(HOLLOW)).references.filter((r) => r.target.id === CH(4));
  assert.equal((await toChapter()).length, 1);
  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  assert.equal((await toChapter()).length, 0, 'hidden while in Trash');
  assert.equal((await all(db, `select id from public.object_references where target_chapter_id = $1`, [CH(4)])).length, 1, 'but kept');
  ok(await trash.restoreWorkspaceObject('chapter', CH(4)));
  assert.equal((await toChapter()).length, 1);
});

test('Chapter restore falls back safely: its Group gone → the end of the manuscript; a Scene trashed on its own stays its own item', async () => {
  const db = await seededDb();
  const part = ok(await structure.createGroup(HOLLOW, 'Part One'));
  moved(await structure.moveChapter(CH(4), part.id, null, HOLLOW));
  // h4b goes to Trash on its own first; then the Chapter (with h4a, h4c).
  ok(await trash.trashWorkspaceObject('scene', pageId('h4b')));
  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  let items = ok(await trash.listWorkspaceTrash(HOLLOW));
  const single = items.find((i) => i.id === pageId('h4b'));
  assert.deepEqual(items.map((i) => i.type).sort(), ['chapter', 'scene']);
  assert.equal(items.find((i) => i.type === 'chapter').scenes, 2);
  assert.equal(single.from_chapter_active, false);
  assert.match(trashModel.trashContext(single), /, which is in Trash$/);
  // The Group is now empty (a trashed Chapter holds no place) and can be deleted.
  assert.deepEqual(await structure.deleteGroup(part.id, HOLLOW), { error: null });
  items = ok(await trash.listWorkspaceTrash(HOLLOW));
  assert.equal(trashModel.trashContext(items.find((i) => i.type === 'chapter')), '2 scenes · from a group that is gone');

  assert.deepEqual(ok(await trash.restoreWorkspaceObject('chapter', CH(4))), { location: 'top' });
  const view = await shown();
  assert.equal(view.chapters.at(-1), CH(4), 'the end of the manuscript');
  assert.equal(view.groupOf[CH(4)], null);
  assert.deepEqual(view.scenesOf[CH(4)], [pageId('h4a'), pageId('h4c')]);
  // h4b is still in Trash, and returns to its Chapter now that it is back.
  assert.deepEqual(ok(await trash.listWorkspaceTrash(HOLLOW)).map((i) => i.id), [pageId('h4b')]);
  assert.deepEqual(ok(await trash.restoreWorkspaceObject('scene', pageId('h4b'))), { location: 'original' });
  assert.deepEqual((await shown()).scenesOf[CH(4)], [pageId('h4a'), pageId('h4b'), pageId('h4c')]);
});

test('a Scene restored while its Chapter is in Trash goes to Unplaced Scenes, never into the trashed Chapter', async () => {
  const db = await seededDb();
  ok(await trash.trashWorkspaceObject('scene', pageId('h4b')));
  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  assert.deepEqual(ok(await trash.restoreWorkspaceObject('scene', pageId('h4b'))), { location: 'unplaced' });
  const row = await sceneRow(db, pageId('h4b'));
  assert.deepEqual([row.chapter_id, row.trashed_at], [null, null]);
  ok(await trash.restoreWorkspaceObject('chapter', CH(4)));
  assert.deepEqual((await shown()).scenesOf[CH(4)], [pageId('h4a'), pageId('h4c')]);
});

test('permanent deletion only from Trash: clients cannot delete Scenes or Chapters; deleting a trashed Chapter takes its Scenes and keeps writing history', async () => {
  const db = await seededDb();
  const sb = createSupabaseAdapter(db, { userId: ALICE });
  assert.match((await sb.from('scenes').delete().eq('id', pageId('h4c')).select('id')).error?.message ?? '', /permission denied/);
  assert.match((await sb.from('chapters').delete().eq('id', CH(5)).select('id')).error?.message ?? '', /permission denied/);
  assert.ok(await one(db, `select id from public.scenes where id = $1`, [pageId('h4c')]));
  assert.ok(await one(db, `select id from public.chapters where id = $1`, [CH(5)]));
  refused(await trash.deleteTrashedWorkspaceObject('chapter', CH(4)), 'Only an item in Trash can be deleted permanently');
  const history = async () => all(db, `select project_id, session_date, sum(words_added)::int as words
    from public.writing_sessions where project_id = $1 group by 1, 2 order by 2`, [HOLLOW]);
  const before = await history();
  ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  ok(await trash.deleteTrashedWorkspaceObject('chapter', CH(4)));
  assert.equal(await one(db, `select id from public.chapters where id = $1`, [CH(4)]), undefined);
  assert.deepEqual(await all(db, `select id from public.scenes where id = any($1)`, [[pageId('h4a'), pageId('h4b'), pageId('h4c')]]), []);
  assert.deepEqual(await history(), before, 'every day and word of writing history kept');
  assert.deepEqual(ok(await trash.listWorkspaceTrash(HOLLOW)), []);
  // The Milestone still reads it as it was.
  const [m] = ok(await milestones.listManuscriptMilestones(HOLLOW));
  const snap = ok(await milestones.getManuscriptMilestone(m.id));
  assert.equal(model.milestoneHas(snap, { kind: 'scene', id: pageId('h4c') }), true);
  assert.equal(model.milestoneHas(snap, { kind: 'chapter', id: CH(4) }), true);
});

test('"Remove chapter, keep its scenes" is apart from Trash: the Scenes become Unplaced, the Chapter goes; ownership checked', async () => {
  const db = await seededDb();
  const view = await shown();
  const r = await chapters.removeChapterKeepScenes(CH(4), HOLLOW);
  assert.deepEqual(r, { error: null, unplacedSceneIds: [pageId('h4a'), pageId('h4b'), pageId('h4c')] });
  const now = await shown();
  assert.deepEqual(now.unplaced, [...view.unplaced, pageId('h4a'), pageId('h4b'), pageId('h4c')]);
  assert.equal(now.chapters.includes(CH(4)), false);
  assert.deepEqual(ok(await trash.listWorkspaceTrash(HOLLOW)), [], 'nothing in Trash');
  signIn(db, BRAM);
  assert.deepEqual(await chapters.removeChapterKeepScenes(CH(6), HOLLOW), { error: 'Chapter not found' });
  signIn(db, ALICE);
  ok(await trash.trashWorkspaceObject('chapter', CH(6)));
  assert.deepEqual(await chapters.removeChapterKeepScenes(CH(6), HOLLOW), { error: 'Chapter not found' }, 'not a Chapter in Trash');
});

test('a trashed Chapter is in no Milestone, no duplicate and no sibling order; another writer can do nothing with it', async () => {
  const db = await seededDb();
  ok(await trash.trashWorkspaceObject('chapter', CH(4)));
  const { id } = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  const snap = ok(await milestones.getManuscriptMilestone(id));
  assert.equal(model.milestoneHas(snap, { kind: 'chapter', id: CH(4) }), false);
  assert.equal(model.milestoneHas(snap, { kind: 'scene', id: pageId('h4a') }), false);
  const copy = ok(await projects.duplicateProject(HOLLOW));
  const copied = await all(db, `select c.title from public.chapters c join public.manuscripts m on m.id = c.manuscript_id where m.project_id = $1`, [copy.id]);
  assert.equal(copied.length, 5, 'the manuscript, not its Trash');
  // A new Chapter takes the next place; the trashed one holds none.
  const c = ok(await chapters.createChapter(HOLLOW, 'New'));
  const places = await all(db, `select position from public.chapters where manuscript_id = $1 and group_id is null and trashed_at is null order by position`,
    [(await one(db, `select manuscript_id from public.chapters where id = $1`, [c.id])).manuscript_id]);
  assert.equal(new Set(places.map((p) => p.position)).size, places.length);
  signIn(db, BRAM);
  refused(await trash.restoreWorkspaceObject('chapter', CH(4)), 'Item not found');
  refused(await trash.deleteTrashedWorkspaceObject('chapter', CH(4)), 'Item not found');
  refused(await trash.trashWorkspaceObject('chapter', CH(6)), 'Item not found');
  const internal = await createSupabaseAdapter(db, { userId: ALICE }).rpc('trash_manuscript_chapter', { p_id: CH(6) });
  assert.match(internal.error?.message ?? '', /permission denied/, 'only through the Trash functions');
});

// ── 4. No free-word limit ───────────────────────────────────────────────────────

test('no Rune 2.0 writing path enforces a free-word limit: saving, creating, duplicating, restoring history — for a writer far past the old allowance', async () => {
  const db = await seededDb();
  const total0 = await asUser(db, ALICE, async (tx) => (await tx.query(`select public.account_word_total() as n`)).rows[0].n);
  assert.ok(total0 > 2000, 'alice is already over the old 2,000-word allowance');
  const limit = await asUser(db, ALICE, async (tx) => (await tx.query(`select public.free_word_limit_for_caller() as n`)).rows[0].n);
  assert.equal(limit, null, 'no limit, for every cohort');
  assert.equal(await asUser(db, BRAM, async (tx) => (await tx.query(`select public.free_word_limit_for_caller() as n`)).rows[0].n), null);

  // Writing growth.
  const big = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(' ');
  const { version } = await sceneRow(db, pageId('h4b'));
  const saved = await scenes.syncSceneWithLimitCheck(pageId('h4b'), doc(big), 3000, version);
  assert.equal(saved.status, 'ok', JSON.stringify(saved));
  // Creation with words (the checked creation RPCs), and an empty Scene and Chapter.
  const content = doc(big);
  const placed = await asUser(db, ALICE, async (tx) => (await tx.query(`select public.insert_scene_checked($1, 'Long', $2, 3000, null) as r`, [CH(5), content])).rows[0].r);
  assert.equal(placed.status, 'ok');
  const manuscriptId = (await one(db, `select manuscript_id from public.chapters where id = $1`, [CH(5)])).manuscript_id;
  const loose = await asUser(db, ALICE, async (tx) => (await tx.query(`select public.insert_unplaced_scene_checked($1, 'Loose', $2, 3000) as r`, [manuscriptId, content])).rows[0].r);
  assert.equal(loose.status, 'ok');
  const chapter = await asUser(db, ALICE, async (tx) => (await tx.query(`select public.create_chapter_checked($1, 'Long chapter', 'Scene 1', $2, 3000) as r`, [manuscriptId, content])).rows[0].r);
  assert.equal(chapter.status, 'ok');
  const project = await asUser(db, ALICE, async (tx) => (await tx.query(`select public.create_project_checked('Another', null, null, $1, 3000, $2) as r`, [content, uuid()])).rows[0].r);
  assert.equal(project.status, 'ok');
  ok(await scenes.createScene(CH(1), null));
  ok(await scenes.createUnplacedScene(HOLLOW, null));
  ok(await chapters.createChapter(HOLLOW, 'Yet another'));
  // Duplication of a large Project.
  const copy = ok(await projects.duplicateProject(HOLLOW));
  assert.ok(copy.id);
  // History restore, whatever the account total.
  await db.exec(`set session_replication_role = replica;
    update public.scenes set updated_at = updated_at - interval '2 hours', created_at = created_at - interval '2 hours';
    set session_replication_role = origin;`);
  const s = await sceneRow(db, pageId('h4b'));
  assert.equal((await scenes.syncSceneWithLimitCheck(pageId('h4b'), doc('short now'), 2, s.version)).status, 'ok');
  const h = ok(await history.listSceneHistory(pageId('h4b')));
  const older = h.revisions.find((r) => r.word_count === 3000);
  assert.ok(older, 'the 3,000-word text is in history');
  const restored = await history.restoreSceneRevision(older.id, h.scene.version);
  assert.equal(restored.status, 'ok', JSON.stringify(restored));
  assert.equal(restored.scene.word_count, 3000);
  const total1 = await asUser(db, ALICE, async (tx) => (await tx.query(`select public.account_word_total() as n`)).rows[0].n);
  assert.ok(total1 > total0 + 20000, 'account_word_total still measures the account (a metric, never a gate)');
});

test('a large import succeeds for a brand-new free writer, with no allowance at all', async () => {
  const db = await seededDb();
  await createAuthUser(db, DANA);
  const cohort = await one(db, `select pricing_cohort from public.user_pricing_entitlements where user_id = $1`, [DANA]);
  assert.equal(cohort?.pricing_cohort ?? 'starter_2k', 'starter_2k');
  const scene = (n) => ({ title: null, paragraphs: [[Array.from({ length: n }, (_, i) => `w${i}`).join(' ')]] });
  const payload = {
    title: 'The Long Book',
    items: Array.from({ length: 10 }, (_, c) => ({ kind: 'chapter', title: `Chapter ${c + 1}`, scenes: [scene(5000)] })),
    unplaced: [scene(2500)],
  };
  signIn(db, DANA);
  const res = await importRoute.POST(new Request('http://rune.test/api/manuscript-import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload, requestId: uuid() }),
  }));
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(await projectWords(db, body.projectId), 50000, 'the ordered total: every placed word');
  const unplaced = await one(db, `select coalesce(sum(s.word_count), 0)::int n from public.scenes s join public.manuscripts m on m.id = s.manuscript_id
    where m.project_id = $1 and s.chapter_id is null`, [body.projectId]);
  assert.equal(unplaced.n, 2500);
  assert.deepEqual(await all(db, `select * from public.writing_sessions where user_id = $1`, [DANA]), [], 'imported prose is not written words');
});

test('ordinary word counts still behave: Scene words, the ordered total, Unplaced words and writing history on a save', async () => {
  const db = await seededDb();
  const view = await shown();
  const { version } = await sceneRow(db, pageId('h4a'));
  assert.equal((await scenes.syncSceneWithLimitCheck(pageId('h4a'), doc('only four words here'), 4, version)).status, 'ok');
  const now = await shown();
  assert.equal(now.manuscriptWords, view.manuscriptWords - 196);
  assert.equal(await projectWords(db), view.manuscriptWords - 196);
  assert.equal(now.unplacedWords, view.unplacedWords);
  assert.equal((await sceneRow(db, pageId('h4a'))).word_count, 4);
});
