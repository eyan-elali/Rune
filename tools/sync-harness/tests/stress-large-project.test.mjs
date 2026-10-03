// Large-Project stress (Rune 2.0, Beta Completion B, Part N): one realistic
// synthetic Project built on the canonical Rune 2.0 schema in real Postgres
// (PGlite) + RLS, through the REAL bundled actions, route handlers and RPCs —
// never a raw insert into a content table — and the app's loaders, search,
// export, backup, Trash and Project lifecycle proved correct on it.
//
// Correctness first. Every step's wall time is printed (performance.now())
// and only a generous sanity ceiling (STEP_CEILING_MS) is asserted, so a hang
// is caught without the suite depending on machine speed.
//
// What is built (sizes printed at the end of the build step):
//   * a manuscript of ~165k synthetic words: 5 Groups, 120 Chapters, ~165
//     Scenes (imported whole through POST /api/manuscript-import, exactly as
//     the Import flow does), a few Unplaced Scenes (imported and created),
//     trashed Scenes and a trashed Chapter
//   * a Workspace of hundreds of objects: Folders (nested), Pages with
//     content, a Collection of a few hundred Entries with several properties
//     (values set on every Entry), Views, Relationships and references,
//     Revision Notes on every manuscript level, Scene properties and a Scene
//     View, Scene History (the save-path checkpoint trigger, and a restore),
//     two Milestones, trashed Pages / a Folder / Entries / a Collection / a
//     Canvas
//   * a Canvas of 400+ placements (Scenes, Chapters, Pages, Entries, notes,
//     images, Sections with members) and hundreds of connections, with image
//     attachments stored through the real server library (in-memory bytes)
//   * a second, small Project (its own manuscript, Page, Canvas and image)
//     that must be untouched by anything done to the large one
//
// No real writing: every sentence is generated from a fixed vocabulary by a
// seeded generator, so the fixture is deterministic and never stored.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTestDb, readRepoFile, createAuthUser, RUNE2_SCHEMA, HARNESS_DIR } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';

const WRITER = 'aaaaaaaa-0000-4000-8000-00000000a001';
const OTHER = 'aaaaaaaa-0000-4000-8000-00000000a002';
const STEP_CEILING_MS = 60_000;

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const count = async (db, sql, params = []) => (await one(db, `select count(*)::int as n from (${sql}) q`, params)).n;
const ok = (r) => { assert.equal(r.error, null, JSON.stringify(r.error)); return r.data; };
const okStatus = (r) => { assert.equal(r.status, 'ok', JSON.stringify(r)); return r; };
const text = (t) => ({ type: 'text', text: t });
const para = (...content) => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });
const doc = (...content) => ({ type: 'doc', content });
const docOf = (...paragraphs) => doc(...paragraphs.map((p) => para(text(p))));
const wordsOf = (...paragraphs) => paragraphs.join(' ').split(/\s+/).filter(Boolean).length;

let idSeq = 0;
const uuid = () => `55555555-2222-4333-8444-${String(++idSeq).padStart(12, '0')}`;

// ── Deterministic synthetic prose ───────────────────────────────────────────

const VOCAB = 'the a she he they road glass bell light cold night river stone quiet letter hand door window fire iron ash crown hollow storm morning never always under over through beyond lantern ember willow'.split(' ');
let seed = 20261003;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const sentence = () => {
  const n = 7 + Math.floor(rand() * 12);
  const w = Array.from({ length: n }, () => pick(VOCAB));
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  return `${w.join(' ')}.`;
};
/** A paragraph of a few sentences; the editor counts words by splitting on spaces. */
const paragraph = () => Array.from({ length: 3 + Math.floor(rand() * 4) }, sentence).join(' ');

const SCENE_MARKER = (n) => `scenemarker${String(n).padStart(4, '0')}`;
const TOKEN = {
  scene: 'zqscenetoken7781',
  page: 'zqpagetoken4410',
  entry: 'zqentrytoken9032',
  note: 'zqnotetoken2217',
  trashed: 'zqtrashedtoken5590',
  common: 'lantern', // in (nearly) every Scene: hundreds of matches, capped by the search limit
};

// ── Timing ──────────────────────────────────────────────────────────────────

const timings = [];
async function step(name, fn) {
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  timings.push({ name, ms });
  console.log(`# step ${name}: ${ms.toFixed(0)} ms`);
  assert.ok(ms < STEP_CEILING_MS, `step "${name}" took ${ms.toFixed(0)} ms (ceiling ${STEP_CEILING_MS} ms: a hang?)`);
  return result;
}

// ── Modules ─────────────────────────────────────────────────────────────────

let db, sb, store;
let route, scenes, structure, trash, pages, tree, collections, props, views, refs, notes, history, milestones, sceneProps, sceneViews;
let canvas, attachmentsLib, projects, lifecycle, search, workspace, manuscriptLoader, nav, queries, manuscriptLib;
let plan, formats, txt, md, backup, zip, storageMock;
before(async () => {
  const storageAlias = { '@/lib/attachments/storage': path.join(HARNESS_DIR, 'mocks/attachmentStorage.js') };
  const jspdfAlias = { jspdf: path.join(HARNESS_DIR, 'mocks/jspdf.js') };
  route = await bundleForTest('src/app/api/manuscript-import/route.ts', { name: 'lg_import_route' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'lg_scenes' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'lg_structure' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'lg_trash' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'lg_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'lg_tree' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'lg_collections' });
  props = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'lg_props' });
  views = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'lg_views' });
  refs = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'lg_refs' });
  notes = await bundleForTest('src/lib/actions/revisionNotes.ts', { name: 'lg_notes' });
  history = await bundleForTest('src/lib/actions/sceneHistory.ts', { name: 'lg_history' });
  milestones = await bundleForTest('src/lib/actions/manuscriptMilestones.ts', { name: 'lg_milestones' });
  sceneProps = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'lg_scene_props' });
  sceneViews = await bundleForTest('src/lib/actions/sceneViews.ts', { name: 'lg_scene_views' });
  canvas = await bundleForTest('src/lib/actions/workspaceCanvas.ts', { name: 'lg_canvas' });
  attachmentsLib = await bundleForTest('src/lib/attachments/server.ts', { name: 'lg_attachments' });
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'lg_projects', aliases: storageAlias });
  lifecycle = await bundleForTest('src/lib/projectLifecycle.ts', { name: 'lg_lifecycle' });
  storageMock = await import(path.join(HARNESS_DIR, 'mocks/attachmentStorage.js'));
  search = await bundleForTest('src/lib/actions/projectSearch.ts', { name: 'lg_search' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'lg_workspace' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'lg_manuscript' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'lg_nav' });
  queries = await bundleForTest('src/lib/manuscriptQueries.ts', { name: 'lg_queries' });
  manuscriptLib = await bundleForTest('src/lib/manuscript.ts', { name: 'lg_manuscript_lib' });
  plan = await bundleForTest('src/lib/export/plan.ts', { name: 'lg_plan' });
  formats = await bundleForTest('src/lib/export/formats.ts', { name: 'lg_formats', aliases: jspdfAlias });
  txt = await bundleForTest('src/lib/export/text.ts', { name: 'lg_txt' });
  md = await bundleForTest('src/lib/export/markdown.ts', { name: 'lg_md' });
  backup = await bundleForTest('src/lib/backup/projectBackup.ts', { name: 'lg_backup' });
  zip = await bundleForTest('src/lib/import/zip.ts', { name: 'lg_zip' });

  db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await createAuthUser(db, WRITER);
  await createAuthUser(db, OTHER);
  // The Project's attachment bytes: the mock store the bundled project actions
  // use for permanent deletion is the same in-memory store the server library
  // writes to here.
  store = storageMock.memory;
  sb = signIn(WRITER);
});

// The real API's row cap (Supabase's default max-rows): a reader that trusts
// one request loses rows here exactly as it would in production (BC-D).
const MAX_ROWS = 1000;

function signIn(userId) {
  const client = createSupabaseAdapter(db, { userId, maxRows: MAX_ROWS });
  for (const mod of [route, scenes, structure, trash, pages, tree, collections, props, views, refs, notes, history, milestones,
    sceneProps, sceneViews, canvas, projects, search, workspace, manuscriptLoader]) {
    mod.setServerClient(client);
  }
  return client;
}

// ── The fixture, as the app builds it ───────────────────────────────────────

/** What was built: ids and expected counts, filled by the build step and read by every check. */
const F = {
  project: null, manuscript: null, small: { project: null, manuscript: null, page: null, canvas: null, image: null },
  groups: [], chapters: [], scenes: [], // scenes: { id, chapterId, words, marker }
  importedWords: 0, unplaced: [], trashedScenes: [], trashedChapter: null, trashedChapterScenes: [],
  tokenScene: null, midScene: null, restoredScene: null,
  folders: [], pages: [], pagesWithContent: 0, trashedPages: [], trashedFolder: null, tokenPage: null, trashedTokenPage: null,
  characters: null, places: null, entries: [], placeEntries: [], properties: [], relationship: null, viewsCreated: 0,
  trashedEntries: [], tokenEntry: null, trashedTokenEntry: null, references: 0, relationshipTargets: 0,
  notes: 0, sceneProperty: null, sceneValues: 0, sceneView: null, checkpoints: 0, milestones: [],
  attachments: [], board: null, boardItems: [], boardSections: [], boardConnections: [], tokenNote: null,
  scratch: null, scratchItems: 0, scratchConnections: 0, trashedTokenNote: null, exportedChapters: 0,
};

async function postImport(userId, payload, requestId = uuid()) {
  route.setServerClient(createSupabaseAdapter(db, { userId }));
  const res = await route.POST(new Request('http://rune.test/api/manuscript-import', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload, requestId }),
  }));
  return { status: res.status, body: await res.json() };
}

/** The ordered manuscript total straight from SQL: active placed Scenes of active Chapters. */
const sqlOrderedTotal = (manuscriptId) => one(db, `
  select coalesce(sum(s.word_count), 0)::int as n from public.scenes s join public.chapters c on c.id = s.chapter_id
   where s.manuscript_id = $1 and s.trashed_at is null and c.trashed_at is null`, [manuscriptId]).then((r) => r.n);
const storedTotal = (projectId) => one(db, `select word_count from public.projects where id = $1`, [projectId]).then((r) => r.word_count);

/** The stored total, the SQL rule and the app's counting rule all agree. */
async function assertTotals(context) {
  const expected = await sqlOrderedTotal(F.manuscript);
  const stored = await storedTotal(F.project);
  const rule = (await sb.rpc('ordered_manuscript_word_total', { p_manuscript_id: F.manuscript })).data;
  const { data: chs, error } = await queries.getChaptersWithScenes(sb, F.project);
  assert.equal(error, null);
  const app = manuscriptLib.calculateProjectWordCount(chs);
  assert.deepEqual({ stored, rule, app }, { stored: expected, rule: expected, app: expected }, `ordered total ${context}`);
  return expected;
}

/** Every Scene's reading-order marker: Groups by position, Chapters by position within, Scenes by position. */
const readingOrderMarkers = () => all(db, `
  select s.content->'content'->0->'content'->0->>'text' as first
    from public.scenes s join public.chapters c on c.id = s.chapter_id join public.manuscript_groups g on g.id = c.group_id
   where s.manuscript_id = $1 and s.trashed_at is null and c.trashed_at is null
   order by g.position, c.position, s.position`, [F.manuscript]).then((rows) => rows.map((r) => r.first.split(' ')[0]));

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 167, 69, 143, 68, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const JPG = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 255, 217]);

async function storeImage(client, projectId, fileName, extra = {}) {
  const bytes = extra.bytes ?? new Uint8Array([...PNG, ...new TextEncoder().encode(fileName)]);
  return ok(await attachmentsLib.storeImageAttachment(client, store, {
    projectId, fileName, mimeType: 'image/png', bytes, width: extra.width ?? 1, height: extra.height ?? 1, display: extra.display ?? null,
  }));
}

const item = (type, targetId, extra = {}) => ({
  op: 'create', id: uuid(), item_type: type, target_id: targetId, label: extra.label ?? null, content: extra.content ?? null,
  x: extra.x ?? 0, y: extra.y ?? 0, width: extra.width ?? 240, height: extra.height ?? 120, z: extra.z ?? 0,
  section_id: extra.section_id ?? null, manual_size: extra.manual_size ?? false,
});
const connect = (sourceId, targetId, extra = {}) => ({
  kind: 'connection', op: 'create', id: uuid(), source_id: sourceId, target_id: targetId, directed: extra.directed ?? false, label: extra.label ?? null,
});
async function writeAll(canvasId, changes) {
  for (let i = 0; i < changes.length; i += 400) {
    const r = okStatus(await canvas.writeCanvasItems(canvasId, changes.slice(i, i + 400)));
    for (const x of r.results) assert.equal(x.status, 'ok', JSON.stringify(x));
  }
}

/** The import payload of the large manuscript: 5 Parts × 24 Chapters, 1–2 Scenes each, plus Unplaced Scenes. */
function largePayload() {
  const items = [];
  let sceneNo = 0;
  let words = 0;
  const makeScene = (marker, extraWord = null) => {
    const paragraphs = [];
    const n = 14 + Math.floor(rand() * 8);
    for (let p = 0; p < n; p++) {
      let t = paragraph();
      if (p === 0) t = `${marker} ${t}`;
      if (p === 2 && extraWord) t = `${t} ${extraWord}`;
      paragraphs.push([t]);
      words += t.split(' ').length;
    }
    return { title: null, paragraphs };
  };
  const partNames = ['One', 'Two', 'Three', 'Four', 'Five'];
  for (let g = 0; g < 5; g++) {
    const chapters = [];
    for (let c = 0; c < 24; c++) {
      const chapterNo = g * 24 + c + 1;
      const sceneCount = chapterNo % 3 === 0 ? 2 : 1;
      const list = [];
      for (let s = 0; s < sceneCount; s++) {
        sceneNo += 1;
        list.push(makeScene(SCENE_MARKER(sceneNo), chapterNo === 61 && s === 0 ? TOKEN.scene : null));
      }
      chapters.push({ kind: 'chapter', title: `Chapter ${chapterNo}`, scenes: list });
    }
    items.push({ kind: 'group', title: `Part ${partNames[g]}`, items: chapters });
  }
  const unplaced = [];
  let unplacedWords = 0;
  for (let u = 0; u < 5; u++) {
    const before = words;
    unplaced.push({ ...makeScene(`unplacedmarker${u}`), title: `Loose scene ${u + 1}` });
    unplacedWords += words - before;
  }
  words -= unplacedWords;
  return { payload: { title: 'The Long Glass Road', items, unplaced }, words, unplacedWords, sceneCount: sceneNo };
}

function smallPayload() {
  return {
    title: 'A Small Companion',
    items: [
      { kind: 'chapter', title: 'Small One', scenes: [{ title: null, paragraphs: [['smallmarker1 ' + paragraph()]] }, { title: null, paragraphs: [[paragraph()]] }] },
      { kind: 'chapter', title: 'Small Two', scenes: [{ title: null, paragraphs: [[paragraph()]] }] },
    ],
    unplaced: [{ title: 'Small loose', paragraphs: [[paragraph()]] }],
  };
}

// ── 0. Build ────────────────────────────────────────────────────────────────

test('build: a large Project through the real import, actions and RPCs (sizes printed)', async () => {
  // Manuscript ────────────────────────────────────────────────────────────
  await step('import manuscript (POST /api/manuscript-import)', async () => {
    const { payload, words, unplacedWords, sceneCount } = largePayload();
    const body = JSON.stringify({ payload, requestId: uuid() });
    assert.ok(body.length < 4 * 1024 * 1024, `payload ${body.length} bytes fits the route's cap`);
    const r = await postImport(WRITER, payload);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    F.project = r.body.projectId;
    F.manuscript = (await one(db, `select id from public.manuscripts where project_id = $1`, [F.project])).id;
    F.importedWords = words;
    F.groups = await all(db, `select id, title, position from public.manuscript_groups where manuscript_id = $1 order by position`, [F.manuscript]);
    // Reading order (Group, Chapter, Scene positions), so every later choice is deterministic.
    F.chapters = await all(db, `select c.id, c.title, c.group_id, c.position from public.chapters c join public.manuscript_groups g on g.id = c.group_id
      where c.manuscript_id = $1 order by g.position, c.position`, [F.manuscript]);
    const rows = await all(db, `select s.id, s.chapter_id, s.word_count, s.position, s.content->'content'->0->'content'->0->>'text' as first
      from public.scenes s left join public.chapters c on c.id = s.chapter_id left join public.manuscript_groups g on g.id = c.group_id
      where s.manuscript_id = $1 order by s.chapter_id is null, g.position, c.position, s.position`, [F.manuscript]);
    F.scenes = rows.filter((s) => s.chapter_id !== null).map((s) => ({ id: s.id, chapterId: s.chapter_id, words: s.word_count, marker: s.first.split(' ')[0] }));
    F.unplaced = rows.filter((s) => s.chapter_id === null).map((s) => s.id);
    assert.deepEqual([F.groups.length, F.chapters.length, F.scenes.length, F.unplaced.length], [5, 120, sceneCount, 5]);
    assert.equal(await storedTotal(F.project), words);
    assert.equal(F.scenes.reduce((n, s) => n + s.words, 0), words);
    assert.equal(rows.filter((s) => s.chapter_id === null).reduce((n, s) => n + s.word_count, 0), unplacedWords);
    assert.ok(words >= 150_000 && words <= 200_000, `manuscript ${words} words`);
    signIn(WRITER);
  });

  await step('import a second small Project', async () => {
    const r = await postImport(WRITER, smallPayload());
    assert.equal(r.status, 200, JSON.stringify(r.body));
    F.small.project = r.body.projectId;
    F.small.manuscript = (await one(db, `select id from public.manuscripts where project_id = $1`, [F.small.project])).id;
    signIn(WRITER);
    F.small.page = ok(await pages.createWorkspacePage(F.small.project, 'Small notes'));
    okStatus(await pages.saveWorkspacePageContent(F.small.page.id, docOf('A page of the small project.'), F.small.page.version));
    F.small.canvas = ok(await canvas.createWorkspaceCanvas(F.small.project, 'Small board')).canvas;
    F.small.image = await storeImage(sb, F.small.project, 'small.png', { display: { bytes: JPG, mimeType: 'image/jpeg', width: 1, height: 1 } });
    await writeAll(F.small.canvas.id, [item('image', F.small.image.id, { label: 'small.png', manual_size: true }), item('note', null, { content: docOf('small note') })]);
  });

  await step('Unplaced Scenes created and written through the Scene actions', async () => {
    for (let i = 0; i < 2; i++) {
      const s = ok(await scenes.createUnplacedScene(F.project, `Created loose ${i + 1}`));
      const body = [`createdunplaced${i} ${paragraph()}`, paragraph()];
      okStatus(await scenes.syncSceneWithLimitCheck(s.id, docOf(...body), wordsOf(...body), s.version));
      F.unplaced.push(s.id);
    }
    assert.equal(F.unplaced.length, 7);
  });

  await step('trash three Scenes and one Chapter (two Scenes)', async () => {
    // Scenes 10, 50 and 111 in reading order (Chapters 8, 37 and 84 — none of them Chapter 90, trashed below).
    for (const n of [9, 49, 110]) {
      const s = F.scenes[n];
      ok(await trash.trashWorkspaceObject('scene', s.id));
      F.trashedScenes.push(s.id);
    }
    const ch = F.chapters.find((c) => c.title === 'Chapter 90');
    F.trashedChapter = ch.id;
    F.trashedChapterScenes = F.scenes.filter((s) => s.chapterId === ch.id).map((s) => s.id);
    assert.equal(F.trashedChapterScenes.length, 2);
    ok(await trash.trashWorkspaceObject('chapter', ch.id));
    assert.equal((await count(db, `select 1 from public.scenes where id = any($1) and trashed_at is not null`, [F.trashedChapterScenes])), 2, 'a Chapter goes with its Scenes');
    await assertTotals('after Trash');
  });

  // Workspace ─────────────────────────────────────────────────────────────
  await step('Folders and Pages (150 Pages, 12 Folders, content on 60)', async () => {
    const top = [];
    for (let i = 0; i < 8; i++) top.push(ok(await tree.createWorkspaceFolder(F.project, `Folder ${i + 1}`)));
    const nested = [];
    for (let i = 0; i < 4; i++) nested.push(ok(await tree.createWorkspaceFolder(F.project, `Nested ${i + 1}`, top[i].nodeId)));
    F.folders = [...top, ...nested];
    for (let i = 0; i < 150; i++) {
      const parent = i % 5 === 0 ? null : F.folders[i % F.folders.length].nodeId;
      const page = ok(await pages.createWorkspacePage(F.project, `Page ${i + 1}`, parent));
      F.pages.push(page);
      if (i % 5 < 2) {
        const body = [paragraph(), paragraph()];
        if (i === 76) body.push(`${TOKEN.page} ${paragraph()}`);
        if (i === 146) body.push(`${TOKEN.trashed} ${paragraph()}`);
        okStatus(await pages.saveWorkspacePageContent(page.id, docOf(...body), page.version));
        F.pagesWithContent += 1;
      }
    }
    F.tokenPage = F.pages[76].id;
    F.trashedTokenPage = F.pages[146].id;
  });

  await step('Collections: Characters (300 Entries, 6 properties, values, 4 Views) and Places (40 Entries)', async () => {
    F.characters = ok(await collections.createWorkspaceCollection(F.project, 'Characters')).collection;
    F.places = ok(await collections.createWorkspaceCollection(F.project, 'Places')).collection;
    const role = ok(await props.createCollectionProperty(F.characters.id, 'Role', 'text'));
    const age = ok(await props.createCollectionProperty(F.characters.id, 'Age', 'number'));
    const alive = ok(await props.createCollectionProperty(F.characters.id, 'Alive', 'checkbox'));
    const born = ok(await props.createCollectionProperty(F.characters.id, 'Born', 'date'));
    let faction = ok(await props.createCollectionProperty(F.characters.id, 'Faction', 'select'));
    faction = ok(await props.updateCollectionProperty(faction.id, { options: [{ name: 'Court' }, { name: 'Harbour' }, { name: 'Road' }] })).property;
    assert.equal(faction.options.length, 3);
    F.relationship = ok(await refs.createRelationshipProperty(F.characters.id, 'Appears in', 'scene', null, true));
    F.properties = [role, age, alive, born, faction, F.relationship];
    for (let i = 0; i < 300; i++) {
      const e = ok(await collections.createCollectionEntry(F.characters.id, `Character ${i + 1}`));
      F.entries.push(e);
      ok(await props.setEntryPropertyValue(e.id, role.id, i % 2 ? 'Rider' : 'Scribe'));
      ok(await props.setEntryPropertyValue(e.id, age.id, 20 + (i % 50)));
      if (i % 3 === 0) ok(await props.setEntryPropertyValue(e.id, alive.id, true));
      ok(await props.setEntryPropertyValue(e.id, born.id, `2026-0${1 + (i % 9)}-1${i % 10}`));
      ok(await props.setEntryPropertyValue(e.id, faction.id, faction.options[i % 3].id));
      if (i % 3 === 0) {
        const body = [paragraph()];
        if (i === 150) body.push(`${TOKEN.entry} ${paragraph()}`);
        if (i === 297) body.push(`${TOKEN.trashed} ${paragraph()}`);
        okStatus(await collections.saveCollectionEntryContent(e.id, docOf(...body), e.version));
      }
    }
    F.tokenEntry = F.entries[150].id;
    F.trashedTokenEntry = F.entries[297].id;
    for (const type of ['table', 'list', 'board', 'timeline']) {
      ok(await views.createCollectionView(F.characters.id, `${type} view`, type));
      F.viewsCreated += 1;
    }
    for (let i = 0; i < 40; i++) F.placeEntries.push(ok(await collections.createCollectionEntry(F.places.id, `Place ${i + 1}`)));
  });

  await step('references and relationships (Pages → Scenes, Entries → Scenes)', async () => {
    const active = F.scenes.filter((s) => !F.trashedScenes.includes(s.id) && !F.trashedChapterScenes.includes(s.id));
    for (let i = 0; i < 60; i++) {
      ok(await refs.addObjectReference('page', F.pages[i].id, 'scene', active[i * 2].id));
      F.references += 1;
    }
    for (let i = 0; i < 40; i++) {
      ok(await refs.addObjectReference('entry', F.entries[i].id, 'scene', active[i * 3].id));
      F.references += 1;
    }
    for (let i = 0; i < 60; i++) {
      const targets = [active[i].id, active[i + 1].id, active[i + 2].id];
      ok(await refs.setEntryRelationship(F.entries[i].id, F.relationship.id, targets));
      F.relationshipTargets += targets.length;
    }
  });

  await step('Revision Notes on every manuscript level (240)', async () => {
    const note = async (type, id, body) => okStatus(await notes.createRevisionNote(uuid(), type, id, body));
    for (let i = 0; i < 10; i++) await note('manuscript', F.manuscript, `manuscript note ${i + 1}`);
    for (let i = 0; i < 10; i++) await note('group', F.groups[i % 5].id, `group note ${i + 1}`);
    const activeChapters = F.chapters.filter((c) => c.id !== F.trashedChapter);
    for (let i = 0; i < 60; i++) await note('chapter', activeChapters[i].id, `chapter note ${i + 1}`);
    const active = F.scenes.filter((s) => !F.trashedScenes.includes(s.id) && !F.trashedChapterScenes.includes(s.id));
    for (let i = 0; i < 160; i++) await note('scene', active[i % active.length].id, `scene note ${i + 1}`);
    F.notes = 240;
  });

  await step('Scene properties (values on 100 Scenes) and a Scene View', async () => {
    F.sceneProperty = ok(await sceneProps.createSceneProperty(F.project, 'POV', 'text'));
    const active = F.scenes.filter((s) => !F.trashedScenes.includes(s.id) && !F.trashedChapterScenes.includes(s.id));
    for (let i = 0; i < 100; i++) {
      ok(await sceneProps.setScenePropertyValue(active[i].id, F.sceneProperty.id, i % 2 ? 'Mara' : 'Iven'));
      F.sceneValues += 1;
    }
    F.sceneView = ok(await sceneViews.createSceneView(F.project, 'By POV', 'table'));
  });

  await step('Scene History: 40 checkpoints from real saves after a pause, one restore; then two Milestones', async () => {
    // As if two hours had passed since the import: the checkpoint trigger keeps
    // the replaced text when the previous save is older than 30 minutes.
    await db.exec(`set session_replication_role = replica;
      update public.scenes set updated_at = updated_at - interval '120 minutes', created_at = created_at - interval '120 minutes' where manuscript_id = '${F.manuscript}';
      set session_replication_role = origin;`);
    const active = F.scenes.filter((s) => !F.trashedScenes.includes(s.id) && !F.trashedChapterScenes.includes(s.id));
    for (let i = 0; i < 40; i++) {
      const s = active[i * 3];
      const { version, content } = await one(db, `select version, content from public.scenes where id = $1`, [s.id]);
      const paragraphs = content.content.map((p) => p.content[0].text);
      paragraphs.push(paragraph());
      const r = okStatus(await scenes.syncSceneWithLimitCheck(s.id, docOf(...paragraphs), wordsOf(...paragraphs), version));
      assert.equal(r.version, version + 1);
      s.words = wordsOf(...paragraphs);
      F.checkpoints += 1;
    }
    assert.equal(await count(db, `select 1 from public.scene_revisions where manuscript_id = $1 and reason = 'checkpoint'`, [F.manuscript]), 40, 'one checkpoint per paused save');
    // Restore the first checkpoint of one Scene: the replaced text is kept as a 'restore' revision
    // (before any Milestone: a Milestone revision holding the same text would rightly make that unnecessary).
    const target = active[0];
    const h = ok(await history.listSceneHistory(target.id));
    const checkpoint = h.revisions.find((r) => r.reason === 'checkpoint');
    assert.ok(checkpoint, 'a checkpoint to restore');
    const restored = okStatus(await history.restoreSceneRevision(checkpoint.id, h.scene.version));
    target.words = restored.scene.word_count;
    F.restoredScene = target.id;
    assert.equal(await count(db, `select 1 from public.scene_revisions where scene_id = $1 and reason = 'restore'`, [target.id]), 1);
    F.milestones.push(ok(await milestones.createManuscriptMilestone(F.project, 'Draft 1')).id);
    F.milestones.push(ok(await milestones.createManuscriptMilestone(F.project, 'Draft 2')).id);
    await assertTotals('after History');
  });

  // Canvas ────────────────────────────────────────────────────────────────
  await step('three image attachments (real server library, in-memory bytes)', async () => {
    F.attachments.push(await storeImage(sb, F.project, 'map.png', { width: 2400, height: 1600, display: { bytes: JPG, mimeType: 'image/jpeg', width: 1600, height: 1067 } }));
    F.attachments.push(await storeImage(sb, F.project, 'coast.png'));
    F.attachments.push(await storeImage(sb, F.project, 'crest.png'));
    assert.equal(await count(db, `select 1 from public.workspace_attachments where project_id = $1`, [F.project]), 3);
  });

  await step('the Board Canvas: 40 Sections, 400+ placements, 300 connections', async () => {
    F.board = ok(await canvas.createWorkspaceCanvas(F.project, 'Board')).canvas;
    const changes = [];
    for (let i = 0; i < 40; i++) {
      const s = item('section', null, { label: `Section ${i + 1}`, x: (i % 8) * 1000, y: Math.floor(i / 8) * 800, width: 900, height: 700 });
      F.boardSections.push(s);
      changes.push(s);
    }
    const sectionOf = (i) => F.boardSections[i % 40].id;
    const active = F.scenes.filter((s) => !F.trashedScenes.includes(s.id) && !F.trashedChapterScenes.includes(s.id));
    const placements = [];
    active.forEach((s, i) => placements.push(item('scene', s.id, { label: `Scene ${i}`, x: 10 + i, y: 20, section_id: sectionOf(i) })));
    for (let i = 0; i < 20; i++) placements.push(item('chapter', F.chapters[i].id, { label: F.chapters[i].title, x: 50 + i, y: 300 }));
    for (let i = 0; i < 100; i++) placements.push(item('page', F.pages[i].id, { label: `Page ${i + 1}`, x: 30 + i, y: 40, section_id: i % 2 ? sectionOf(i) : null }));
    for (let i = 0; i < 100; i++) placements.push(item('entry', F.entries[i].id, { label: `Character ${i + 1}`, x: 60 + i, y: 80, section_id: i % 3 ? null : sectionOf(i) }));
    for (let i = 0; i < 40; i++) {
      const body = i === 7 ? `${TOKEN.note} ${paragraph()}` : paragraph();
      const n = item('note', null, { content: docOf(body), x: 90 + i, y: 160, section_id: sectionOf(i) });
      if (i === 7) F.tokenNote = n.id;
      placements.push(n);
    }
    for (const a of F.attachments) placements.push(item('image', a.id, { label: a.file_name, width: 320, height: 240, manual_size: true }));
    // (A trashed Scene or Chapter cannot be placed: "That item is in Trash". Step 6 covers a target trashed after its placement.)
    F.boardItems = placements;
    changes.push(...placements);
    for (let i = 0; i < 300; i++) {
      const c = connect(placements[i % placements.length].id, placements[(i * 7 + 3) % placements.length].id, { directed: i % 2 === 0, label: i % 5 ? null : `link ${i}` });
      if (c.source_id === c.target_id) continue;
      F.boardConnections.push(c);
      changes.push(c);
    }
    await writeAll(F.board.id, changes);
    const loaded = ok(await canvas.getWorkspaceCanvas(F.board.id));
    assert.equal(loaded.items.length, F.boardSections.length + F.boardItems.length);
    assert.equal(loaded.connections.length, F.boardConnections.length);
    assert.equal(loaded.attachments.length, 3);
    assert.ok(F.boardItems.length >= 300 && F.boardItems.length <= 500, `${F.boardItems.length} placements`);
  });

  await step('Workspace Trash: 5 Pages, a Folder, 10 Entries, the Places Collection, a Scratch Canvas', async () => {
    F.scratch = ok(await canvas.createWorkspaceCanvas(F.project, 'Scratch')).canvas;
    const scratchItems = [];
    for (let i = 0; i < 30; i++) scratchItems.push(item('page', F.pages[i].id, { label: `Page ${i + 1}` }));
    const trashedNote = item('note', null, { content: docOf(`${TOKEN.trashed} ${paragraph()}`) });
    F.trashedTokenNote = trashedNote.id;
    scratchItems.push(trashedNote, item('image', F.attachments[2].id, { label: 'crest.png', manual_size: true }));
    const scratchConnections = [];
    for (let i = 0; i < 20; i++) scratchConnections.push(connect(scratchItems[i].id, scratchItems[i + 1].id));
    await writeAll(F.scratch.id, [...scratchItems, ...scratchConnections]);
    F.scratchItems = scratchItems.length;
    F.scratchConnections = scratchConnections.length;
    ok(await trash.trashWorkspaceObject('canvas', F.scratch.id));

    for (const p of [F.pages[145], F.pages[146], F.pages[147], F.pages[148], F.pages[149]]) {
      ok(await trash.trashWorkspaceObject('page', p.id));
      F.trashedPages.push(p.id);
    }
    F.trashedFolder = F.folders[11].folder.id;
    ok(await trash.trashWorkspaceObject('folder', F.trashedFolder));
    for (let i = 290; i < 300; i++) {
      ok(await trash.trashWorkspaceObject('entry', F.entries[i].id));
      F.trashedEntries.push(F.entries[i].id);
    }
    ok(await trash.trashWorkspaceObject('collection', F.places.id));
    await assertTotals('after Workspace Trash');
  });

  const activeScenes = F.scenes.length - F.trashedScenes.length - F.trashedChapterScenes.length;
  console.log(`# built: ${F.importedWords} imported words, ${F.groups.length} Groups, ${F.chapters.length} Chapters (1 trashed), ${F.scenes.length} placed Scenes (${activeScenes} active, ${F.trashedScenes.length + F.trashedChapterScenes.length} trashed), ${F.unplaced.length} Unplaced; ` +
    `${F.folders.length} Folders, ${F.pages.length} Pages (${F.pagesWithContent} with content, ${F.trashedPages.length} trashed), 2 Collections (1 trashed), ${F.entries.length + F.placeEntries.length} Entries (${F.trashedEntries.length} trashed), ${F.properties.length} properties, ${F.viewsCreated} Views, ` +
    `${F.references + F.relationshipTargets} references, ${F.notes} Revision Notes, ${F.sceneValues} Scene property values, ${F.checkpoints} checkpoints + 1 restore, ${F.milestones.length} Milestones, ` +
    `${F.attachments.length} attachments, Board: ${F.boardItems.length} placements + ${F.boardSections.length} Sections + ${F.boardConnections.length} connections; Scratch (trashed): ${F.scratchItems} + ${F.scratchConnections}`);
});

// ── 1. Loaders and totals ───────────────────────────────────────────────────

test('1. loadProjectManuscript and loadProjectWorkspace: every count equals what was created; projects.word_count is the ordered total without Unplaced and Trash', async () => {
  await step('loaders', async () => {
    const m = await manuscriptLoader.loadProjectManuscript(F.project);
    assert.ok(m);
    const activePlaced = F.scenes.length - F.trashedScenes.length - F.trashedChapterScenes.length;
    assert.deepEqual(
      [m.groupCount, m.chapterCount, m.placedSceneCount, m.unplaced.length, m.trashedAt],
      [5, 119, activePlaced, 7, null]);
    const expected = await assertTotals('loaded');
    assert.equal(m.manuscriptWords, expected);
    const unplacedWords = (await one(db, `select coalesce(sum(word_count), 0)::int as n from public.scenes where manuscript_id = $1 and chapter_id is null and trashed_at is null`, [F.manuscript])).n;
    assert.equal(m.unplacedWords, unplacedWords);
    assert.ok(unplacedWords > 0);
    // Trashed words are not in the stored total; Unplaced words are not either.
    const everyScene = (await one(db, `select coalesce(sum(word_count), 0)::int as n from public.scenes where manuscript_id = $1`, [F.manuscript])).n;
    assert.ok(everyScene > expected + unplacedWords, 'trashed words exist and are excluded');

    const w = await workspace.loadProjectWorkspace(F.project);
    assert.deepEqual(
      [w.pages.length, w.folders.length, w.collections.length, w.canvases.length, w.entries.length, w.properties.length, w.organizable, w.collectable, w.canvasable],
      [150 - 5, 12 - 1, 1, 1, 300 - 10, 6, true, true, true]);
    // Values of the active Entries only (051): the 10 trashed Entries' values exist but are hidden, as the Entries are.
    const activeValues = await count(db, `select 1 from public.workspace_entry_values v join public.workspace_collection_entries e on e.id = v.entry_id where v.project_id = $1 and e.trashed_at is null`, [F.project]);
    const everyValue = await count(db, `select 1 from public.workspace_entry_values where project_id = $1`, [F.project]);
    assert.ok(everyValue > activeValues, 'the trashed Entries have values');
    assert.ok(activeValues > MAX_ROWS, `more values (${activeValues}) than one API request returns: the loader must page (BC-D)`);
    assert.equal(w.values.length, activeValues, 'only active Entries\' values are loaded — every one of them, past the row cap');
    assert.ok(w.values.every((v) => w.entries.some((e) => e.id === v.entry_id)), 'every loaded value belongs to a loaded (active) Entry');
    // Every Collection gets a default "List" View on creation: Characters has 5; the trashed Places has 1, hidden with it (051).
    assert.equal(w.views.filter((v) => v.collection_id === F.characters.id).length, 5);
    assert.equal(w.views.filter((v) => v.collection_id === F.places.id).length, 0, 'a trashed Collection\'s Views are not loaded');
    assert.equal(w.views.length, 5);
    // The shell index holds every active object once.
    const index = new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
    for (const id of [F.tokenPage, F.tokenEntry, F.board.id]) assert.ok(index.has(id), `indexed ${id}`);
    for (const id of [...F.trashedPages, ...F.trashedEntries, F.scratch.id, F.places.id]) assert.ok(!index.has(id), `trashed, not indexed ${id}`);
  });
});

// The two BC-B findings, closed by migration 051: Trash visibility of Entry values and Collection Views.
test('1b. a trashed Collection\'s Views are hidden with it and readable again on restore; another account reads none (051)', async () => {
  const mine = () => sb.from('workspace_collection_views').select('id, collection_id').eq('project_id', F.project);
  const placesViews = await count(db, `select 1 from public.workspace_collection_views where collection_id = $1`, [F.places.id]);
  assert.ok(placesViews >= 1, 'the trashed Collection has a View');
  assert.equal((await mine()).data.filter((v) => v.collection_id === F.places.id).length, 0, 'hidden while in Trash');
  ok(await trash.restoreWorkspaceObject('collection', F.places.id));
  assert.equal((await mine()).data.filter((v) => v.collection_id === F.places.id).length, placesViews, 'readable again after restore');
  assert.equal((await workspace.loadProjectWorkspace(F.project)).views.filter((v) => v.collection_id === F.places.id).length, placesViews);
  const other = createSupabaseAdapter(db, { userId: OTHER });
  assert.deepEqual((await other.from('workspace_collection_views').select('id').eq('project_id', F.project)).data, [], 'another account reads none');
  ok(await trash.trashWorkspaceObject('collection', F.places.id));
  assert.equal((await mine()).data.filter((v) => v.collection_id === F.places.id).length, 0, 'hidden again');
});

test('1c. a trashed Entry\'s values are hidden with it and readable again on restore; another account reads none (051)', async () => {
  const entry = F.trashedEntries[0];
  const mine = () => sb.from('workspace_entry_values').select('entry_id').eq('entry_id', entry);
  const stored = await count(db, `select 1 from public.workspace_entry_values where entry_id = $1`, [entry]);
  assert.ok(stored >= 1, 'the trashed Entry has values');
  assert.equal((await mine()).data.length, 0, 'hidden while in Trash');
  ok(await trash.restoreWorkspaceObject('entry', entry));
  assert.equal((await mine()).data.length, stored, 'readable again after restore');
  assert.ok((await workspace.loadProjectWorkspace(F.project)).values.some((v) => v.entry_id === entry));
  const other = createSupabaseAdapter(db, { userId: OTHER });
  assert.deepEqual((await other.from('workspace_entry_values').select('entry_id').eq('entry_id', entry)).data, [], 'another account reads none');
  ok(await trash.trashWorkspaceObject('entry', entry));
  assert.equal((await mine()).data.length, 0, 'hidden again');
});

// ── 2. Saving and moving a Scene in the middle ──────────────────────────────

test('2. a save in the middle of the manuscript (save_scene_checked) and a move (place_scene) keep the stored total right', async () => {
  await step('save + move', async () => {
    const active = F.scenes.filter((s) => !F.trashedScenes.includes(s.id) && !F.trashedChapterScenes.includes(s.id));
    const mid = active[Math.floor(active.length / 2)];
    F.midScene = mid.id;
    const before = await assertTotals('before the save');
    const { version, content } = await one(db, `select version, content from public.scenes where id = $1`, [mid.id]);
    const paragraphs = content.content.map((p) => p.content[0].text);
    paragraphs.push('Seven new words were written here today.');
    const r = okStatus(await scenes.syncSceneWithLimitCheck(mid.id, docOf(...paragraphs), wordsOf(...paragraphs), version));
    assert.equal(r.version, version + 1);
    assert.equal(await assertTotals('after the save'), before + 7);
    mid.words += 7;

    // Move it to the first Chapter, then to Unplaced, then back to its own Chapter: the total follows.
    const first = F.chapters[0];
    assert.deepEqual(await scenes.placeScene(mid.id, first.id, 0), { error: null, moved: true });
    assert.equal(await assertTotals('after a move between Chapters'), before + 7);
    assert.equal((await one(db, `select chapter_id, position from public.scenes where id = $1`, [mid.id])).position, 0);
    assert.deepEqual(await scenes.placeScene(mid.id, null, null), { error: null, moved: true });
    assert.equal(await assertTotals('after moving to Unplaced'), before + 7 - mid.words);
    assert.deepEqual(await scenes.placeScene(mid.id, mid.chapterId, null), { error: null, moved: true });
    assert.equal(await assertTotals('after moving back'), before + 7);
    // The destination is renumbered 0..n-1; the Chapter it left keeps a strict order (place_scene renumbers only the destination).
    const positions = async (ch) => (await all(db, `select position from public.scenes where chapter_id = $1 and trashed_at is null order by position`, [ch])).map((r) => r.position);
    const home = await positions(mid.chapterId);
    assert.deepEqual(home, home.map((_, i) => i), 'destination renumbered');
    const left = await positions(first.id);
    assert.deepEqual(left, [...new Set(left)].sort((a, b) => a - b), 'the Chapter it left keeps a strict order');
  });
});

// ── 3. Search ───────────────────────────────────────────────────────────────

test('3. search_project_content finds one unique token in a Scene, a Page, an Entry and a Canvas note; nothing from Trash; results stay within the limit', async () => {
  await step('search', async () => {
    const find = async (q) => ok(await search.searchProjectContent(F.project, q));
    const tokenScene = F.scenes.find((s) => s.chapterId === F.chapters.find((c) => c.title === 'Chapter 61').id);
    const scene = await find(TOKEN.scene);
    assert.equal(scene.length, 1);
    assert.deepEqual([scene[0].type, scene[0].id], ['scene', tokenScene.id]);
    assert.ok(scene[0].snippet.includes(TOKEN.scene));
    const page = await find(TOKEN.page);
    assert.deepEqual(page.map((r) => [r.type, r.id]), [['page', F.tokenPage]]);
    const entry = await find(TOKEN.entry);
    assert.deepEqual(entry.map((r) => [r.type, r.id]), [['entry', F.tokenEntry]]);
    const note = await find(TOKEN.note);
    assert.deepEqual(note.map((r) => [r.type, r.id, r.canvas_id]), [['canvas_note', F.tokenNote, F.board.id]]);
    // The trashed Page, Entry and the note on the trashed Canvas hold the same token: none is found.
    assert.deepEqual(await find(TOKEN.trashed), [], 'nothing from Trash');
    // Every Scene marker is unique: each is found exactly once, and a trashed one never.
    const active = F.scenes.find((s) => !F.trashedScenes.includes(s.id) && !F.trashedChapterScenes.includes(s.id));
    assert.deepEqual((await find(active.marker)).map((r) => r.id), [active.id]);
    const trashedScene = F.scenes.find((s) => s.id === F.trashedScenes[1]);
    assert.deepEqual(await find(trashedScene.marker), [], 'a trashed Scene is not searched');
    const inTrashedChapter = F.scenes.find((s) => s.id === F.trashedChapterScenes[0]);
    assert.deepEqual(await find(inTrashedChapter.marker), [], 'a Scene of a trashed Chapter is not searched');
    // A common word is in hundreds of texts: capped at the function's limit, Scenes first.
    const common = await find(TOKEN.common);
    assert.equal(common.length, 100, 'the default limit');
    assert.ok(common.every((r) => r.type === 'scene'), 'Scenes rank first');
    // Another writer finds nothing in this Project.
    signIn(OTHER);
    assert.deepEqual(ok(await search.searchProjectContent(F.project, TOKEN.scene)), []);
    signIn(WRITER);
  });
});

// ── 4. Export ───────────────────────────────────────────────────────────────

test('4. the export plan holds every active placed Scene exactly once in reading order, no Unplaced or Trash; TXT and Markdown print every Chapter heading; DOCX and PDF render', async () => {
  const document = await step('export: load + plan', async () => {
    const source = await plan.loadExportSource(sb, F.project, { kind: 'manuscript' });
    const d = plan.planExport(source, { kind: 'manuscript' });
    const activePlaced = F.scenes.length - F.trashedScenes.length - F.trashedChapterScenes.length;
    const prose = d.blocks.filter((b) => b.kind === 'prose');
    assert.equal(prose.length, activePlaced, 'every active placed Scene once');
    assert.equal(d.stats.scenes, activePlaced);
    assert.equal(d.stats.chapters, 119, 'active Chapters');
    // Two trashed Scenes emptied their Chapters (8 and 38): a Chapter with nothing to print has no heading.
    F.exportedChapters = await count(db, `select 1 from public.chapters c where c.manuscript_id = $1 and c.trashed_at is null
      and exists (select 1 from public.scenes s where s.chapter_id = c.id and s.trashed_at is null)`, [F.manuscript]);
    assert.equal(F.exportedChapters, 117);
    assert.equal(d.stats.words, await sqlOrderedTotal(F.manuscript));
    const markers = prose.map((b) => JSON.stringify(b.blocks).match(/scenemarker\d{4}/)[0]);
    assert.deepEqual(markers, await readingOrderMarkers(), 'reading order: Group, Chapter, Scene positions');
    assert.equal(new Set(markers).size, markers.length, 'no Scene twice');
    const serialized = JSON.stringify(d.blocks);
    assert.ok(!/unplacedmarker|createdunplaced/.test(serialized), 'no Unplaced Scene');
    for (const id of [...F.trashedScenes, ...F.trashedChapterScenes]) {
      assert.ok(!serialized.includes(F.scenes.find((s) => s.id === id).marker), 'no trashed Scene');
    }
    const headings = d.blocks.filter((b) => b.kind === 'heading');
    assert.equal(headings.filter((h) => h.role === 'group').length, 5);
    assert.equal(headings.filter((h) => h.role === 'chapter').length, F.exportedChapters);
    assert.ok(!headings.some((h) => h.text === 'Chapter 90'), 'the trashed Chapter has no heading');
    return d;
  });

  await step('export: TXT + Markdown', async () => {
    const plain = txt.renderText(document);
    assert.equal((plain.match(/^Chapter \d+$/gm) ?? []).length, F.exportedChapters, 'TXT: one heading per Chapter with prose');
    assert.equal((plain.match(/^Part (One|Two|Three|Four|Five)$/gm) ?? []).length, 5);
    const first = plain.indexOf('Chapter 1\n');
    const last = plain.indexOf('Chapter 120\n');
    assert.ok(first > 0 && last > first && plain.indexOf('Chapter 89\n') < plain.indexOf('Chapter 91\n'));
    const markdown = md.renderMarkdown(document);
    assert.equal((markdown.match(/^#{1,6} Chapter \d+$/gm) ?? []).length, F.exportedChapters, 'Markdown: one heading per Chapter with prose');
    assert.equal((markdown.match(/^#{1,6} Part (One|Two|Three|Four|Five)$/gm) ?? []).length, 5);
    assert.ok(!markdown.includes('Chapter 90'));
  });

  await step('export: DOCX', async () => {
    const file = await formats.renderExport(document, 'docx');
    assert.equal(file.extension, 'docx');
    assert.deepEqual([...file.bytes.slice(0, 2)], [0x50, 0x4b], 'a ZIP');
    const xml = await zip.openZip(file.bytes).text('word/document.xml');
    assert.ok(xml.includes('Chapter 120') && xml.includes('Part Five'));
    assert.ok(xml.length > 1_000_000, `${xml.length} characters of document.xml`);
  });

  await step('export: PDF (recording jsPDF)', async () => {
    const file = await formats.renderExport(document, 'pdf');
    assert.equal(file.extension, 'pdf');
    const texts = globalThis.__runeTestPdf.texts;
    assert.ok(texts.some((t) => t.includes('CHAPTER 120') || t.includes('Chapter 120')), 'drew the last Chapter heading');
    assert.ok(texts.length > F.scenes.length, `drew ${texts.length} text runs`);
  });
});

// ── 5. Backup ───────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f-]{36}$/;
/** A uuid as a SQL literal (a filter may not mention every bind parameter, so literals are used). */
const lit = (id) => { assert.match(id, UUID_RE); return `'${id}'`; };

/** read_project_backup's mapping, as SQL counts run as the superuser. */
function backupFilters(projectId, manuscriptId, userId) {
  const [P, M, U] = [lit(projectId), lit(manuscriptId), lit(userId)];
  const p = (t) => [t, `project_id = ${P}`];
  const m = (t) => [t, `manuscript_id = ${M}`];
  return {
    groups: m('manuscript_groups'), chapters: m('chapters'), scenes: m('scenes'),
    scene_property_definitions: m('scene_property_definitions'), scene_property_values: m('scene_property_values'), scene_views: m('scene_views'),
    revision_notes: p('revision_notes'), scene_revisions: m('scene_revisions'), milestones: m('manuscript_milestones'),
    milestone_scenes: ['manuscript_milestone_scenes', `milestone_id in (select id from public.manuscript_milestones where manuscript_id = ${M})`],
    workspace_nodes: p('workspace_nodes'), workspace_folders: p('workspace_folders'), workspace_documents: p('workspace_documents'),
    workspace_collections: p('workspace_collections'), workspace_collection_properties: p('workspace_collection_properties'),
    workspace_collection_views: p('workspace_collection_views'), workspace_collection_entries: p('workspace_collection_entries'),
    workspace_entry_values: p('workspace_entry_values'), workspace_canvases: p('workspace_canvases'), workspace_canvas_items: p('workspace_canvas_items'),
    workspace_canvas_connections: p('workspace_canvas_connections'), workspace_attachments: p('workspace_attachments'), object_references: p('object_references'),
    writing_sessions: ['writing_sessions', `project_id = ${P} and user_id = ${U}`], writing_goals: ['writing_goals', `project_id = ${P} and user_id = ${U}`],
    project_notes: ['project_notes', `project_id = ${P} and user_id = ${U}`],
  };
}
const KEYS = { scene_property_values: ['scene_id', 'property_id'], milestone_scenes: ['milestone_id', 'scene_id'], workspace_entry_values: ['entry_id', 'property_id'] };

test('5. read_project_backup pages through every kind without missing or repeating a row (Trash included), and the archive holds the attachments\' bytes', async () => {
  await step('backup: read every kind', async () => {
    const readBytes = async (a) => (await store.download(a.storage_key))?.bytes ?? null;
    const data = await backup.loadProjectBackup(sb, F.project, undefined, readBytes);
    assert.equal(data.project.id, F.project);
    assert.equal(data.manuscript.id, F.manuscript);
    const filters = backupFilters(F.project, F.manuscript, WRITER);
    const nonEmpty = [];
    for (const [kind, [table, where]] of Object.entries(filters)) {
      const expected = await count(db, `select 1 from public.${table} where ${where}`);
      const rows = data.rows[kind];
      assert.equal(rows.length, expected, `${kind}: every row (paged ${backup.BACKUP_KINDS[kind]} at a time)`);
      const keys = KEYS[kind] ?? ['id'];
      const seen = new Set(rows.map((r) => keys.map((k) => r[k]).join(':')));
      assert.equal(seen.size, rows.length, `${kind}: no row repeated`);
      if (expected > 0) nonEmpty.push(kind);
    }
    for (const kind of ['groups', 'chapters', 'scenes', 'scene_property_definitions', 'scene_property_values', 'scene_views', 'revision_notes', 'scene_revisions',
      'milestones', 'milestone_scenes', 'workspace_nodes', 'workspace_folders', 'workspace_documents', 'workspace_collections', 'workspace_collection_properties',
      'workspace_collection_views', 'workspace_collection_entries', 'workspace_entry_values', 'workspace_canvases', 'workspace_canvas_items',
      'workspace_canvas_connections', 'workspace_attachments', 'object_references']) {
      assert.ok(nonEmpty.includes(kind), `the fixture exercises ${kind}`);
    }
    // Paging really happened: Scenes (100 a page), Entries (200), items (500), History (50), connections (500).
    assert.ok(data.rows.scenes.length > backup.BACKUP_KINDS.scenes);
    assert.ok(data.rows.workspace_collection_entries.length > backup.BACKUP_KINDS.workspace_collection_entries);
    assert.ok(data.rows.scene_revisions.length > backup.BACKUP_KINDS.scene_revisions, `${data.rows.scene_revisions.length} revisions`);
    // Trash is included and marked; Unplaced too.
    assert.equal(data.rows.scenes.filter((s) => s.trashed_at).length, F.trashedScenes.length + F.trashedChapterScenes.length);
    assert.equal(data.rows.chapters.filter((c) => c.trashed_at).length, 1);
    assert.equal(data.rows.workspace_documents.filter((d) => d.trashed_at).length, 5);
    assert.equal(data.rows.workspace_canvases.filter((c) => c.trashed_at).length, 1);
    assert.equal(data.rows.workspace_collection_entries.filter((e) => e.trashed_at).length, 10);
    assert.equal(data.rows.workspace_collections.filter((c) => c.trashed_at).length, 1);
    assert.equal(data.rows.scenes.filter((s) => s.chapter_id === null && !s.trashed_at).length, 7);
    // Bytes: every attachment's original, byte for byte.
    assert.equal(data.bytes.size, 3);
    for (const a of F.attachments) assert.deepEqual(Array.from(data.bytes.get(a.id)), Array.from((await store.download(a.storage_key)).bytes));

    const t0 = performance.now();
    const archive = await backup.buildBackupArchive(data, new Date('2026-10-03T12:00:00Z'));
    console.log(`#   archive ${archive.length} bytes, built in ${(performance.now() - t0).toFixed(0)} ms`);
    const z = zip.openZip(archive);
    const manifest = JSON.parse(await z.text('manifest.json'));
    assert.equal(manifest.format_version, 2);
    assert.equal(manifest.files.filter((n) => n.startsWith('manuscript/scenes/')).length, data.rows.scenes.length);
    for (const name of manifest.files) assert.ok(z.has(name), `listed and present: ${name}`);
    const attachmentFiles = manifest.files.filter((n) => /attachments\//.test(n));
    assert.ok(attachmentFiles.length >= 3, `attachment files in the archive: ${attachmentFiles.length}`);
  });

  await step('backup: another writer gets nothing', async () => {
    const other = createSupabaseAdapter(db, { userId: OTHER });
    await assert.rejects(backup.loadProjectBackup(other, F.project, undefined, async () => null), /isn’t available to back up/);
  });
});

// ── 6. Trash of a Chapter and of the Canvas ─────────────────────────────────

/** Nothing points at a row that is gone. */
async function assertNoOrphans() {
  const orphans = {
    itemsWithoutCanvas: await count(db, `select 1 from public.workspace_canvas_items i where not exists (select 1 from public.workspace_canvases c where c.id = i.canvas_id)`),
    itemsAtGoneScene: await count(db, `select 1 from public.workspace_canvas_items i where i.scene_id is not null and not exists (select 1 from public.scenes s where s.id = i.scene_id)`),
    itemsAtGoneChapter: await count(db, `select 1 from public.workspace_canvas_items i where i.chapter_id is not null and not exists (select 1 from public.chapters c where c.id = i.chapter_id)`),
    itemsAtGonePage: await count(db, `select 1 from public.workspace_canvas_items i where i.document_id is not null and not exists (select 1 from public.workspace_documents d where d.id = i.document_id)`),
    itemsAtGoneEntry: await count(db, `select 1 from public.workspace_canvas_items i where i.entry_id is not null and not exists (select 1 from public.workspace_collection_entries e where e.id = i.entry_id)`),
    itemsAtGoneAttachment: await count(db, `select 1 from public.workspace_canvas_items i where i.attachment_id is not null and not exists (select 1 from public.workspace_attachments a where a.id = i.attachment_id)`),
    itemsInGoneSection: await count(db, `select 1 from public.workspace_canvas_items i where i.section_id is not null and not exists (select 1 from public.workspace_canvas_items s where s.id = i.section_id)`),
    connectionsAtGoneItem: await count(db, `select 1 from public.workspace_canvas_connections c where not exists (select 1 from public.workspace_canvas_items i where i.id = c.source_item_id) or not exists (select 1 from public.workspace_canvas_items i where i.id = c.target_item_id)`),
    connectionsWithoutCanvas: await count(db, `select 1 from public.workspace_canvas_connections c where not exists (select 1 from public.workspace_canvases v where v.id = c.canvas_id)`),
    scenesWithoutChapter: await count(db, `select 1 from public.scenes s where s.chapter_id is not null and not exists (select 1 from public.chapters c where c.id = s.chapter_id)`),
    notesAtGoneScene: await count(db, `select 1 from public.revision_notes n where n.target_type = 'scene' and not exists (select 1 from public.scenes s where s.id = n.target_id)`),
    notesAtGoneChapter: await count(db, `select 1 from public.revision_notes n where n.target_type = 'chapter' and not exists (select 1 from public.chapters c where c.id = n.target_id)`),
    valuesAtGoneScene: await count(db, `select 1 from public.scene_property_values v where not exists (select 1 from public.scenes s where s.id = v.scene_id)`),
    referencesAtGoneScene: await count(db, `select 1 from public.object_references r where (r.source_scene_id is not null and not exists (select 1 from public.scenes s where s.id = r.source_scene_id)) or (r.target_scene_id is not null and not exists (select 1 from public.scenes s where s.id = r.target_scene_id))`),
    referencesAtGoneEntry: await count(db, `select 1 from public.object_references r where (r.source_entry_id is not null and not exists (select 1 from public.workspace_collection_entries e where e.id = r.source_entry_id)) or (r.target_entry_id is not null and not exists (select 1 from public.workspace_collection_entries e where e.id = r.target_entry_id))`),
    nodesAtGoneObject: await count(db, `select 1 from public.workspace_nodes n where (n.canvas_id is not null and not exists (select 1 from public.workspace_canvases c where c.id = n.canvas_id)) or (n.document_id is not null and not exists (select 1 from public.workspace_documents d where d.id = n.document_id))`),
  };
  assert.deepEqual(orphans, Object.fromEntries(Object.keys(orphans).map((k) => [k, 0])), 'no orphans');
}

test('6. Trash: a Chapter with Scenes and the Board Canvas — trashed, restored and permanently deleted — leave counts consistent and nothing orphaned', async () => {
  await step('trash: a Chapter with Scenes', async () => {
    const ch = F.chapters.find((c) => c.title === 'Chapter 30');
    const its = F.scenes.filter((s) => s.chapterId === ch.id && !F.trashedScenes.includes(s.id));
    assert.equal(its.length, 2);
    const before = await assertTotals('before Chapter Trash');
    const orderBefore = await readingOrderMarkers();
    const itsWords = its.reduce((n, s) => n + s.words, 0);
    const placementsBefore = await count(db, `select 1 from public.workspace_canvas_items where scene_id = any($1) or chapter_id = $2`, [its.map((s) => s.id), ch.id]);
    const notesBefore = await count(db, `select 1 from public.revision_notes where target_id = any($1)`, [[...its.map((s) => s.id), ch.id]]);
    const revisionsBefore = await count(db, `select 1 from public.scene_revisions where scene_id = any($1)`, [its.map((s) => s.id)]);
    assert.ok(placementsBefore >= 2 && notesBefore >= 1 && revisionsBefore >= 1, 'the Chapter is well connected');

    ok(await trash.trashWorkspaceObject('chapter', ch.id));
    assert.equal(await assertTotals('after Chapter Trash'), before - itsWords);
    const m = await manuscriptLoader.loadProjectManuscript(F.project);
    assert.equal(m.chapterCount, 118);
    assert.equal(m.placedSceneCount, F.scenes.length - F.trashedScenes.length - F.trashedChapterScenes.length - 2);
    const listed = ok(await trash.listWorkspaceTrash(F.project));
    assert.ok(listed.some((t) => t.id === ch.id && t.type === 'chapter'), 'listed in Trash');
    // Everything of it is kept while in Trash.
    assert.equal(await count(db, `select 1 from public.workspace_canvas_items where scene_id = any($1) or chapter_id = $2`, [its.map((s) => s.id), ch.id]), placementsBefore);
    assert.equal(await count(db, `select 1 from public.revision_notes where target_id = any($1)`, [[...its.map((s) => s.id), ch.id]]), notesBefore);
    assert.equal(await count(db, `select 1 from public.scene_revisions where scene_id = any($1)`, [its.map((s) => s.id)]), revisionsBefore);
    await assertNoOrphans();

    ok(await trash.restoreWorkspaceObject('chapter', ch.id));
    assert.equal(await assertTotals('after Chapter restore'), before);
    assert.equal((await manuscriptLoader.loadProjectManuscript(F.project)).chapterCount, 119);
    assert.equal(await count(db, `select 1 from public.scenes where id = any($1) and trashed_at is null`, [its.map((s) => s.id)]), 2, 'its Scenes are back');
    assert.deepEqual(await readingOrderMarkers(), orderBefore, 'restored to its place: the reading order is exactly what it was');

    // Permanent deletion: its Scenes, their placements, notes and values go; History a Milestone uses stays.
    ok(await trash.trashWorkspaceObject('chapter', ch.id));
    const scenesBefore = await count(db, `select 1 from public.scenes where manuscript_id = $1`, [F.manuscript]);
    const itemsBefore = await count(db, `select 1 from public.workspace_canvas_items where project_id = $1`, [F.project]);
    const connectionsOnThem = await count(db, `select 1 from public.workspace_canvas_connections c where c.source_item_id in (select id from public.workspace_canvas_items where scene_id = any($1) or chapter_id = $2) or c.target_item_id in (select id from public.workspace_canvas_items where scene_id = any($1) or chapter_id = $2)`, [its.map((s) => s.id), ch.id]);
    const connectionsBefore = await count(db, `select 1 from public.workspace_canvas_connections where project_id = $1`, [F.project]);
    ok(await trash.deleteTrashedWorkspaceObject('chapter', ch.id));
    assert.equal(await count(db, `select 1 from public.chapters where id = $1`, [ch.id]), 0);
    assert.equal(await count(db, `select 1 from public.scenes where manuscript_id = $1`, [F.manuscript]), scenesBefore - 2);
    assert.equal(await count(db, `select 1 from public.workspace_canvas_items where project_id = $1`, [F.project]), itemsBefore - placementsBefore, 'their placements went with them');
    assert.equal(await count(db, `select 1 from public.workspace_canvas_connections where project_id = $1`, [F.project]), connectionsBefore - connectionsOnThem, 'connections of removed placements went too');
    assert.equal(await count(db, `select 1 from public.revision_notes where target_id = any($1)`, [[...its.map((s) => s.id), ch.id]]), 0);
    assert.equal(await count(db, `select 1 from public.scene_property_values where scene_id = any($1)`, [its.map((s) => s.id)]), 0);
    assert.equal(await count(db, `select 1 from public.scene_revisions where scene_id = any($1)`, [its.map((s) => s.id)]), 0, 'History is unlinked from gone Scenes');
    // A Milestone is a read-only snapshot: its rows for the gone Scenes stay, each still pointing at a kept revision.
    assert.equal(await count(db, `select 1 from public.manuscript_milestone_scenes ms where ms.scene_id = any($1)`, [its.map((s) => s.id)]), 2 * F.milestones.length);
    assert.equal(await count(db, `select 1 from public.manuscript_milestone_scenes ms where ms.scene_id = any($1) and not exists (select 1 from public.scene_revisions r where r.id = ms.revision_id)`, [its.map((s) => s.id)]), 0, 'every Milestone row keeps its text');
    assert.equal(await assertTotals('after permanent Chapter deletion'), before - itsWords);
    F.chapters = F.chapters.filter((c) => c.id !== ch.id);
    F.scenes = F.scenes.filter((s) => s.chapterId !== ch.id);
    await assertNoOrphans();
  });

  await step('trash: the Board Canvas (hundreds of placements, connections, images)', async () => {
    const itemsBefore = await count(db, `select 1 from public.workspace_canvas_items where canvas_id = $1`, [F.board.id]);
    const connectionsBefore = await count(db, `select 1 from public.workspace_canvas_connections where canvas_id = $1`, [F.board.id]);
    assert.ok(itemsBefore >= 300 && connectionsBefore >= 200, `${itemsBefore} items, ${connectionsBefore} connections`);
    const manuscriptBefore = JSON.stringify(await all(db, `select id, version, word_count, chapter_id, position, trashed_at from public.scenes where manuscript_id = $1 order by id`, [F.manuscript]));
    const totalBefore = await assertTotals('before Canvas Trash');

    ok(await trash.trashWorkspaceObject('canvas', F.board.id));
    assert.equal((await workspace.loadProjectWorkspace(F.project)).canvases.length, 0, 'hidden');
    assert.equal(await count(db, `select 1 from public.workspace_canvas_items where canvas_id = $1`, [F.board.id]), itemsBefore, 'placements kept in Trash');
    assert.equal(await count(db, `select 1 from public.workspace_canvas_connections where canvas_id = $1`, [F.board.id]), connectionsBefore);
    assert.deepEqual((await sb.rpc('list_unreferenced_attachments', { p_project_id: F.project, p_older_than: '0 hours' })).data.attachments, [], 'images on a trashed Canvas are still referenced');
    assert.deepEqual(ok(await search.searchProjectContent(F.project, TOKEN.note)), [], 'its notes are not searched');

    ok(await trash.restoreWorkspaceObject('canvas', F.board.id));
    const back = ok(await canvas.getWorkspaceCanvas(F.board.id));
    assert.deepEqual([back.items.length, back.connections.length, back.attachments.length], [itemsBefore, connectionsBefore, 3]);
    assert.equal((await workspace.loadProjectWorkspace(F.project)).canvases.length, 1);
    assert.equal(ok(await search.searchProjectContent(F.project, TOKEN.note)).length, 1);

    ok(await trash.trashWorkspaceObject('canvas', F.board.id));
    ok(await trash.deleteTrashedWorkspaceObject('canvas', F.board.id));
    assert.equal(await count(db, `select 1 from public.workspace_canvases where id = $1`, [F.board.id]), 0);
    assert.equal(await count(db, `select 1 from public.workspace_canvas_items where canvas_id = $1`, [F.board.id]), 0);
    assert.equal(await count(db, `select 1 from public.workspace_canvas_connections where canvas_id = $1`, [F.board.id]), 0);
    assert.equal(await count(db, `select 1 from public.workspace_nodes where canvas_id = $1`, [F.board.id]), 0);
    // The targets are untouched: every Scene, Page, Entry and attachment row is still there.
    assert.equal(JSON.stringify(await all(db, `select id, version, word_count, chapter_id, position, trashed_at from public.scenes where manuscript_id = $1 order by id`, [F.manuscript])), manuscriptBefore);
    assert.equal(await assertTotals('after Canvas deletion'), totalBefore);
    assert.equal(await count(db, `select 1 from public.workspace_documents where project_id = $1`, [F.project]), 150);
    assert.equal(await count(db, `select 1 from public.workspace_collection_entries where project_id = $1`, [F.project]), 340);
    assert.equal(await count(db, `select 1 from public.workspace_attachments where project_id = $1`, [F.project]), 3, 'attachment rows never go by cascade');
    // Only the sweep removes attachments: two are now unreferenced (the third is on the trashed Scratch Canvas).
    const unreferenced = (await sb.rpc('list_unreferenced_attachments', { p_project_id: F.project, p_older_than: '0 hours' })).data.attachments.map((a) => a.id).sort();
    assert.deepEqual(unreferenced, [F.attachments[0].id, F.attachments[1].id].sort());
    assert.deepEqual(await attachmentsLib.sweepUnreferencedAttachments(sb, store, F.project), { removed: 0 }, 'inside the grace period: nothing swept');
    await db.query(`update public.workspace_attachments set created_at = now() - interval '2 days' where project_id = $1`, [F.project]);
    assert.deepEqual(await attachmentsLib.sweepUnreferencedAttachments(sb, store, F.project), { removed: 2 });
    assert.equal(await count(db, `select 1 from public.workspace_attachments where project_id = $1`, [F.project]), 1);
    assert.ok(!store.objects.has(F.attachments[0].storage_key) && !store.objects.has(F.attachments[0].display_key) && !store.objects.has(F.attachments[1].storage_key), 'bytes gone');
    assert.ok(store.objects.has(F.attachments[2].storage_key), 'the referenced image keeps its bytes');
    F.attachments = [F.attachments[2]];
    await assertNoOrphans();
  });
});

// ── 7. Project Trash and permanent deletion ─────────────────────────────────

/** Every public table that holds Project-owned rows, with the filter that selects one Project's rows. */
async function ownedTables(projectId, manuscriptId) {
  const [P, M] = [lit(projectId), lit(manuscriptId)];
  const cols = await all(db, `
    select table_name, column_name from information_schema.columns
     where table_schema = 'public' and column_name in ('project_id', 'manuscript_id') and table_name <> 'schema_migrations'
     order by table_name, column_name`);
  const byTable = new Map();
  for (const c of cols) byTable.set(c.table_name, c.column_name === 'project_id' ? `project_id = ${P}` : byTable.get(c.table_name) ?? `manuscript_id = ${M}`);
  byTable.set('projects', `id = ${P}`);
  byTable.set('manuscript_milestone_scenes', `milestone_id in (select id from public.manuscript_milestones where manuscript_id = ${M})`);
  return byTable;
}

async function projectRows(projectId, manuscriptId) {
  const out = {};
  for (const [table, where] of await ownedTables(projectId, manuscriptId)) {
    const rows = await all(db, `select * from public."${table}" where ${where}`);
    out[table] = rows.map((r) => JSON.stringify(r)).sort();
  }
  return out;
}

test('7. Project Trash and restore keep every row; permanent deletion removes every Project-owned row in every table and nothing of the second Project', async () => {
  await step('project: trash + restore keep every row', async () => {
    const tables = await ownedTables(F.project, F.manuscript);
    for (const t of ['chapters', 'scenes', 'manuscript_groups', 'revision_notes', 'scene_revisions', 'manuscript_milestones', 'manuscript_milestone_scenes', 'scene_property_definitions',
      'scene_property_values', 'scene_views', 'workspace_nodes', 'workspace_folders', 'workspace_documents', 'workspace_collections', 'workspace_collection_properties',
      'workspace_collection_views', 'workspace_collection_entries', 'workspace_entry_values', 'workspace_canvases', 'workspace_canvas_items', 'workspace_canvas_connections',
      'workspace_attachments', 'object_references', 'writing_sessions', 'writing_goals', 'project_notes', 'project_storage_purges', 'manuscripts', 'projects']) {
      assert.ok(tables.has(t), `information_schema lists ${t} as Project-owned`);
    }
    const before = await projectRows(F.project, F.manuscript);
    const small = await projectRows(F.small.project, F.small.manuscript);
    ok(await projects.trashProject(F.project));
    const trashedLoad = await manuscriptLoader.loadProjectManuscript(F.project);
    assert.ok(trashedLoad && trashedLoad.trashedAt, 'the shell loader reports it trashed');
    const inTrash = await projectRows(F.project, F.manuscript);
    const strip = (rows) => rows.map((r) => { const o = JSON.parse(r); delete o.trashed_at; delete o.updated_at; return JSON.stringify(o); });
    for (const [table, rows] of Object.entries(before)) {
      if (table === 'projects') { assert.deepEqual(strip(inTrash.projects), strip(rows)); continue; }
      assert.deepEqual(inTrash[table], rows, `${table}: unchanged in Trash`);
    }
    ok(await projects.restoreProject(F.project));
    const restored = await projectRows(F.project, F.manuscript);
    for (const [table, rows] of Object.entries(before)) {
      if (table === 'projects') { assert.deepEqual(strip(restored.projects), strip(rows)); assert.equal(JSON.parse(restored.projects[0]).trashed_at, null); continue; }
      assert.deepEqual(restored[table], rows, `${table}: unchanged after restore`);
    }
    assert.deepEqual(await projectRows(F.small.project, F.small.manuscript), small, 'the small Project is untouched');
    await assertTotals('after Project restore');
  });

  await step('project: permanent deletion', async () => {
    const small = await projectRows(F.small.project, F.small.manuscript);
    const before = await projectRows(F.project, F.manuscript);
    const populated = Object.entries(before).filter(([, rows]) => rows.length > 0).map(([t]) => t);
    assert.ok(populated.length >= 25, `${populated.length} populated tables: ${populated.join(', ')}`);
    const keys = [F.attachments[0].storage_key, F.attachments[0].display_key].filter(Boolean);
    for (const k of keys) assert.ok(store.objects.has(k));

    ok(await projects.trashProject(F.project));
    assert.deepEqual(await projects.deleteTrashedProject(F.project), { error: null });

    const after = await projectRows(F.project, F.manuscript);
    for (const [table, rows] of Object.entries(after)) assert.equal(rows.length, 0, `${table}: every row of the Project removed`);
    for (const k of keys) assert.ok(!store.objects.has(k), `bytes ${k} removed`);
    assert.equal(await count(db, `select 1 from public.project_storage_purges`), 0, 'the purge was carried out');
    assert.equal(await manuscriptLoader.loadProjectManuscript(F.project), null);
    assert.deepEqual(await projectRows(F.small.project, F.small.manuscript), small, 'nothing of the second Project went');
    assert.ok(store.objects.has(F.small.image.storage_key) && store.objects.has(F.small.image.display_key), 'the second Project keeps its bytes');
    // The second Project still works as a Project.
    const m = await manuscriptLoader.loadProjectManuscript(F.small.project);
    assert.deepEqual([m.chapterCount, m.placedSceneCount, m.unplaced.length], [2, 3, 1]);
    assert.deepEqual(ok(await search.searchProjectContent(F.small.project, 'smallmarker1')).length, 1);
    await assertNoOrphans();
  });

  const total = timings.reduce((n, t) => n + t.ms, 0);
  console.log(`# timings (ms): ${timings.map((t) => `${t.name}=${t.ms.toFixed(0)}`).join('; ')}; total ${total.toFixed(0)}`);
});
