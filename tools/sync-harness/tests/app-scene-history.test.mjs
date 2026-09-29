// Scene History and named Manuscript Milestones (Rune 2.0, Milestone 17,
// migration 036): the REAL actions, loaders and pure rules against the
// Rune 2.0 schema in real Postgres + RLS.
//
//   * checkpoints are taken on the save path: the replaced text after a
//     30-minute pause, or an hour after the last checkpoint — never per save
//   * restore is a new save of the old text (same Scene id, version guard,
//     allowance, word counts) that keeps the replaced text and deletes nothing
//   * no writing history, placement, title, property or reference changes
//   * Scene Trash keeps history; permanent deletion drops it, except
//     revisions a Milestone uses
//   * Milestones capture Groups, Chapters, placed and Unplaced Scenes, order
//     and prose in one transaction, change no live row, and stay read-only
//   * retention, ownership, search, duplication, Project deletion
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow (free, over her 2,000-word allowance); bram owns tide. In
// hollow: ch1 holds h1a (120 words), ch3 holds h3a (410), ch4 holds h4a
// (200), h4b (0) and h4c (150); h3b (380) and h3c (95) are Unplaced. Every
// fixture Scene was last saved weeks ago.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, asUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});
const words = (...paragraphs) => paragraphs.join(' ').split(/\s+/).filter(Boolean).length;

let legacy;
let history, milestones, scenes, trash, structure, projects, search, props, manuscriptLoader, model;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  history = await bundleForTest('src/lib/actions/sceneHistory.ts', { name: 'sh_history' });
  milestones = await bundleForTest('src/lib/actions/manuscriptMilestones.ts', { name: 'sh_milestones' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'sh_scenes' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'sh_trash' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'sh_structure' });
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'sh_projects' });
  search = await bundleForTest('src/lib/actions/projectSearch.ts', { name: 'sh_search' });
  props = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'sh_props' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'sh_manuscript' });
  model = await bundleForTest('src/lib/rune2/history.ts', { name: 'sh_model' });
});

async function seededDb({ scribe = false } = {}) {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  if (scribe) await db.query(`update public.profiles set subscription_tier = 'scribe' where id = $1`, [ALICE]);
  signIn(db, ALICE);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [history, milestones, scenes, trash, structure, projects, search, props, manuscriptLoader]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const refused = (r, message) => { assert.equal(r.data, null); if (message) assert.equal(r.error, message); else assert.ok(r.error); };

const sceneRow = (db, id) => one(db, `select id, manuscript_id, chapter_id, title, content, word_count, position, version, updated_at, trashed_at
  from public.scenes where id = $1`, [id]);
const revisions = (db, id) => all(db, `select id, scene_id, title, content, word_count, saved_at, reason from public.scene_revisions
  where scene_id = $1 order by created_at, id`, [id]);
const revisionCount = async (db) => (await one(db, `select count(*)::int as n from public.scene_revisions`)).n;
const sessions = (db) => all(db, `select user_id, project_id, scene_id, session_date, words_added from public.writing_sessions order by id`);
const projectWords = async (db, id = HOLLOW) => (await one(db, `select word_count from public.projects where id = $1`, [id])).word_count;
const hollowManuscript = async (db) => (await one(db, `select id from public.manuscripts where project_id = $1`, [HOLLOW])).id;

/** Saves a Scene exactly as the editor's sync does (save_scene_checked at the current version). */
async function save(db, id, ...paragraphs) {
  const { version } = await sceneRow(db, id);
  const r = await scenes.syncSceneWithLimitCheck(id, doc(...paragraphs), words(...paragraphs), version);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  return r;
}

/** Moves every Scene's last save and every checkpoint `minutes` into the past, as if that time had gone by. */
async function pass(db, minutes, { scenesToo = true } = {}) {
  await db.exec(`set session_replication_role = replica;
    ${scenesToo ? `update public.scenes set updated_at = updated_at - interval '${minutes} minutes', created_at = created_at - interval '${minutes} minutes';` : ''}
    update public.scene_revisions set created_at = created_at - interval '${minutes} minutes';
    set session_replication_role = origin;`);
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
    values: await all(db, `select * from public.scene_property_values order by scene_id`),
    events: await all(db, `select * from public.analytics_events order by id`),
  };
}

// ── 1. Checkpoints ────────────────────────────────────────────────────────────

test('checkpoint: the first save after a pause keeps the text it replaces — same Scene, its words, title and time', async () => {
  const db = await seededDb();
  const before = await sceneRow(db, pageId('h1a'));
  assert.deepEqual(await revisions(db, pageId('h1a')), []);

  await save(db, pageId('h1a'), 'A shorter opening.');
  const [kept] = await revisions(db, pageId('h1a'));
  assert.deepEqual(
    { scene: kept.scene_id, title: kept.title, content: kept.content, words: kept.word_count, saved: kept.saved_at, reason: kept.reason },
    { scene: before.id, title: before.title, content: before.content, words: before.word_count, saved: before.updated_at, reason: 'checkpoint' }
  );
  assert.deepEqual((await sceneRow(db, pageId('h1a'))).content, doc('A shorter opening.'), 'the live text is the Scene itself');
});

test('no checkpoint spam: saves within one sitting add nothing; a 30-minute pause or an hour of writing adds one', async () => {
  const db = await seededDb({ scribe: true });
  const id = pageId('h1a');
  await save(db, id, 'One.');
  for (let i = 0; i < 20; i += 1) await save(db, id, `One. Two ${i}.`);
  assert.equal((await revisions(db, id)).length, 1, 'twenty saves in a sitting: only the text from before it');

  // A 29-minute pause is still the same sitting.
  await pass(db, 29);
  await save(db, id, 'One. Two. Three.');
  assert.equal((await revisions(db, id)).length, 1);

  // Returning after 30 minutes keeps the end of the last sitting.
  await pass(db, 30);
  await save(db, id, 'One. Two. Three. Four.');
  const afterPause = await revisions(db, id);
  assert.equal(afterPause.length, 2);
  assert.deepEqual(afterPause[1].content, doc('One. Two. Three.'));

  // Writing without a pause: a checkpoint once the last one is an hour old.
  await save(db, id, 'Five.');
  await pass(db, 61, { scenesToo: false });
  await save(db, id, 'Six.');
  const hourly = await revisions(db, id);
  assert.equal(hourly.length, 3);
  assert.deepEqual(hourly[2].content, doc('Five.'));
});

test('nothing worth keeping is not kept: an empty Scene, or a text already the latest revision', async () => {
  const db = await seededDb({ scribe: true });
  // h4b holds no words: its first save keeps nothing.
  await save(db, pageId('h4b'), 'The first words.');
  assert.deepEqual(await revisions(db, pageId('h4b')), []);

  // A text that is already the latest revision (here, the one a Milestone
  // just took) is not copied again when a later save replaces it.
  ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  const taken = await revisions(db, pageId('h1a'));
  assert.deepEqual(taken.map((r) => r.reason), ['milestone']);
  await pass(db, 45);
  await save(db, pageId('h1a'), 'Draft two.');
  assert.deepEqual(await revisions(db, pageId('h1a')), taken);
});

test('title changes and moves are not prose: no checkpoint', async () => {
  const db = await seededDb();
  assert.equal((await scenes.renameScene(pageId('h3b'), 'Renamed')).error, null);
  assert.equal((await scenes.moveSceneToUnplaced(pageId('h1a'))).error, null);
  assert.equal(await revisionCount(db), 0);
});

// ── 2. Scene History and restore ────────────────────────────────────────────

test('history: newest first, no content, the current text marked; preview is read-only', async () => {
  const db = await seededDb({ scribe: true });
  const id = pageId('h3b');
  const original = await sceneRow(db, id);
  await save(db, id, 'Second text.');
  await pass(db, 40);
  await save(db, id, 'Third text, longer than the second.');

  const h = ok(await history.listSceneHistory(id));
  const live = await sceneRow(db, id);
  assert.deepEqual(h.scene, { id, title: live.title, version: live.version, word_count: live.word_count, updated_at: h.scene.updated_at });
  assert.equal(new Date(h.scene.updated_at).getTime(), new Date(live.updated_at).getTime());
  assert.deepEqual(h.revisions.map((r) => r.word_count), [2, original.word_count], 'newest first');
  assert.ok(h.revisions.every((r) => !('content' in r)));
  assert.deepEqual(h.revisions.map((r) => r.current), [false, false]);
  assert.deepEqual(h.revisions.map((r) => r.milestones), [[], []]);

  const before = await revisionCount(db);
  const preview = ok(await history.getSceneRevision(h.revisions[1].id));
  assert.deepEqual([preview.scene_id, preview.content, preview.word_count], [id, original.content, original.word_count]);
  assert.equal(await revisionCount(db), before);
  assert.deepEqual(await sceneRow(db, id), live, 'reading history changes nothing');
});

test('restore: the older text becomes the current one — same Scene, new version, right words — and newer history stays', async () => {
  const db = await seededDb({ scribe: true });
  const id = pageId('h1a');
  const original = await sceneRow(db, id);
  await save(db, id, 'A rewrite that went wrong.');
  await pass(db, 40);
  await save(db, id, 'A second rewrite that also went wrong, and it is longer.');
  const beforeRestore = await sceneRow(db, id);
  const kept = await revisions(db, id);
  const state = await liveState(db);
  const totalBefore = await projectWords(db);

  const h = ok(await history.listSceneHistory(id));
  const target = h.revisions.find((r) => r.word_count === original.word_count);
  const r = await history.restoreSceneRevision(target.id, h.scene.version);
  assert.equal(r.status, 'ok');

  const after = await sceneRow(db, id);
  assert.deepEqual(r.scene.content, original.content, 'the action hands back the Scene as saved');
  assert.deepEqual(
    [after.id, after.content, after.word_count, after.version, after.title, after.chapter_id, after.position],
    [id, original.content, original.word_count, beforeRestore.version + 1, beforeRestore.title, beforeRestore.chapter_id, beforeRestore.position]
  );
  assert.equal(await projectWords(db), totalBefore - beforeRestore.word_count + original.word_count, 'ordered total follows');

  const now = await revisions(db, id);
  assert.deepEqual(now.slice(0, kept.length), kept, 'every earlier revision is still there, unchanged');
  assert.equal(now.length, kept.length + 1);
  assert.deepEqual([now.at(-1).reason, now.at(-1).content], ['restore', beforeRestore.content], 'the replaced text is kept');

  const nowState = await liveState(db);
  assert.deepEqual(nowState.sessions, state.sessions, 'no writing history: restoring is not writing');
  assert.deepEqual(nowState.events, state.events, 'no analytics');
  assert.deepEqual(nowState.chapters, state.chapters);
  assert.deepEqual(nowState.scenes.filter((s) => s.id !== id), state.scenes.filter((s) => s.id !== id), 'no other Scene changes');

  const listed = ok(await history.listSceneHistory(id));
  assert.equal(listed.revisions.filter((x) => x.current).length, 1, 'the restored text is marked current');
  assert.equal(listed.revisions.find((x) => x.current).id, target.id);
  assert.equal(model.revisionNote(listed.revisions[0]), 'Before a restore');

  // Restoring back: the replaced text can be brought back the same way.
  const back = await history.restoreSceneRevision(listed.revisions[0].id, listed.scene.version);
  assert.equal(back.status, 'ok');
  assert.deepEqual((await sceneRow(db, id)).content, beforeRestore.content);
});

test('restore is guarded: a stale version, the current text, the allowance, another writer — nothing is written', async () => {
  const db = await seededDb();
  const id = pageId('h4a');
  await save(db, id, 'Short.');
  const h = ok(await history.listSceneHistory(id));
  const [older] = h.revisions;
  const before = await sceneRow(db, id);
  const count = await revisionCount(db);

  // A save after the history was read wins; the restore does not overwrite it.
  assert.equal((await history.restoreSceneRevision(older.id, h.scene.version - 1)).status, 'version_mismatch');

  // alice is over her free allowance: bringing back 200 words is adding words.
  assert.equal((await history.restoreSceneRevision(older.id, h.scene.version)).status, 'word_limit_blocked');
  assert.deepEqual(await sceneRow(db, id), before);
  assert.equal(await revisionCount(db), count, 'no restore revision for a restore that did not happen');

  // Restoring the text the Scene already holds does nothing.
  await pass(db, 40);
  await save(db, id, 'Shorter.');
  const again = ok(await history.listSceneHistory(id));
  const shortRev = again.revisions.find((r) => r.word_count === 1);
  const r = await history.restoreSceneRevision(shortRev.id, again.scene.version);
  assert.equal(r.status, 'ok', 'shrinking is never blocked');
  const current = ok(await history.listSceneHistory(id)).revisions.find((x) => x.current);
  const c = await history.restoreSceneRevision(current.id, (await sceneRow(db, id)).version);
  assert.equal(c.status, 'unchanged');

  // Another writer sees nothing and restores nothing.
  signIn(db, BRAM);
  refused(await history.listSceneHistory(id), 'Scene not found');
  refused(await history.getSceneRevision(older.id), 'Version not found');
  assert.deepEqual(await history.restoreSceneRevision(older.id, h.scene.version), { status: 'error', error: 'Version not found' });
  assert.deepEqual(await asUser(db, BRAM, async (tx) => (await tx.query(`select id from public.scene_revisions`)).rows), []);
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(
    `insert into public.scene_revisions (manuscript_id, scene_id, title, word_count, saved_at, reason) values ($1, $2, 'x', 0, now(), 'checkpoint')`,
    [before.manuscript_id, id])), /permission denied/);
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`delete from public.scene_revisions`)), /permission denied/);
});

test('restore keeps the Scene\'s properties, references and placement', async () => {
  const db = await seededDb({ scribe: true });
  const id = pageId('h4c');
  const pov = ok(await props.createSceneProperty(HOLLOW, 'POV', 'text'));
  ok(await props.setScenePropertyValue(id, pov.id, 'Nerai'));
  await save(db, id, 'Changed.');
  const h = ok(await history.listSceneHistory(id));
  const values = await all(db, `select * from public.scene_property_values where scene_id = $1`, [id]);
  const placement = await one(db, `select chapter_id, position, manuscript_id from public.scenes where id = $1`, [id]);
  assert.equal((await history.restoreSceneRevision(h.revisions[0].id, h.scene.version)).status, 'ok');
  assert.deepEqual(await all(db, `select * from public.scene_property_values where scene_id = $1`, [id]), values);
  assert.deepEqual(await one(db, `select chapter_id, position, manuscript_id from public.scenes where id = $1`, [id]), placement);
});

// ── 3. Trash ─────────────────────────────────────────────────────────────────

test('Scene Trash: history stays through trash and restore; it cannot be opened or restored from while trashed', async () => {
  const db = await seededDb({ scribe: true });
  const id = pageId('h3b');
  await save(db, id, 'Changed before trashing.');
  const kept = await revisions(db, id);
  assert.equal(kept.length, 1);

  ok(await trash.trashWorkspaceObject('scene', id));
  assert.deepEqual(await revisions(db, id), kept, 'trashing takes no checkpoint and deletes nothing');
  refused(await history.listSceneHistory(id), 'Restore this scene from Trash first');
  const r = await history.restoreSceneRevision(kept[0].id, (await sceneRow(db, id)).version);
  assert.deepEqual(r, { status: 'error', error: 'Restore this scene from Trash first' });

  ok(await trash.restoreWorkspaceObject('scene', id));
  const h = ok(await history.listSceneHistory(id));
  assert.deepEqual(h.revisions.map((x) => x.id), kept.map((x) => x.id), 'the same history comes back with the Scene');
  assert.equal((await history.restoreSceneRevision(kept[0].id, h.scene.version)).status, 'ok');
});

test('permanent deletion drops the Scene\'s history — except revisions a Milestone uses, which stay for it', async () => {
  const db = await seededDb({ scribe: true });
  await save(db, pageId('h3c'), 'Unplaced, rewritten.');
  await save(db, pageId('h4c'), 'Placed, rewritten.');
  ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  await pass(db, 40);
  await save(db, pageId('h3c'), 'Unplaced, rewritten again.');
  const h3c = await revisions(db, pageId('h3c'));
  assert.equal(h3c.length, 2, 'the original and the Milestone\'s text (which the last save replaced: kept once)');

  for (const id of [pageId('h3c'), pageId('h4c')]) {
    ok(await trash.trashWorkspaceObject('scene', id));
    ok(await trash.deleteTrashedWorkspaceObject('scene', id));
  }
  const left = await all(db, `select id, scene_id, content from public.scene_revisions where id = any($1)`, [h3c.map((r) => r.id)]);
  assert.deepEqual(left.map((r) => [r.scene_id, r.content]), [[null, doc('Unplaced, rewritten.')]], 'only the Milestone\'s revision is left');
  assert.deepEqual(await all(db, `select id from public.scene_revisions where scene_id is not null and scene_id = any($1)`,
    [[pageId('h3c'), pageId('h4c')]]), []);

  const [ml] = ok(await milestones.listManuscriptMilestones(HOLLOW));
  const snap = ok(await milestones.getManuscriptMilestone(ml.id));
  assert.deepEqual(snap.scenes.find((s) => s.scene_id === pageId('h3c')).content, doc('Unplaced, rewritten.'));
  assert.deepEqual(snap.scenes.find((s) => s.scene_id === pageId('h4c')).content, doc('Placed, rewritten.'));
  assert.deepEqual(await history.restoreSceneRevision(left[0].id, 1), { status: 'error', error: 'This scene no longer exists' });

  // Deleting the Milestone lets its orphaned revisions go too.
  ok(await milestones.deleteManuscriptMilestone(ml.id));
  assert.deepEqual(await all(db, `select id from public.scene_revisions where scene_id is null`), []);
});

// ── 4. Milestones ────────────────────────────────────────────────────────────

test('Milestone: Groups, Chapters, placed and Unplaced Scenes, their order and prose — and no live row changes', async () => {
  const db = await seededDb({ scribe: true });
  const part = ok(await structure.createGroup(HOLLOW, 'Part One'));
  assert.equal((await structure.moveChapter(chapterId('hollow.ch1'), part.id, 0, HOLLOW)).error, null);
  assert.equal((await structure.moveChapter(chapterId('hollow.ch3'), part.id, 1, HOLLOW)).error, null);
  await save(db, pageId('h4a'), 'The storm breaks.');
  ok(await trash.trashWorkspaceObject('scene', pageId('h6a')));
  const state = await liveState(db);
  const live = await manuscriptLoader.loadProjectManuscript(HOLLOW);

  const { id } = ok(await milestones.createManuscriptMilestone(HOLLOW, '  Draft 1  '));
  assert.deepEqual(await liveState(db), state, 'no Scene, Chapter, Group, total, session, reference, value or event changes');

  const snap = ok(await milestones.getManuscriptMilestone(id));
  assert.deepEqual(
    [snap.milestone.name, snap.milestone.manuscript_words, snap.milestone.unplaced_words, snap.milestone.scene_count],
    ['Draft 1', live.manuscriptWords, live.unplacedWords, live.placedSceneCount + live.unplaced.length]
  );
  const groups = await all(db, `select id, title, parent_group_id, position from public.manuscript_groups`);
  assert.deepEqual(snap.milestone.structure.groups, groups);
  const chapters = await all(db, `select id, title, group_id, position from public.chapters where manuscript_id = $1 order by position, id`,
    [await hollowManuscript(db)]);
  assert.deepEqual(snap.milestone.structure.chapters, chapters);

  // Reading order: exactly the live manuscript's, with each Scene's prose.
  const order = model.milestoneReadingOrder(snap);
  const flat = (nodes) => nodes.flatMap((n) => (n.kind === 'group' ? [`group:${n.group.title}`, ...flat(n.children)] : [`chapter:${n.chapter.id}`, ...n.chapter.scenes.map((s) => s.scene_id)]));
  const liveFlat = (nodes) => nodes.flatMap((n) => (n.kind === 'group' ? [`group:${n.group.title}`, ...liveFlat(n.children)] : [`chapter:${n.chapter.id}`, ...n.chapter.scenes.map((s) => s.id)]));
  assert.deepEqual(flat(order.outline), liveFlat(live.outline));
  assert.deepEqual(order.unplaced.map((s) => s.scene_id), live.unplaced.map((s) => s.id), 'Unplaced Scenes included, in their order');
  assert.ok(!snap.scenes.some((s) => s.scene_id === pageId('h6a')), 'a Scene in Trash is not part of the manuscript');
  for (const s of snap.scenes) {
    const row = await sceneRow(db, s.scene_id);
    assert.deepEqual([s.content, s.word_count, s.title, s.chapter_id, s.position], [row.content, row.word_count, row.title, row.chapter_id, row.position]);
  }
});

test('Milestone: unchanged Scenes share revisions; later edits never reach it; it lists in Scene History', async () => {
  const db = await seededDb({ scribe: true });
  const first = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  const count = await revisionCount(db);
  const second = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Sent to editor'));
  assert.equal(await revisionCount(db), count, 'nothing changed in between: the second Milestone costs no new revision');

  await save(db, pageId('h1a'), 'After the editor.');
  const snap = ok(await milestones.getManuscriptMilestone(first.id));
  const h1a = snap.scenes.find((s) => s.scene_id === pageId('h1a'));
  assert.notDeepEqual(h1a.content, doc('After the editor.'), 'the Milestone still holds the earlier text');
  assert.equal(h1a.word_count, 120);

  const h = ok(await history.listSceneHistory(pageId('h1a')));
  assert.deepEqual(h.revisions.map((r) => r.milestones), [['Draft 1', 'Sent to editor']], 'one revision, both Milestones');
  assert.equal(model.revisionNote(h.revisions[0]), 'Draft 1 · Sent to editor');
  assert.equal(h.revisions[0].reason, 'milestone');

  // A Scene's text from a Milestone is restored through its Scene History.
  assert.equal((await history.restoreSceneRevision(h.revisions[0].id, h.scene.version)).status, 'ok');
  assert.deepEqual((await sceneRow(db, pageId('h1a'))).content, h1a.content);

  const listed = ok(await milestones.listManuscriptMilestones(HOLLOW));
  assert.deepEqual(listed.map((m) => m.name), ['Sent to editor', 'Draft 1'], 'newest first');
  assert.ok(listed.every((m) => !('structure' in m)));
  assert.equal(listed[0].id, second.id);
});

test('Milestone names, ownership and isolation', async () => {
  const db = await seededDb();
  refused(await milestones.createManuscriptMilestone(HOLLOW, '   '), 'Give the milestone a name');
  refused(await milestones.createManuscriptMilestone(HOLLOW, 'x'.repeat(121)), 'Keep the name to 120 characters');
  assert.deepEqual(model.milestoneName(' Draft 2 '), { name: 'Draft 2', error: null });
  const { id } = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  const manuscriptId = await hollowManuscript(db);
  // The database refuses what the action would never send.
  assert.equal((await asUser(db, ALICE, (tx) => tx.query(`select public.create_manuscript_milestone($1, $2) as r`, [manuscriptId, ' ']))).rows[0].r.error,
    'Give the milestone a name');

  signIn(db, BRAM);
  refused(await milestones.getManuscriptMilestone(id), 'Milestone not found');
  refused(await milestones.deleteManuscriptMilestone(id), 'Milestone not found');
  refused(await milestones.listManuscriptMilestones(HOLLOW), 'Manuscript not found');
  refused(await milestones.createManuscriptMilestone(HOLLOW, 'Mine now'), 'Manuscript not found');
  const r = (await asUser(db, BRAM, (tx) => tx.query(`select public.create_manuscript_milestone($1, 'Mine') as r`, [manuscriptId]))).rows[0].r;
  assert.deepEqual(r, { status: 'error', error: 'Manuscript not found' });
  assert.deepEqual(await asUser(db, BRAM, async (tx) => (await tx.query(`select id from public.manuscript_milestones`)).rows), []);
  assert.deepEqual(await asUser(db, BRAM, async (tx) => (await tx.query(`select milestone_id from public.manuscript_milestone_scenes`)).rows), []);
  assert.deepEqual(ok(await milestones.listManuscriptMilestones(TIDE)), [], 'bram\'s own manuscript has none');
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`update public.manuscript_milestones set name = 'x'`)), /permission denied/);

  signIn(db, ALICE);
  ok(await milestones.deleteManuscriptMilestone(id));
  assert.deepEqual(ok(await milestones.listManuscriptMilestones(HOLLOW)), []);
  assert.equal(await revisionCount(db) > 0, true, 'revisions of live Scenes stay, under ordinary retention');
});

test('the reading order keeps a Scene whose Chapter is missing from the snapshot, with the Unplaced Scenes', () => {
  const scene = (scene_id, chapter_id, position) => ({ scene_id, chapter_id, position, revision_id: scene_id, title: '', content: null, word_count: 0 });
  const order = model.milestoneReadingOrder({
    milestone: { structure: { groups: [], chapters: [{ id: 'c1', title: 'One', group_id: null, position: 1 }] } },
    scenes: [scene('b', 'c1', 1), scene('a', 'c1', 0), scene('u2', null, 1), scene('x', 'gone', 0), scene('u1', null, 0)],
  });
  assert.deepEqual(order.outline[0].chapter.scenes.map((s) => s.scene_id), ['a', 'b']);
  assert.deepEqual(order.unplaced.map((s) => s.scene_id), ['u1', 'x', 'u2']);
});

// ── 5. Retention ─────────────────────────────────────────────────────────────

test('retention: the last 30 days whole, one a day before that, at most 200 — Milestone revisions never pruned', async () => {
  const db = await seededDb({ scribe: true });
  const id = pageId('h1a');
  const { manuscript_id: m } = await sceneRow(db, id);
  ok(await milestones.createManuscriptMilestone(HOLLOW, 'Protected'));
  const [protectedRev] = await revisions(db, id);
  await db.exec(`set session_replication_role = replica;
    update public.scene_revisions set created_at = now() - interval '400 days' where id = '${protectedRev.id}';
    set session_replication_role = origin;`);
  // 60 days × 4 a day of older history, plus 3 today.
  await db.query(`insert into public.scene_revisions (manuscript_id, scene_id, title, content, word_count, saved_at, created_at, reason)
    select $1, $2, 't', jsonb_build_object('n', d * 10 + k), 1, now(), now() - make_interval(days => d, hours => k), 'checkpoint'
      from generate_series(1, 60) d, generate_series(0, 3) k`, [m, id]);
  await db.query(`select public.prune_scene_revisions($1)`, [id]);
  const left = await all(db, `select id, created_at from public.scene_revisions where scene_id = $1`, [id]);
  const old = left.filter((r) => Date.now() - new Date(r.created_at).getTime() > 30.5 * 86_400_000 && r.id !== protectedRev.id);
  const days = new Set(old.map((r) => new Date(r.created_at).toISOString().slice(0, 10)));
  assert.equal(old.length, days.size, 'older than 30 days: one a day');
  assert.ok(left.some((r) => r.id === protectedRev.id), 'the Milestone\'s revision survives, however old');
  const recent = left.filter((r) => Date.now() - new Date(r.created_at).getTime() < 29 * 86_400_000);
  assert.equal(recent.length, 28 * 4, 'every revision of the last 30 days');

  await db.query(`insert into public.scene_revisions (manuscript_id, scene_id, title, content, word_count, saved_at, created_at, reason)
    select $1, $2, 't', jsonb_build_object('m', g), 1, now(), now() - make_interval(mins => g), 'checkpoint'
      from generate_series(1, 300) g`, [m, id]);
  await db.query(`select public.prune_scene_revisions($1)`, [id]);
  const capped = await all(db, `select id from public.scene_revisions where scene_id = $1`, [id]);
  assert.equal(capped.length, 201, '200, plus the Milestone\'s');

  // Clients cannot prune.
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`select public.prune_scene_revisions($1)`, [id])), /permission denied/);
});

// ── 6. Not live objects ──────────────────────────────────────────────────────

test('history is not live: not searched, not duplicated; deleting the Project takes it and its Milestones', async () => {
  const db = await seededDb({ scribe: true });
  await save(db, pageId('h3b'), 'Nothing of the old words remains.');
  await pass(db, 40);
  await save(db, pageId('h3b'), 'Quillfeather lives only in history now.');
  await pass(db, 40);
  await save(db, pageId('h3b'), 'Plain words.');
  ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));
  assert.deepEqual(ok(await search.searchProjectContent(HOLLOW, 'Quillfeather')), [], 'Project Search reads live Scenes only');

  const copy = ok(await projects.duplicateProject(HOLLOW));
  const copyManuscript = (await one(db, `select id from public.manuscripts where project_id = $1`, [copy.id])).id;
  assert.equal((await one(db, `select count(*)::int as n from public.scene_revisions where manuscript_id = $1`, [copyManuscript])).n, 0);
  assert.equal((await one(db, `select count(*)::int as n from public.manuscript_milestones where manuscript_id = $1`, [copyManuscript])).n, 0);

  assert.equal((await projects.deleteProject(HOLLOW)).error, null);
  const m = await all(db, `select id from public.manuscripts where project_id = $1`, [HOLLOW]);
  assert.deepEqual(m, []);
  assert.equal((await one(db, `select count(*)::int as n from public.manuscript_milestones`)).n, 0);
  assert.equal((await one(db, `select count(*)::int as n from public.scene_revisions where scene_id = $1 or manuscript_id <> $2`,
    [pageId('h3b'), copyManuscript])).n, 0);
});

test('a failing checkpoint never fails the save', async () => {
  const db = await seededDb({ scribe: true });
  // Break history on purpose: the save must still land exactly as sent.
  await db.exec(`alter table public.scene_revisions add constraint scene_revisions_break check (word_count < 0) not valid`);
  const before = await sceneRow(db, pageId('h1a'));
  await save(db, pageId('h1a'), 'Saved regardless.');
  const after = await sceneRow(db, pageId('h1a'));
  assert.deepEqual([after.content, after.version], [doc('Saved regardless.'), before.version + 1]);
  assert.equal(await revisionCount(db), 0);
});

test('wording: when a version was saved', () => {
  const now = new Date(2026, 8, 29, 18, 0);
  const t = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).toISOString();
  assert.match(model.historyTime(t(2026, 8, 29, 9, 42), now, 'en-US'), /^Today, 9:42\sAM$/);
  assert.match(model.historyTime(t(2026, 8, 28, 21, 5), now, 'en-US'), /^Yesterday, 9:05\sPM$/);
  assert.match(model.historyTime(t(2026, 8, 23, 9, 0), now, 'en-US'), /^Wed, Sep 23, 9:00\sAM$/);
  assert.match(model.historyTime(t(2025, 11, 31, 9, 0), now, 'en-US'), /2025/);
  assert.equal(model.wordsLabel(1), '1 word');
  assert.equal(model.wordsLabel(1200), '1,200 words');
  assert.equal(model.revisionNote({ reason: 'checkpoint', milestones: [] }), null);
});
