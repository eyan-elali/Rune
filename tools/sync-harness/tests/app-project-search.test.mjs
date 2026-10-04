// Project Search (Rune 2.0 Workspace, Milestone 12, migration 029): the REAL
// search action and loaders against the Rune 2.0 schema in real Postgres +
// RLS, and the pure search rules the overlay and the reference pickers share
// (lib/rune2/projectSearch.ts, lib/rune2/references.ts).
//
//   * what is found: Page / Entry / Collection / Chapter / Group / Folder
//     titles, Scene titles, and text inside Pages, Entries and Scene prose
//   * readable text only: never TipTap keys, node types, marks or attributes;
//     a phrase across a mark is found; paragraphs never run together
//   * ranking: exact, prefix, contains, then text — stable within a tier
//   * each result's kind and place; no duplicate canonical result
//   * a Chapter's only Scene is found as its Chapter and opens there, one tab
//   * ownership and current-Project isolation; anon can't search
//   * the reference pickers are Project Search narrowed to valid targets
//   * searching changes nothing: Scene rows, content, versions, words
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow and ash; bram owns tide. In hollow, ch1 holds one Scene (h1a),
// ch4 three (h4a, h4b, h4c); h3b is Unplaced. Scene prose starts with its
// marker word, e.g. "fixture-marker-h4a".
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, markerFor, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const ASH = projectId('ash');
const TIDE = projectId('tide');

const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((p) => ({
    type: 'paragraph',
    content: (Array.isArray(p) ? p : [p]).map((t) => (typeof t === 'string' ? { type: 'text', text: t } : t)),
  })),
});

let legacy;
let search, refsAction, collections, pages, tree, structure, scenes, workspace, manuscriptLoader, engine, refModel, nav, workingSet;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  search = await bundleForTest('src/lib/actions/projectSearch.ts', { name: 'ps_search' });
  refsAction = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'ps_refs' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'ps_collections' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'ps_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'ps_tree' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'ps_structure' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'ps_scenes' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'ps_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'ps_manuscript' });
  engine = await bundleForTest('src/lib/rune2/projectSearch.ts', { name: 'ps_engine' });
  refModel = await bundleForTest('src/lib/rune2/references.ts', { name: 'ps_ref_model' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'ps_nav' });
  workingSet = await bundleForTest('src/lib/rune2/workingSet.ts', { name: 'ps_working_set' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [search, refsAction, collections, pages, tree, structure, scenes, workspace, manuscriptLoader]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };

async function setContent(db, table, id, content) {
  await db.query(`update public.${table} set content = $1 where id = $2`, [JSON.stringify(content), id]);
}

/**
 * Alice's Hollow, as a writer might have it: a Group "Part One" holding
 * Chapter 4; a Folder "Research" with the Page "Research Notes"; a top-level
 * Page "Ending Ideas"; Collections Characters (Nerai, Nerai's Sister, Alaric)
 * and Factions (Drelareth); Scene h4a titled "The gates of Var-Zal".
 */
async function hollow(db) {
  signIn(db, ALICE);
  const part = ok(await structure.createGroup(HOLLOW, 'Part One'));
  ok(await structure.moveChapter(chapterId('hollow.ch4'), part.id, null, HOLLOW));
  const research = ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const notes = ok(await pages.createWorkspacePage(HOLLOW, 'Research Notes', research.nodeId));
  const ending = ok(await pages.createWorkspacePage(HOLLOW, 'Ending Ideas'));
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const factions = ok(await collections.createWorkspaceCollection(HOLLOW, 'Factions')).collection;
  const nerai = ok(await collections.createCollectionEntry(characters.id, 'Nerai'));
  const sister = ok(await collections.createCollectionEntry(characters.id, "Nerai's Sister"));
  const alaric = ok(await collections.createCollectionEntry(characters.id, 'Alaric'));
  const drelareth = ok(await collections.createCollectionEntry(factions.id, 'Drelareth'));
  ok(await scenes.renameScene(pageId('h4a'), 'The gates of Var-Zal'));

  await setContent(db, 'workspace_documents', notes.id, doc('Salt roads run east of the marsh.', 'Nerai crossed them twice.'));
  await setContent(db, 'workspace_documents', ending.id, doc(['She was ', { type: 'text', marks: [{ type: 'italic' }], text: 'never' }, ' going back.']));
  await setContent(db, 'workspace_collection_entries', alaric.id, doc('Keeps a lamplight of green glass.'));
  await setContent(db, 'workspace_collection_entries', drelareth.id, doc('Sworn to the lamplight keepers.'));
  return { part, research, notes, ending, characters, factions, nerai, sister, alaric, drelareth };
}

async function shellIndex(projectId = HOLLOW) {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(projectId), await workspace.loadProjectWorkspace(projectId)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

/** Project Search as the overlay runs it: titles from the index, text from the server. */
async function find(query, projectId = HOLLOW, scope = {}) {
  const index = await shellIndex(projectId);
  const r = await search.searchProjectContent(projectId, query);
  assert.equal(r.error, null, r.error);
  return engine.searchProject(engine.searchObjects(index), query, scope, r.data);
}

const ids = (results) => results.map((r) => r.id);
const scenesSnapshot = (db) => all(db, `select id, title, content, word_count, version, updated_at, chapter_id, position from public.scenes order by id`);

// ── 1. What is found ─────────────────────────────────────────────────────────

test('titles: Pages, Entries, Collections, Chapters, Groups, Folders and Scenes, by the title the writer sees', async () => {
  const db = await seededDb();
  const t = await hollow(db);

  assert.deepEqual(ids(await find('Research Notes')), [t.notes.id], 'a Page by title');
  assert.deepEqual(ids(await find('Ending')), [t.ending.id]);
  assert.equal((await find('Alaric'))[0].id, t.alaric.id, 'an Entry by title');
  assert.equal((await find('Factions'))[0].id, t.factions.id, 'a Collection by title');
  assert.equal((await find('Part One'))[0].id, t.part.id, 'a Group by title');
  assert.equal((await find('Research'))[0].id, t.research.folder.id, 'a Folder by title (exact beats the Page\'s prefix)');
  assert.deepEqual(ids(await find('gates of var')), [pageId('h4a')], 'a Scene by title, ignoring case');

  // An unnamed placed Scene is found by the label it shows ("Scene 2").
  await db.query(`update public.scenes set title = '' where id = $1`, [pageId('h4b')]);
  const index = await shellIndex();
  const chapter4 = index.get(chapterId('hollow.ch4'));
  assert.equal((await find(chapter4.title))[0].id, chapter4.id, 'a Chapter by title');
  const h4b = index.get(pageId('h4b'));
  assert.equal(h4b.named, false);
  assert.ok(/^Scene \d+$/.test(h4b.title), h4b.title);
  assert.ok(ids(await find(h4b.title)).includes(h4b.id));

  // Accents and spacing don't matter.
  assert.deepEqual(ids(await find('  NÉRAÏ ')).slice(0, 1), [t.nerai.id]);
});

test('text inside Pages, Entries and Scene prose — readable text only, never JSON', async () => {
  const db = await seededDb();
  const t = await hollow(db);

  const inPage = await find('salt roads');
  assert.deepEqual(ids(inPage), [t.notes.id], 'Page content');
  assert.equal(inPage[0].tier, 4);
  assert.match(inPage[0].snippet, /Salt roads run east/);

  assert.deepEqual(ids(await find('green glass')), [t.alaric.id], 'Entry content');
  assert.deepEqual(ids(await find(markerFor('h4a'))), [pageId('h4a')], 'Scene prose');
  assert.deepEqual(ids(await find(markerFor('h3b'))), [pageId('h3b')], 'Unplaced Scene prose');

  // A phrase across a mark reads as written; two paragraphs never run together.
  assert.deepEqual(ids(await find('was never going')), [t.ending.id]);
  assert.deepEqual(await find('marsh.Nerai'), []);
  assert.ok(ids(await find('marsh. Nerai')).includes(t.notes.id), 'paragraphs are separated by a space');

  // Structure is never text: node types, keys and marks don't match.
  for (const q of ['paragraph', 'italic', '"type"', 'marks', 'content']) {
    const r = ok(await search.searchProjectContent(HOLLOW, q));
    assert.deepEqual(r, [], `"${q}" is not in anyone's prose`);
  }

  // rich_text_plain on its own.
  const plain = async (d) => (await db.query(`select public.rich_text_plain($1::jsonb) as t`, [d === null ? null : JSON.stringify(d)])).rows[0].t;
  assert.equal(await plain(doc(['a ', { type: 'text', marks: [{ type: 'bold' }], text: 'b' }], 'c  \n d')), 'a b c d');
  assert.equal(await plain({ type: 'doc', content: [] }), '');
  assert.equal(await plain(null), '');
  assert.equal(await plain({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2, text: 'attr' }, content: [{ type: 'text', text: 'Title' }] }] }), 'Title',
    'an attribute that happens to be called text is not text');
});

test('queries shorter than two characters search titles only; excerpts are trimmed to words', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  assert.deepEqual(ok(await search.searchProjectContent(HOLLOW, 'a')), []);
  assert.deepEqual(ok(await search.searchProjectContent(HOLLOW, '   ')), []);
  assert.ok(ids(engine.searchProject(engine.searchObjects(await shellIndex()), 'a')).includes(t.alaric.id), 'one letter still finds titles');

  await setContent(db, 'workspace_documents', t.ending.id, doc(`${'word '.repeat(40)}the needle is here ${'tail '.repeat(40)}`));
  const [m] = ok(await search.searchProjectContent(HOLLOW, 'needle'));
  assert.equal(m.id, t.ending.id);
  assert.match(m.snippet, /^…word( word)* the needle is here( tail)*…$/, 'whole words, an ellipsis where the text goes on');
  assert.ok(m.snippet.length < 200);

  // Result ids come back in a stable order and never exceed the limit.
  const many = ok(await search.searchProjectContent(HOLLOW, 'fixture-marker'));
  assert.ok(many.length > 3);
  assert.deepEqual(ok(await search.searchProjectContent(HOLLOW, 'fixture-marker')), many);
});

// ── 2. Ranking and presentation ──────────────────────────────────────────────

test('ranking: exact title, title prefix, title contains, then text — stable within a tier', async () => {
  const db = await seededDb();
  const t = await hollow(db);

  // "Nerai" is an exact title, a prefix of "Nerai's Sister", and in Research Notes' text.
  const r = await find('nerai');
  assert.deepEqual(ids(r), [t.nerai.id, t.sister.id, t.notes.id]);
  assert.deepEqual(r.map((x) => x.tier), [0, 1, 4]);

  // "lamplight": in Alaric's and Drelareth's text only → both tier 4, in the Project's order.
  assert.deepEqual(ids(await find('lamplight')), [t.alaric.id, t.drelareth.id]);

  // A title match is never repeated as a text match.
  await setContent(db, 'workspace_collection_entries', t.nerai.id, doc('Nerai, of the salt roads.'));
  const again = await find('nerai');
  assert.equal(new Set(ids(again)).size, again.length, 'no duplicate result');
  assert.equal(again.find((x) => x.id === t.nerai.id).tier, 0);

  // Pure: the tiers on their own.
  const o = { title: 'The Gates', context: 'Chapter 3' };
  assert.equal(engine.titleTier(o, 'the gates'), 0);
  assert.equal(engine.titleTier(o, 'the'), 1);
  assert.equal(engine.titleTier(o, 'gates'), 2);
  assert.equal(engine.titleTier(o, 'chapter'), null);
  assert.equal(engine.titleTier(o, 'chapter', true), 3);
});

test('each result says what it is and where it lives', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const index = await shellIndex();
  const objects = engine.searchObjects(index);
  const of = (id) => objects.find((o) => o.id === id);
  const label = (id) => `${engine.SEARCH_KIND_LABEL[of(id).kind]} · ${of(id).context}`;
  const ch4 = index.get(chapterId('hollow.ch4'));

  assert.equal(label(t.nerai.id), 'Entry · Characters');
  assert.equal(label(pageId('h4a')), `Scene · ${ch4.title}`);
  assert.equal(label(t.notes.id), 'Page · Workspace / Research');
  assert.equal(label(t.ending.id), 'Page · Workspace');
  assert.equal(label(t.characters.id), 'Collection · Workspace');
  assert.equal(label(t.research.folder.id), 'Folder · Workspace');
  assert.equal(label(ch4.id), 'Chapter · Part One');
  assert.equal(label(t.part.id), 'Group · Manuscript');
  assert.equal(label(pageId('h3b')), 'Scene · Unplaced');
  assert.equal(label(chapterId('hollow.ch1')), 'Chapter · Manuscript');

  // Every object once; no internal ids or JSON as a title or place.
  assert.equal(new Set(objects.map((o) => o.id)).size, objects.length);
  for (const o of objects) assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(o.title + o.context), `${o.title} · ${o.context}`);

  // Highlighting is presentation only: pieces of the same text.
  assert.deepEqual(engine.highlight('The gates of the city', 'the'), [
    { text: 'The', match: true }, { text: ' gates of ', match: false }, { text: 'the', match: true }, { text: ' city', match: false },
  ]);
  assert.deepEqual(engine.highlight('abc', ''), [{ text: 'abc', match: false }]);
});

// ── 3. Opening ───────────────────────────────────────────────────────────────

test('a Chapter\'s only Scene is found as its Chapter and opens there; no result ever makes a second tab', async () => {
  const db = await seededDb();
  await hollow(db);
  const ch1 = chapterId('hollow.ch1');

  // Title: the Chapter only — its lone Scene is not listed apart.
  const objects = engine.searchObjects(await shellIndex());
  assert.ok(!objects.some((o) => o.id === pageId('h1a')));
  assert.deepEqual(objects.find((o) => o.id === ch1).subject, { type: 'scene', id: pageId('h1a') });

  // Text: h1a's prose is found as Chapter 1.
  const r = await find(markerFor('h1a'));
  assert.deepEqual(ids(r), [ch1]);
  assert.equal(r[0].kind, 'chapter');
  assert.equal(r[0].tier, 4);

  // A Scene of a divided Chapter opens itself.
  assert.deepEqual(ids(await find(markerFor('h4c'))), [pageId('h4c')]);

  // Through the working set, a result opened again goes to its tab.
  let tabs = { tabs: [workingSet.MANUSCRIPT_TAB], active: workingSet.MANUSCRIPT_TAB };
  tabs = workingSet.openTab(tabs, r[0].id);
  tabs = workingSet.openTab(tabs, (await find(markerFor('h1a')))[0].id);
  tabs = workingSet.navigateTab(tabs, refModel.openableId(await shellIndex(), pageId('h1a')));
  assert.deepEqual(tabs, { tabs: [workingSet.MANUSCRIPT_TAB, ch1], active: ch1 }, 'one tab for Chapter 1, however it was found');
});

// ── 4. Isolation ─────────────────────────────────────────────────────────────

test('isolation: another writer finds nothing of Alice\'s; a Project finds nothing of another Project', async () => {
  const db = await seededDb();
  const t = await hollow(db);

  // Ash (Alice's other Project) holds its own words.
  signIn(db, ALICE);
  const ashPage = ok(await pages.createWorkspacePage(ASH, 'Ash ledger'));
  await setContent(db, 'workspace_documents', ashPage.id, doc('A salt tithe, paid in green glass.'));

  // Current Project only.
  assert.deepEqual(ids(await find('green glass')), [t.alaric.id]);
  assert.deepEqual(ids(await find('green glass', ASH)), [ashPage.id]);
  assert.deepEqual(ids(await find(markerFor('h4a'), ASH)), []);
  assert.deepEqual(ids(await find(markerFor('a1a'))), [], 'Ash\'s prose is not in Hollow');

  // Another writer — through the action, and asking the database directly.
  signIn(db, BRAM);
  assert.deepEqual(ok(await search.searchProjectContent(HOLLOW, 'green glass')), []);
  assert.deepEqual(ok(await search.searchProjectContent(HOLLOW, markerFor('h4a'))), []);
  const direct = await createSupabaseAdapter(db, { userId: BRAM }).rpc('search_project_content', { p_project_id: HOLLOW, p_query: 'lamplight' });
  assert.deepEqual(direct.data, []);
  assert.deepEqual(ok(await search.searchProjectContent(TIDE, 'green glass')), [], 'nor through his own Project');

  // Signed out: the action refuses, and anon can't run the function at all.
  signIn(db, null);
  assert.equal((await search.searchProjectContent(HOLLOW, 'lamplight')).error, 'Not authenticated');
  const anon = await createSupabaseAdapter(db, { userId: null }).rpc('search_project_content', { p_project_id: HOLLOW, p_query: 'lamplight' });
  assert.ok(anon.error, 'anon has no execute');

  // A malformed id is refused before any read.
  signIn(db, ALICE);
  assert.equal((await search.searchProjectContent('not-a-uuid', 'lamplight')).error, 'Project not found');

  // The engine only ever returns objects in the Project's own index: a text
  // match naming anything else is dropped.
  const index = await shellIndex();
  const stray = engine.searchProject(engine.searchObjects(index), 'green glass', {}, [{ type: 'page', id: ashPage.id, snippet: 'x' }]);
  assert.deepEqual(ids(stray), []);
});

// ── 5. Pickers ───────────────────────────────────────────────────────────────

test('reference pickers are Project Search narrowed to valid targets', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const index = await shellIndex();
  const objects = engine.searchObjects(index);

  // Only Entries of Factions.
  const factionScope = refModel.targetScope({ type: 'entry', collectionId: t.factions.id });
  assert.deepEqual(refModel.candidates(index, { type: 'entry', collectionId: t.factions.id }).map((c) => c.id), [t.drelareth.id]);
  assert.deepEqual(ids(engine.searchProject(objects, 'Nerai', factionScope)), []);

  // The same ranking as Project Search: exact, then prefix.
  const chars = refModel.candidates(index, { type: 'entry', collectionId: t.characters.id }, 'nerai');
  assert.deepEqual(chars.map((c) => c.id), [t.nerai.id, t.sister.id]);
  const scope = refModel.targetScope({ type: 'entry', collectionId: t.characters.id });
  assert.deepEqual(chars.map((c) => c.id), ids(engine.searchProject(objects, 'nerai', scope)), 'the picker is the engine\'s result');

  // Where it lives still matches in a picker ("Characters" → its Entries).
  assert.deepEqual(new Set(refModel.candidates(index, { type: 'any' }, 'characters').map((c) => c.id)), new Set([t.nerai.id, t.sister.id, t.alaric.id]));

  // Scene targets: a Chapter's only Scene is offered as that Scene (by its Chapter's name), once.
  const sceneTargets = refModel.candidates(index, { type: 'scene' });
  assert.ok(sceneTargets.every((c) => c.type === 'scene'));
  assert.equal(sceneTargets.filter((c) => c.id === pageId('h1a')).length, 1);
  assert.equal(sceneTargets.find((c) => c.id === pageId('h1a')).title, index.get(chapterId('hollow.ch1')).title);
  assert.equal(sceneTargets.at(-1).hint, 'Unplaced', 'Unplaced Scenes come last');
  assert.ok(!sceneTargets.some((c) => c.id === chapterId('hollow.ch1')), 'never a Chapter id');

  // Groups, Folders, Collections and divided Chapters are never targets; the object itself is excluded.
  const any = refModel.candidates(index, { type: 'any' }, '', new Set([t.nerai.id]));
  assert.ok(!any.some((c) => [t.part.id, t.research.folder.id, t.characters.id, chapterId('hollow.ch4'), t.nerai.id].includes(c.id)));
  const fromH1a = refModel.candidates(index, { type: 'scene' }, '', new Set([pageId('h1a')]));
  assert.ok(!fromH1a.some((c) => c.id === pageId('h1a')), 'a Chapter standing for the excluded Scene is excluded');

  // Relationship values still set through the picker's ids.
  const affiliation = ok(await refsAction.createRelationshipProperty(t.characters.id, 'Affiliation', 'entry', t.factions.id, false));
  ok(await refsAction.setEntryRelationship(t.nerai.id, affiliation.id, [refModel.candidates(index, { type: 'entry', collectionId: t.factions.id }, 'drel')[0].id]));
  assert.deepEqual((await workspace.loadProjectWorkspace(HOLLOW)).references.map((r) => r.target.id), [t.drelareth.id]);
});

// ── 6. Manuscript protection ─────────────────────────────────────────────────

test('searching changes nothing: Scenes, Pages and Entries keep their content, version, words and dates', async () => {
  const db = await seededDb();
  await hollow(db);
  const snapshot = async () => ({
    scenes: await scenesSnapshot(db),
    pages: await all(db, `select id, title, content, version, updated_at from public.workspace_documents order by id`),
    entries: await all(db, `select id, title, content, version, updated_at from public.workspace_collection_entries order by id`),
  });
  const before = await snapshot();
  for (const q of ['fixture-marker', 'salt', 'lamplight', 'was never going', 'Nerai']) {
    await find(q);
  }
  assert.deepEqual(await snapshot(), before);
});
