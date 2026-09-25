// Manuscript counting, stored totals, export and Chapter creation hardening
// (Rune 2.0 Phase 1, Task 7, migration 020): the REAL app code against the
// Rune 2.0 schema in real Postgres + RLS.
//
//   * one rule: Chapter total = its placed Scenes; ordered manuscript total =
//     every placed Scene; the account / free-limit total = every Scene
//   * projects.word_count is the ordered total after every create, save, move,
//     reorder, delete and duplication — maintained by the database
//   * export: placed Scenes in order, a scene break between adjacent Scenes,
//     no Scene titles, no Unplaced Scenes, empty Chapters harmless
//   * Chapters can only be created by the checked RPCs; positions never tie
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema
// (lib/legacy-to-rune2.mjs). alice (starter_2k, 3035 words: over her 2,000)
// owns hollow (ordered 1450) and ash (ordered 100, stored a stale 999); bram
// (legacy_15k, 2740 words) owns tide (ordered 1320: t1b 650, t2a 0, t3a 330,
// t3b 340; Unplaced t1a 700, t1c 720) and bramEmpty; cora has no words.
import 'fake-indexeddb/auto'; // games.ts pulls in the offline modules
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, readRepoFile, readMigration, HARNESS_DIR, REPO_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { resetPdfRecording } from '../mocks/jspdf.js';
import {
  USERS, PROJECTS, chapterId, pageId, projectId, seedFixture, syntheticDoc, markerFor, chapterTitleFor,
} from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const CORA = USERS.cora.id;

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;
const stored = async (db, pid) => (await one(db, `select word_count from public.projects where id = $1`, [pid])).word_count;
const accountTotal = async (db, userId) => (await as(db, userId).rpc('account_word_total')).data;
const versionOf = async (db, id) => (await one(db, `select version from public.scenes where id = $1`, [id])).version;
const wordsOf = async (db, id) => (await one(db, `select word_count from public.scenes where id = $1`, [id])).word_count;

let legacy;
let manuscript, queries, chapters, projects, scenes, games, onboarding, exporter;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  manuscript = await bundleForTest('src/lib/manuscript.ts', { name: 'tot_manuscript' });
  queries = await bundleForTest('src/lib/manuscriptQueries.ts', { name: 'tot_queries' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'tot_chapters' });
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'tot_projects' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'tot_scenes' });
  games = await bundleForTest('src/lib/actions/games.ts', { name: 'tot_games' });
  onboarding = await bundleForTest('src/app/api/onboarding/route.ts', { name: 'tot_onboarding' });
  exporter = await bundleForTest('src/lib/export/projectExport.ts', {
    name: 'tot_projectExport', aliases: { jspdf: path.join(HARNESS_DIR, 'mocks/jspdf.js') },
  });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = as(db, userId);
  for (const mod of [chapters, projects, scenes, games, onboarding]) mod.setServerClient(sb);
  return sb;
}

/**
 * The stored total, the SQL rule and the app's rule agree for the Project —
 * and every Chapter total is exactly its placed Scenes.
 */
async function assertTotalsAgree(db, pid, userId, expected, context = '') {
  const sb = as(db, userId);
  const { data: chs, error } = await queries.getChaptersWithScenes(sb, pid);
  assert.equal(error, null);
  const app = manuscript.calculateProjectWordCount(chs);
  const sql = (await sb.rpc('ordered_manuscript_word_total', { p_manuscript_id: await manuscriptOf(db, pid) })).data;
  assert.deepEqual({ stored: await stored(db, pid), sql, app }, { stored: expected, sql: expected, app: expected }, `ordered total ${context}`);
  for (const c of chs) {
    const { n } = await one(db, `select coalesce(sum(word_count), 0)::int as n from public.scenes where chapter_id = $1`, [c.id]);
    assert.equal(manuscript.calculateChapterWordCount(c), n, `Chapter ${c.title} ${context}`);
  }
}

// ── 1. one counting rule ──────────────────────────────────────────────────────

test('counting: the app rule, the SQL rule and the stored total agree for every Project; Unplaced words are excluded', async () => {
  const db = await seededDb();
  await db.exec(readMigration('020_manuscript_totals.sql').match(/^update public\.projects p[\s\S]*?;$/m)[0]); // heal ash's stale 999
  for (const [label, want] of [['hollow', 1450], ['ash', 100], ['tide', 1320], ['bramEmpty', 0], ['coraEmpty', 0]]) {
    await assertTotalsAgree(db, projectId(label), USERS[PROJECTS[label].user].id, want, label);
  }
  // The Unplaced lists hold words the ordered totals leave out.
  const unplaced = async (label, userId) => manuscript.sumSceneWords((await queries.getUnplacedSceneSummaries(as(db, userId), projectId(label))).data);
  assert.deepEqual([await unplaced('hollow', ALICE), await unplaced('ash', ALICE), await unplaced('tide', BRAM)], [380 + 95 + 250 + 260, 500, 700 + 720]);
});

test('counting: the account / free-limit total still counts every Scene, placed and Unplaced — it is not the ordered total', async () => {
  const db = await seededDb();
  assert.equal(await accountTotal(db, ALICE), 3035, 'hollow 1450 + 985 Unplaced, ash 100 + 500 Unplaced');
  assert.equal(await accountTotal(db, BRAM), 2740, 'tide 1320 + 1420 Unplaced');
  // Moving prose to Unplaced lowers the ordered total, never the account total.
  signIn(db, BRAM);
  assert.equal((await scenes.moveSceneToUnplaced(pageId('t3a'))).error, null);
  assert.equal(await stored(db, projectId('tide')), 990);
  assert.equal(await accountTotal(db, BRAM), 2740);
  // An over-limit writer stays blocked whatever is placed: alice's placed words alone (1550) are under 2,000.
  signIn(db, ALICE);
  const blocked = await scenes.syncSceneWithLimitCheck(pageId('h1a'), syntheticDoc('h1a', 121), 121, await versionOf(db, pageId('h1a')));
  assert.equal(blocked.status, 'word_limit_blocked');
});

test('counting: writing-activity semantics are untouched — no totals path writes writing_sessions', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const history = () => all(db, `select * from public.writing_sessions order by id`);
  const before = await history();
  await scenes.syncSceneWithLimitCheck(pageId('t3a'), syntheticDoc('t3a', 400), 400, await versionOf(db, pageId('t3a')));
  await scenes.moveSceneToUnplaced(pageId('t3a'));
  await scenes.deleteScene(pageId('t1a'));
  assert.deepEqual((await history()).filter((r) => r.scene_id !== pageId('t1a')), before.filter((r) => r.scene_id !== pageId('t1a')),
    'only the deleted Scene\'s own rows go (cascade, as before)');
});

// ── 2. the stored total after every change ────────────────────────────────────

test('stored total: correct after every save, creation, move, reorder, deletion and duplication, with no app-side write', async () => {
  const db = await seededDb();
  const sb = signIn(db, BRAM);
  const tide = projectId('tide');
  let expected = 1320;
  const step = async (context, fn, delta) => {
    const r = await fn();
    assert.ok(!r?.error && r?.status !== 'error', `${context}: ${JSON.stringify(r?.error ?? r)}`);
    expected += delta;
    await assertTotalsAgree(db, tide, BRAM, expected, context);
    return r;
  };
  const save = (id, words) => async () => scenes.syncSceneWithLimitCheck(id, syntheticDoc('x', words), words, await versionOf(db, id));

  sb.calls.length = 0;
  await step('save a placed Scene (330 → 400)', save(pageId('t3a'), 400), +70);
  assert.ok(!sb.calls.some((c) => c.kind === 'from' && c.name === 'projects'), 'the save never writes projects from the app');
  await step('save an Unplaced Scene (700 → 710)', save(pageId('t1a'), 710), 0);
  await step('create an empty placed Scene', () => scenes.createScene(chapterId('tide.ch3'), 'New'), 0);
  await step('create an empty Unplaced Scene', () => scenes.createUnplacedScene(tide, 'Loose'), 0);
  await step('Arena: append a sprint Scene (5 words)', () => games.appendSprintToProject(tide, chapterId('tide.ch3'), 5, '<p>a b c d e</p>'), +5);
  await step('Arena: append to an existing Scene (+3)', () => games.appendToExistingScene(pageId('t3b'), '<p>f g h</p>', 3), +3);
  await step('a Chapter whose first Scene carries words (7)', async () => (await sb.rpc('create_chapter_checked', {
    p_manuscript_id: await manuscriptOf(db, tide), p_title: 'Chapter 4', p_scene_title: 'Scene 1',
    p_scene_content: syntheticDoc('c4', 7), p_scene_word_count: 7,
  })).data, +7);
  await step('move Unplaced → Chapter (720)', () => scenes.moveSceneToChapter(pageId('t1c'), chapterId('tide.ch2')), +720);
  await step('move Chapter → Unplaced (400)', () => scenes.moveSceneToUnplaced(pageId('t3a')), -400);
  await step('move Chapter → Chapter', () => scenes.moveSceneToChapter(pageId('t1b'), chapterId('tide.ch3')), 0);
  const ch3 = (await all(db, `select id from public.scenes where chapter_id = $1 order by position`, [chapterId('tide.ch3')])).map((r) => r.id);
  await step('reorder a Chapter', () => scenes.reorderScenes(chapterId('tide.ch3'), [...ch3].reverse()), 0);
  await step('delete a placed Scene (343)', () => scenes.deleteScene(pageId('t3b')), -343);
  await step('delete an Unplaced Scene', () => scenes.deleteScene(pageId('t1a')), 0);
  await step('delete a Chapter with a 720-word Scene', () => chapters.deleteChapter(chapterId('tide.ch2'), tide), -720);
  assert.equal(expected, 1320 + 70 + 5 + 3 + 7 + 720 - 400 - 343 - 720);

  const dup = await projects.duplicateProject(tide);
  assert.equal(dup.error, null, dup.error);
  await assertTotalsAgree(db, dup.data.id, BRAM, expected, 'the duplicate');
  assert.equal((await projects.deleteProject(dup.data.id)).error, null, 'a Project deletion cascades through the trigger cleanly');
  assert.equal((await one(db, `select count(*)::int as n from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where m.project_id = $1`, [dup.data.id])).n, 0);
  await assertTotalsAgree(db, tide, BRAM, expected, 'the source, after its copy is deleted');
});

test('stored total: onboarding\'s first sentence and createProjectWithDraft are counted at creation', async () => {
  const db = await seededDb();
  signIn(db, CORA);
  const res = await onboarding.POST(new Request('http://localhost/api/onboarding', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Shore', firstSentence: 'It began at the shore.' }),
  }));
  assert.equal(res.status, 200);
  const { data } = await res.json();
  await assertTotalsAgree(db, data.projectId, CORA, 5, 'onboarding');
  const draft = await projects.createProjectWithDraft('Draft');
  assert.equal(draft.error, null, draft.error);
  await assertTotalsAgree(db, draft.data.projectId, CORA, 0, 'createProjectWithDraft');
});

test('stored total: a stale value heals on the next placed-word change (the whole total is recomputed, never a delta)', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  assert.equal(await stored(db, projectId('ash')), 999, 'carried stale from the fixture');
  await scenes.syncSceneWithLimitCheck(pageId('a2a'), syntheticDoc('a2a', 50), 50, await versionOf(db, pageId('a2a')));
  await assertTotalsAgree(db, projectId('ash'), ALICE, 90, 'after one save');
  // A rename or an Unplaced save does not touch it.
  await db.exec(`update public.projects set word_count = 7 where id = '${projectId('ash')}'`);
  await scenes.renameScene(pageId('a2a'), 'Renamed');
  await scenes.syncSceneWithLimitCheck(pageId('a1a'), syntheticDoc('a1a', 400), 400, await versionOf(db, pageId('a1a')));
  assert.equal(await stored(db, projectId('ash')), 7, 'no placed-word change, no recompute');
  await scenes.deleteScene(pageId('a2b'));
  await assertTotalsAgree(db, projectId('ash'), ALICE, 50, 'healed by the deletion');
});

test('stored total: interleaved saves, moves, post-sync maintenance and deletions end on the true total', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const tide = projectId('tide');
  // Every request is its own transaction; the calls interleave between awaits.
  // The old app path (read the Scenes, then write the total) could store a
  // total older than a save that committed between its two requests.
  const v = async (id) => versionOf(db, id);
  const [va, vb, v1b] = [await v(pageId('t3a')), await v(pageId('t3b')), await v(pageId('t1b'))];
  const results = await Promise.all([
    scenes.syncSceneWithLimitCheck(pageId('t3a'), syntheticDoc('t3a', 500), 500, va),
    scenes.afterSceneSync(pageId('t3a')),
    scenes.syncSceneWithLimitCheck(pageId('t3b'), syntheticDoc('t3b', 10), 10, vb),
    scenes.afterSceneSync(pageId('t3b')),
    scenes.syncSceneWithLimitCheck(pageId('t1b'), syntheticDoc('t1b', 600), 600, v1b),
    scenes.moveSceneToChapter(pageId('t1c'), chapterId('tide.ch3')),
    scenes.moveSceneToUnplaced(pageId('t2a')),
    scenes.deleteScene(pageId('t1a')),
  ]);
  for (const r of results) assert.ok(!r?.error && r?.status !== 'error', JSON.stringify(r));
  const placed = await one(db, `select coalesce(sum(word_count), 0)::int as n from public.scenes s join public.manuscripts m on m.id = s.manuscript_id
    where m.project_id = $1 and s.chapter_id is not null`, [tide]);
  assert.equal(placed.n, 600 + 500 + 10 + 720);
  await assertTotalsAgree(db, tide, BRAM, placed.n, 'after the interleaving');
});

test('stored total: the trigger fires only for placed-word changes and does its work as the database, not the caller', async () => {
  const db = await seededDb();
  const trg = await one(db, `select pg_get_triggerdef(t.oid) as def from pg_trigger t where t.tgname = 'scenes_refresh_project_word_count'`);
  assert.equal(trg.def, 'CREATE TRIGGER scenes_refresh_project_word_count AFTER INSERT OR DELETE OR UPDATE OF word_count, chapter_id ON public.scenes FOR EACH ROW EXECUTE FUNCTION refresh_project_word_count()');
  const fns = await all(db, `select p.proname, p.prosecdef, array_to_string(p.proconfig, ',') as config,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('refresh_project_word_count', 'ordered_manuscript_word_total')
    order by p.proname`);
  assert.deepEqual(fns, [
    { proname: 'ordered_manuscript_word_total', prosecdef: false, config: 'search_path=""', anon: false },
    { proname: 'refresh_project_word_count', prosecdef: true, config: 'search_path=""', anon: false },
  ]);
  // SECURITY INVOKER: another writer sums nothing.
  const hollow = await manuscriptOf(db, projectId('hollow'));
  assert.equal((await as(db, BRAM).rpc('ordered_manuscript_word_total', { p_manuscript_id: hollow })).data, 0);
  assert.ok((await as(db, null).rpc('ordered_manuscript_word_total', { p_manuscript_id: hollow })).error, 'anon cannot call it');
  // move_scene no longer writes the total itself; one definition remains.
  const moveBody = (await one(db, `select prosrc from pg_proc where proname = 'move_scene'`)).prosrc;
  assert.doesNotMatch(moveBody, /update public\.projects/);
});

// ── 3. manuscript export ──────────────────────────────────────────────────────

const pdfTexts = () => globalThis.__runeTestPdf.texts;
const BREAK = '* * *';

/** The export's structure, in print order: Chapter headings, Scene markers and breaks. */
async function exportedSequence(db, userId, pid) {
  resetPdfRecording();
  const { chapters: chs, scenesPerChapter } = await exporter.loadManuscriptForExport(as(db, userId), pid);
  await exporter.exportProjectAsPdf({ title: 'fixture-project' }, chs, scenesPerChapter);
  const headings = Object.fromEntries(chs.map((c) => [c.title.toUpperCase(), `# ${c.title}`]));
  return pdfTexts().flatMap((t) => (headings[t] ? [headings[t]] : t === BREAK ? [BREAK] : t.startsWith('fixture-marker-') ? [t.slice(15)] : []));
}

test('export: each Chapter prints all its placed Scenes in Scene order, with a break only BETWEEN Scenes; Unplaced excluded; empty Chapters harmless', async () => {
  const db = await seededDb();
  const ch = (label) => `# ${chapterTitleFor(label)}`;
  assert.deepEqual(await exportedSequence(db, ALICE, projectId('hollow')), [
    ch('hollow.ch1'), 'h1a',
    ch('hollow.ch2'), 'h2a',
    ch('hollow.ch3'), 'h3a', // h3b, h3c are Unplaced
    // hollow.ch5 (position 4) has no Scene: no heading, nothing printed.
    ch('hollow.ch4'), 'h4a', BREAK, 'h4c', // h4b (empty) prints nothing and takes no break
    ch('hollow.ch6'), 'h6c', // h6a, h6b are Unplaced
  ]);
  assert.deepEqual(await exportedSequence(db, BRAM, projectId('tide')), [
    ch('tide.ch1'), 't1b',
    ch('tide.ch2'), // its only Scene is empty: the heading, and nothing after it
    ch('tide.ch3'), 't3a', BREAK, 't3b',
  ]);

  // Moves and reorders are followed; the last Scene is never followed by a break.
  signIn(db, ALICE);
  for (const id of ['h1a', 'h3a', 'h6c'].map(pageId)) assert.equal((await scenes.moveSceneToChapter(id, chapterId('hollow.ch4'))).error, null);
  assert.equal((await scenes.moveSceneToChapter(pageId('h3b'), chapterId('hollow.ch4'))).error, null);
  const order = (await all(db, `select id from public.scenes where chapter_id = $1 order by position`, [chapterId('hollow.ch4')])).map((r) => r.id);
  assert.equal((await scenes.reorderScenes(chapterId('hollow.ch4'), [...order].reverse())).error, null);
  assert.deepEqual(await exportedSequence(db, ALICE, projectId('hollow')), [
    ch('hollow.ch2'), 'h2a',
    ch('hollow.ch4'), 'h3b', BREAK, 'h6c', BREAK, 'h3a', BREAK, 'h1a', BREAK, 'h4c', BREAK, 'h4a',
  ], 'Chapters left without Scenes (ch1, ch3, ch6) print nothing');
});

test('export: Scene titles are never printed', async () => {
  const db = await seededDb();
  await db.exec(`update public.scenes set title = 'scenetitletoken-' || left(id::text, 8)`);
  await exportedSequence(db, BRAM, projectId('tide'));
  const texts = pdfTexts();
  assert.ok(texts.includes(markerFor('t3b')), 'the prose was printed');
  assert.deepEqual(texts.filter((t) => t.includes('scenetitletoken')), []);
});

test('export: planManuscriptExport, directly — ordering, empty Scenes at either end, stray rows, no text at all', () => {
  const chapter = (id, position) => ({ id, title: id, position });
  const scene = (id, chapter_id, position, text) => ({
    id, chapter_id, position, title: `title-${id}`,
    content: text === null ? null : { type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] },
  });
  const plan = exporter.planManuscriptExport(
    [chapter('B', 2), chapter('A', 1), chapter('C', 3), chapter('D', 4)],
    {
      A: [scene('a3', 'A', 5, 'three'), scene('a0', 'A', 0, ''), scene('a1', 'A', 1, 'one'), scene('a9', 'A', 9, null), scene('x', 'Z', 2, 'stray')],
      B: [scene('b0', 'B', 0, '   ')],
      D: [],
    }
  );
  assert.deepEqual(plan.map((c) => [c.chapter.id, c.scenes.map((s) => s.id)]), [
    ['A', ['a1', 'a3']], // position order; empty a0 / a9 dropped; the stray Scene of another Chapter ignored
    ['B', []], // a Chapter whose Scenes have no text: heading only
    // C (no entry) and D (no Scenes) are left out
  ]);
});

// ── 4. Chapter creation hardening ─────────────────────────────────────────────

test('Chapters: a direct insert is refused for every client, into every Manuscript, including the writer\'s own', async () => {
  const db = await seededDb();
  const snapshot = () => all(db, `select id, manuscript_id, position from public.chapters order by id`);
  const before = await snapshot();
  const hollow = await manuscriptOf(db, projectId('hollow'));
  const empty = await manuscriptOf(db, projectId('bramEmpty'));
  for (const [who, userId, m] of [['alice, own', ALICE, hollow], ['bram, own empty Manuscript', BRAM, empty], ['bram, alice\'s', BRAM, hollow], ['anon', null, hollow]]) {
    const r = await as(db, userId).from('chapters').insert({ manuscript_id: m, title: 'direct', position: 99 });
    assert.equal(r.error?.code, '42501', who);
  }
  assert.deepEqual(await snapshot(), before);
  const grants = await one(db, `select has_table_privilege('authenticated', 'public.chapters', 'INSERT') as auth,
    has_table_privilege('anon', 'public.chapters', 'INSERT') as anon,
    (select count(*)::int from pg_policies where tablename = 'chapters' and cmd = 'INSERT') as policies`);
  assert.deepEqual(grants, { auth: false, anon: false, policies: 0 });
});

test('Chapters: checked creation still works — createChapter, createProjectWithDraft, onboarding, duplication — and rename/delete are unchanged', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const c = await chapters.createChapter(projectId('bramEmpty'), 'Chapter 1');
  assert.equal(c.error, null, c.error);
  assert.equal(c.data.position, 1);
  assert.equal((await chapters.createChapter(projectId('tide'), 'Chapter 4')).data.position, 4);
  const renamed = await chapters.updateChapter(c.data.id, { title: 'Renamed' }, projectId('bramEmpty'));
  assert.equal(renamed.data.title, 'Renamed');
  const dup = await projects.duplicateProject(projectId('tide'));
  assert.equal(dup.error, null, dup.error);
  assert.deepEqual(
    (await all(db, `select title, position from public.chapters where manuscript_id = $1 order by position`, [await manuscriptOf(db, dup.data.id)])),
    (await all(db, `select title, position from public.chapters where manuscript_id = $1 order by position`, [await manuscriptOf(db, projectId('tide'))])));
  assert.equal((await chapters.deleteChapter(c.data.id, projectId('bramEmpty'))).error, null);

  signIn(db, CORA);
  assert.equal((await projects.createProjectWithDraft('Draft')).data.chapter.position, 1);
  const res = await onboarding.POST(new Request('http://localhost/api/onboarding', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Shore', firstSentence: null }),
  }));
  assert.equal(res.status, 200);
});

test('Chapters: simultaneous creations (and a duplication) never produce tied or invalid positions; a tie cannot be written', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const tide = projectId('tide');
  const results = await Promise.all([
    ...[1, 2, 3, 4, 5, 6].map((n) => chapters.createChapter(tide, `New ${n}`)),
    projects.duplicateProject(tide),
    chapters.createChapter(projectId('bramEmpty'), 'Chapter 1'),
  ]);
  for (const r of results) assert.equal(r.error, null, r.error);
  assert.deepEqual(results.slice(0, 6).map((r) => r.data.position).sort((a, b) => a - b), [4, 5, 6, 7, 8, 9]);
  const ties = await all(db, `select manuscript_id, position from public.chapters group by 1, 2 having count(*) > 1 or position < 1`);
  assert.deepEqual(ties, []);

  const con = await one(db, `select pg_get_constraintdef(oid) as def, condeferrable, condeferred from pg_constraint
    where conname = 'chapters_sibling_position_key'`);
  assert.deepEqual(con, { def: 'UNIQUE NULLS NOT DISTINCT (manuscript_id, group_id, "position") DEFERRABLE', condeferrable: true, condeferred: false },
    'per parent since migration 022 (group_id null = top level)');
  // Writers cannot write a position at all (move_chapter does, migration 022)…
  const tie = await as(db, BRAM).from('chapters').update({ position: 1 }).eq('id', chapterId('tide.ch2')).select('id');
  assert.equal(tie.error?.code, '42501');
  // …and a tie is refused whoever writes it.
  await assert.rejects(db.query(`update public.chapters set position = 1 where id = $1`, [chapterId('tide.ch2')]), /chapters_sibling_position_key/);
  // A full swap in one statement is fine (deferrable, for a future reorder RPC).
  await db.exec(`update public.chapters set position = case id when '${chapterId('tide.ch1')}' then 2 else 1 end
    where id in ('${chapterId('tide.ch1')}', '${chapterId('tide.ch2')}')`);
  assert.deepEqual((await all(db, `select position from public.chapters where id in ($1, $2) order by id`, [chapterId('tide.ch1'), chapterId('tide.ch2')])).map((r) => r.position), [2, 1]);
});

// ── 5. the migration itself ───────────────────────────────────────────────────

async function dbAt019() {
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  const files = fs.readdirSync(path.join(REPO_DIR, 'src/lib/supabase/migrations'))
    .filter((f) => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 13 && Number(f.slice(0, 3)) <= 19).sort();
  for (const f of files) await db.exec(readMigration(f));
  return db;
}

test('migration 020: refuses over tied Chapter positions and a second run, changing nothing; otherwise backfills the stored totals', async () => {
  const db = await dbAt019();
  await db.exec(`insert into auth.users (id) values ('${CORA}')`);
  await db.exec(`insert into public.projects (id, user_id, title, word_count) values ('${projectId('coraEmpty')}', '${CORA}', 't', 42)`);
  const m = await manuscriptOf(db, projectId('coraEmpty'));
  await db.exec(`insert into public.chapters (manuscript_id, title, position) values ('${m}', 'a', 1), ('${m}', 'b', 1)`);
  await assert.rejects(db.exec(readMigration('020_manuscript_totals.sql')), /1 Manuscript Chapter position\(s\) are shared/);
  assert.equal((await one(db, `select count(*)::int as n from public.schema_migrations where version = '020'`)).n, 0);

  await db.exec(`update public.chapters set position = 2 where title = 'b'`);
  const ch = (await one(db, `select id from public.chapters where title = 'a'`)).id;
  await db.exec(`insert into public.scenes (manuscript_id, chapter_id, title, word_count, position) values
    ('${m}', '${ch}', 's', 30, 0), ('${m}', null, 'u', 900, 0)`);
  assert.equal(await stored(db, projectId('coraEmpty')), 42, 'before 020, nothing maintains it');
  await db.exec(readMigration('020_manuscript_totals.sql'));
  assert.equal(await stored(db, projectId('coraEmpty')), 30, 'backfilled to the ordered total');
  await assert.rejects(db.exec(readMigration('020_manuscript_totals.sql')), /already been applied/);
});
