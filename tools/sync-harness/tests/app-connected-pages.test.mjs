// Connected Workspace Pages (Rune 2.0, Milestone 16, migration 035): the
// REAL save actions, loader and trash actions against the Rune 2.0 schema in
// real Postgres + RLS; the REAL Workspace editor (schema, "/" commands, "@"
// insertion, triggers) headless; and the pure rules the shell shares
// (lib/rune2/workspaceDocument.ts, references.ts, collectionViews.ts,
// sceneViews.ts).
//
//   * "/" menu: what it offers, how typing narrows it, each text block inserted
//   * "@" references to Entries, Pages, Scenes and Chapters: by canonical id,
//     derived as mention rows on save, shown as backlinks; the picker is
//     Project Search narrowed
//   * rename-proof; removing a mention removes its backlink; links and
//     mentions stay apart
//   * trashed / deleted targets and sources: dormant, never a failed save,
//     never a changed sentence
//   * malformed, foreign and self references ignored
//   * embedded Collection and Scene Views: an id only — never a copy — showing
//     the canonical View's arrangement as it changes
//   * Page and Entry bodies share one editor; the manuscript editor is unchanged
//   * saving, conflicts, offline replays and device drafts behave as before
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow and ash; bram owns tide. In hollow, ch1 holds one Scene (h1a),
// ch4 three (h4a, h4b, h4c); h3b and h3c are Unplaced.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import 'fake-indexeddb/auto';
import { createTestDb, readRepoFile, asUser, LEGACY_BASELINE, RUNE2_SCHEMA, REPO_DIR } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const ASH = projectId('ash');

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;

const text = (t) => ({ type: 'text', text: t });
const ref = (targetType, targetId, label = 'Label') => ({ type: 'reference', attrs: { targetType, targetId, label } });
const para = (...parts) => {
  const content = parts.filter((p) => p !== '').map((p) => (typeof p === 'string' ? text(p) : p));
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};
const docOf = (...blocks) => ({ type: 'doc', content: blocks });
const embed = (viewKind, viewId) => ({ type: 'viewEmbed', attrs: { viewKind, viewId } });
/** Editor JSON as plain data (ProseMirror's attrs have no prototype). */
const plain = (json) => JSON.parse(JSON.stringify(json));

let legacy;
let pages, collections, refs, trash, chapters, views, sceneViewActions, workspace, manuscriptLoader;
let refModel, docModel, viewModel, sceneModel, nav, drafts, ed, manuscriptSchema;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'cp_pages' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'cp_collections' });
  refs = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'cp_refs' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'cp_trash' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'cp_chapters' });
  views = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'cp_views' });
  sceneViewActions = await bundleForTest('src/lib/actions/sceneViews.ts', { name: 'cp_scene_views' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'cp_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'cp_manuscript' });
  refModel = await bundleForTest('src/lib/rune2/references.ts', { name: 'cp_ref_model' });
  docModel = await bundleForTest('src/lib/rune2/workspaceDocument.ts', { name: 'cp_doc_model' });
  viewModel = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'cp_view_model' });
  sceneModel = await bundleForTest('src/lib/rune2/sceneViews.ts', { name: 'cp_scene_model' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'cp_nav' });
  drafts = await bundleForTest('src/lib/rune2/workspaceDrafts.ts', { name: 'cp_drafts' });
  ed = await bundleForTest('tools/sync-harness/lib/workspace-editor.mjs', { name: 'cp_editor' });
  manuscriptSchema = await bundleForTest('tools/sync-harness/lib/tiptap-schema.mjs', { name: 'cp_manuscript_schema' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [pages, collections, refs, trash, chapters, views, sceneViewActions, workspace, manuscriptLoader]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const refused = (r, message) => { assert.equal(r.data, null); if (message) assert.equal(r.error, message); else assert.ok(r.error); };

/** Alice's Hollow: Characters (Nerai, Djal), Pages "Worldbuilding Notes" (the writing) and "Magic System". */
async function hollow(db) {
  signIn(db, ALICE);
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const nerai = ok(await collections.createCollectionEntry(characters.id, 'Nerai'));
  const djal = ok(await collections.createCollectionEntry(characters.id, 'Djal'));
  const notes = ok(await pages.createWorkspacePage(HOLLOW, 'Worldbuilding Notes'));
  const magic = ok(await pages.createWorkspacePage(HOLLOW, 'Magic System'));
  return { characters, nerai, djal, notes, magic };
}

/** Saves a Page's content from its current version, as its PageSaver does. */
async function savePage(id, content) {
  const page = ok(await pages.getWorkspacePage(id));
  const r = await pages.saveWorkspacePageContent(id, content, page.version);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  return r;
}
async function saveEntry(id, content) {
  const entry = ok(await collections.getCollectionEntry(id));
  const r = await collections.saveCollectionEntryContent(id, content, entry.version);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  return r;
}

const mentionRows = (db, sourceId) => all(db,
  `select * from public.object_references where origin = 'inline' and (source_document_id = $1 or source_entry_id = $1) order by position`, [sourceId]);
const targetOf = (r) => ({ type: r.target_type, id: r.target_entry_id ?? r.target_document_id ?? r.target_scene_id ?? r.target_chapter_id });

async function loadedRefs(project = HOLLOW) {
  return (await workspace.loadProjectWorkspace(project)).references;
}
async function shellIndex(project = HOLLOW) {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(project), await workspace.loadProjectWorkspace(project)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

// Headless: TipTap schedules focus on the next frame.
globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);

/** Types `s` at the cursor, as the writer does (JSON text: parsing a string as HTML needs a DOM). */
const type = (editor, s) => editor.commands.insertContent({ type: 'text', text: s });
/** The cursor at the end of the last line. */
const toEnd = (editor) => editor.commands.setTextSelection(editor.state.doc.content.size - 1);

/** A headless Workspace editor on `content`, with the triggers reporting to `seen`. */
function workspaceEditor(content, seen = []) {
  const bridge = new ed.TriggerBridge();
  bridge.bind({ onTrigger: (t) => seen.push(t) });
  const editor = new ed.Editor({
    element: null,
    extensions: [...ed.workspaceSchemaExtensions(), ed.triggerExtension(bridge)],
    content,
  });
  return { editor, bridge, seen };
}
/** The Workspace schema's check: the JSON is exactly a valid Workspace document. */
const workspaceSchema = () => ed.getSchema(ed.workspaceSchemaExtensions());
function assertValidWorkspaceDoc(json) {
  workspaceSchema().nodeFromJSON(json).check();
}

// ── 1. "/" menu ─────────────────────────────────────────────────────────────

test('"/" menu: writing blocks and pointers at the story — no media, no generic productivity blocks — narrowed by typing', () => {
  const ids = docModel.matchSlashCommands('').map((c) => c.id);
  assert.deepEqual(ids, [
    'heading', 'subheading', 'bullets', 'numbers', 'checklist', 'quote', 'aside', 'divider',
    'ref-entry', 'ref-page', 'ref-scene', 'ref-chapter', 'embed-collection', 'embed-scene',
  ]);
  assert.deepEqual([...new Set(docModel.SLASH_COMMANDS.map((c) => c.group))], ['Text', 'Story'], 'Media is deferred: nothing offered it cannot do');

  const q = (query) => docModel.matchSlashCommands(query).map((c) => c.id);
  assert.deepEqual(q('head'), ['heading', 'subheading'], 'a label starting with it first');
  assert.deepEqual(q('list').slice(0, 3), ['bullets', 'numbers', 'checklist']);
  assert.deepEqual(q('callout'), ['aside'], 'found by keyword');
  assert.deepEqual(q('CHAP'), ['ref-chapter'], 'case and accents are ignored');
  assert.deepEqual(q('todo'), ['checklist']);
  assert.deepEqual(q('zzz'), []);
  // What this database can't do yet isn't offered.
  assert.deepEqual(docModel.matchSlashCommands('', (c) => c.action.kind === 'block').map((c) => c.group), Array(8).fill('Text'));
});

test('"/" and "@" triggers: only at a line\'s start or after a space; a title with spaces fits; two spaces, prose, dates and addresses never open one', () => {
  const t = docModel.findTrigger;
  assert.deepEqual(t('/'), { char: '/', query: '', offset: 0 });
  assert.deepEqual(t('Notes /head'), { char: '/', query: 'head', offset: 6 });
  assert.deepEqual(t('Nerai first appears in @Chapter 4'), { char: '@', query: 'Chapter 4', offset: 23 });
  assert.deepEqual(t('@'), { char: '@', query: '', offset: 0 });
  assert.equal(t('1/2'), null, 'a date');
  assert.equal(t('write to a@b.c'), null, 'an address');
  assert.equal(t('@Nerai  and'), null, 'two spaces end it');
  assert.equal(t('@ Nerai'), null, 'never starting with a space');
  assert.equal(t(`@${'x'.repeat(41)}`), null, 'too long');
  assert.equal(t('plain prose'), null);
});

test('"/" inserts each text block through the real editor, replacing what was typed, into a valid Workspace document', () => {
  const expected = {
    heading2: (d) => d.content[0].type === 'heading' && d.content[0].attrs.level === 2,
    heading3: (d) => d.content[0].type === 'heading' && d.content[0].attrs.level === 3,
    bulletList: (d) => d.content[0].type === 'bulletList',
    orderedList: (d) => d.content[0].type === 'orderedList',
    taskList: (d) => d.content[0].type === 'taskList' && d.content[0].content[0].attrs.checked === false,
    blockquote: (d) => d.content[0].type === 'blockquote',
    aside: (d) => d.content[0].type === 'aside',
    divider: (d) => d.content.some((n) => n.type === 'horizontalRule'),
  };
  for (const command of docModel.SLASH_COMMANDS.filter((c) => c.action.kind === 'block')) {
    const typed = `/${command.label.slice(0, 3).toLowerCase()}`;
    const { editor } = workspaceEditor(docOf(para('Kept')));
    // Type a new line and the "/" query, as the writer does.
    toEnd(editor);
    editor.commands.splitBlock();
    type(editor, typed);
    const trigger = ed.readTrigger(editor.state);
    assert.deepEqual([trigger.char, trigger.query], ['/', typed.slice(1)], command.id);

    ed.applyTextBlock(editor, { from: trigger.from, to: trigger.to }, command.action.block);
    const json = plain(editor.getJSON());
    assertValidWorkspaceDoc(json);
    assert.equal(JSON.stringify(json).includes(typed), false, `${command.id}: the typed "/" query is gone`);
    assert.deepEqual(json.content[0], para('Kept'), `${command.id}: the text before is untouched`);
    const rest = { ...json, content: json.content.slice(1) };
    assert.ok(expected[command.action.block](rest), `${command.id}: ${JSON.stringify(rest)}`);
    assert.equal(ed.readTrigger(editor.state), null, 'the menu closes');
    editor.destroy();
  }
});

test('the trigger plugin: reports the trigger as it is typed, hands keys to the menu only while one is open, and Escape dismisses it until something else is typed there', () => {
  // A headless TipTap editor installs no plugins, so the plugin runs in a real
  // ProseMirror state built with the editor's own plugins, as a mounted view does.
  const seen = [];
  const keys = [];
  const { editor, bridge } = workspaceEditor(docOf(para('')));
  bridge.bind({ onTrigger: (t) => seen.push(t), onKey: (e) => (keys.push(e.key), e.key === 'ArrowDown') });
  let state = ed.EditorState.create({ schema: editor.schema, doc: editor.state.doc, plugins: editor.extensionManager.plugins });
  const plugin = ed.triggerKey.get(state);
  const view = () => ({ state, editable: true });
  const pluginView = plugin.spec.view(view());
  const typeIn = (s) => {
    state = state.apply(state.tr.setSelection(ed.TextSelection.atEnd(state.doc)).insertText(s));
    pluginView.update(view());
  };
  const press = (key) => plugin.props.handleKeyDown(view(), { key });

  typeIn('Plain words');
  assert.equal(seen.at(-1), null);
  assert.equal(press('ArrowDown'), false, 'no menu: keys are the editor\'s');
  assert.deepEqual(keys, []);

  typeIn(' @Ner');
  assert.deepEqual(seen.at(-1), { char: '@', query: 'Ner', from: 13, to: 17 });
  assert.equal(press('ArrowDown'), true, 'a menu open: its keys go to it');
  assert.equal(press('x'), false, 'and other keys stay the editor\'s');
  assert.deepEqual(keys, ['ArrowDown', 'x']);

  state = state.apply(ed.dismissTrigger(state, seen.at(-1)));
  pluginView.update(view());
  assert.equal(seen.at(-1), null, 'Escape closes it');
  typeIn('ai');
  assert.equal(seen.at(-1), null, 'still closed while typing on');
  typeIn(' and @D');
  assert.equal(seen.at(-1).query, 'D', 'a new trigger opens');
  pluginView.update({ state, editable: false });
  assert.equal(seen.at(-1), null, 'never while read-only');

  state = state.apply(state.tr.setSelection(ed.TextSelection.create(state.doc, 1, 5)));
  assert.equal(ed.readTrigger(state), null, 'a selection never opens one');
  const code = ed.EditorState.create({ schema: editor.schema, doc: editor.schema.nodeFromJSON(docOf({ type: 'codeBlock', content: [text('/usr/bin')] })) });
  assert.equal(ed.readTrigger(code.apply(code.tr.setSelection(ed.TextSelection.atEnd(code.doc)))), null, 'code is never a trigger');
  editor.destroy();
});

// ── 2. "@" references ──────────────────────────────────────────────────────

test('"@": Project Search narrowed to Entries, Pages, Scenes and Chapters — a Chapter as a Chapter, a one-Scene Chapter as its Scene when Scenes are asked for, never the document itself', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const index = await shellIndex();
  const pick = (scope, query = '', self = t.notes.id) =>
    refModel.mentionCandidates(index, scope, query, new Set([self])).map((c) => [c.type, c.id]);

  const any = pick('any');
  const types = new Set(any.map(([type]) => type));
  assert.deepEqual([...types].sort(), ['chapter', 'entry', 'page', 'scene']);
  assert.ok(any.some(([type, id]) => type === 'chapter' && id === chapterId('hollow.ch1')), 'a one-Scene Chapter is offered as its Chapter');
  assert.ok(!any.some(([, id]) => id === pageId('h1a')), '…and not again as its Scene');
  assert.ok(any.some(([type, id]) => type === 'scene' && id === pageId('h4b')), 'a Scene of a divided Chapter');
  assert.ok(any.some(([type, id]) => type === 'scene' && id === pageId('h3b')), 'an Unplaced Scene');
  assert.ok(!any.some(([, id]) => id === t.notes.id), 'never itself');
  assert.ok(!any.some(([, id]) => id === t.characters.id), 'never a Collection');

  const scenes = pick('scene');
  assert.ok(scenes.every(([type]) => type === 'scene'));
  assert.ok(scenes.some(([, id]) => id === pageId('h1a')), 'asked for Scenes: a one-Scene Chapter is its Scene');
  const chaptersOnly = pick('chapter');
  assert.ok(chaptersOnly.length > 0 && chaptersOnly.every(([type]) => type === 'chapter'));
  assert.deepEqual(pick('entry'), [['entry', t.nerai.id], ['entry', t.djal.id]]);
  assert.deepEqual(pick('page'), [['page', t.magic.id]]);
  assert.deepEqual(pick('any', 'ner')[0], ['entry', t.nerai.id], 'typing narrows, best match first');
  assert.deepEqual(pick('entry', 'characters').map(([, id]) => id), [t.nerai.id, t.djal.id], 'found by where it lives');

  // Choosing one inserts a reference by canonical id, with the title as its label.
  const { editor } = workspaceEditor(docOf(para('Nerai first appears in ')));
  toEnd(editor);
  type(editor, '@Chap');
  const trigger = ed.readTrigger(editor.state);
  const chapter = refModel.mentionCandidates(index, 'chapter', 'ch', new Set())[0];
  ed.insertReference(editor, { from: trigger.from, to: trigger.to }, chapter);
  const json = plain(editor.getJSON());
  assertValidWorkspaceDoc(json);
  assert.deepEqual(json.content[0].content, [
    text('Nerai first appears in '),
    ref('chapter', chapter.id, chapter.title),
    text(' '),
  ]);
  assert.deepEqual(docModel.inlineReferences(json), [{ type: 'chapter', id: chapter.id }]);
  editor.destroy();
});

test('references to an Entry, a Page, a Scene and a Chapter: saved in the text by canonical id, derived as mention rows on save, shown as backlinks', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const ch4 = chapterId('hollow.ch4');
  const content = docOf(
    para('Nerai (', ref('entry', t.nerai.id, 'Nerai'), ') first appears in ', ref('chapter', ch4, 'Chapter 4'), '.'),
    { type: 'bulletList', content: [{ type: 'listItem', content: [para('See ', ref('page', t.magic.id, 'Magic System'))] }] },
    { type: 'aside', content: [para('The cave: ', ref('scene', pageId('h4b'), 'The Cave'))] },
  );
  const saved = await savePage(t.notes.id, content);

  // The text is saved exactly as written.
  assert.deepEqual(ok(await pages.getWorkspacePage(t.notes.id)).content, content);
  assert.equal(ok(await pages.getWorkspacePage(t.notes.id)).version, saved.version);

  // One mention row per target, in the text's order, never a Relationship value.
  const rows = await mentionRows(db, t.notes.id);
  assert.deepEqual(rows.map((r) => [targetOf(r), r.position, r.source_type, r.property_id, r.scene_property_id]), [
    [{ type: 'entry', id: t.nerai.id }, 1, 'page', null, null],
    [{ type: 'chapter', id: ch4 }, 2, 'page', null, null],
    [{ type: 'page', id: t.magic.id }, 3, 'page', null, null],
    [{ type: 'scene', id: pageId('h4b') }, 4, 'page', null, null],
  ]);
  assert.deepEqual(rows.map(targetOf), docModel.inlineReferences(content, { type: 'page', id: t.notes.id }),
    'the shell reads the text exactly as the database does');

  // Backlinks: derived from those rows — every target is "Referenced by" the Page, as a mention.
  const loaded = await loadedRefs();
  for (const id of [t.nerai.id, ch4, t.magic.id, pageId('h4b')]) {
    assert.deepEqual(refModel.backlinksOf(loaded, id).map((b) => [b.source, b.via, b.mentioned]),
      [[{ type: 'page', id: t.notes.id }, [], true]], id);
  }
  assert.deepEqual(refModel.mentionsOf(loaded, t.notes.id).map((r) => r.target.id), [t.nerai.id, ch4, t.magic.id, pageId('h4b')]);
  assert.deepEqual(refModel.relatedOf(loaded, t.notes.id), [], 'mentions are not Inspector links');
  // A Chapter shown as one piece of writing: its mentions and its Scene's are one list.
  await savePage(t.magic.id, docOf(para(ref('chapter', chapterId('hollow.ch1'))), para(ref('scene', pageId('h1a')))));
  const merged = refModel.backlinksOf(await loadedRefs(), [chapterId('hollow.ch1'), pageId('h1a')]);
  assert.deepEqual(merged.map((b) => [b.source.id, b.mentioned]), [[t.magic.id, true]]);

  // The reference names the target by its current title, and opens as the navigator does.
  const index = await shellIndex();
  assert.equal(refModel.describeTarget(index, { type: 'entry', id: t.nerai.id }).title, 'Nerai');
  assert.equal(refModel.describeTarget(index, { type: 'chapter', id: ch4 }).title, index.get(ch4).title);
  assert.equal(refModel.openableId(index, pageId('h1a')), chapterId('hollow.ch1'), 'a one-Scene Chapter\'s Scene opens as its Chapter');
  assert.equal(refModel.openableId(index, ch4), ch4);
  assert.equal(refModel.describeTarget(index, { type: 'scene', id: t.nerai.id }), null, 'a type that doesn\'t match is not described');
});

test('an Entry body references exactly as a Page does (one editor, one save rule)', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const content = docOf(para('Trained by ', ref('entry', t.djal.id, 'Djal'), ' in ', ref('scene', pageId('h3b'), 'Draft'), '. ', ref('page', t.notes.id, 'Notes')));
  assertValidWorkspaceDoc(content);
  await saveEntry(t.nerai.id, content);
  const rows = await mentionRows(db, t.nerai.id);
  assert.deepEqual(rows.map((r) => [r.source_type, r.source_entry_id, targetOf(r)]), [
    ['entry', t.nerai.id, { type: 'entry', id: t.djal.id }],
    ['entry', t.nerai.id, { type: 'scene', id: pageId('h3b') }],
    ['entry', t.nerai.id, { type: 'page', id: t.notes.id }],
  ]);
  const loaded = await loadedRefs();
  assert.deepEqual(refModel.backlinksOf(loaded, t.djal.id).map((b) => [b.source, b.mentioned]), [[{ type: 'entry', id: t.nerai.id }, true]]);
  assert.deepEqual(refModel.backlinksOf(loaded, pageId('h3b')).map((b) => b.source.id), [t.nerai.id], 'an Unplaced Scene is referenced too');
});

test('renaming a target never breaks a reference: nothing to update — the row and the text hold ids — and the title shown is the current one', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const ch4 = chapterId('hollow.ch4');
  const content = docOf(para(ref('entry', t.nerai.id, 'Nerai'), ref('page', t.magic.id, 'Magic System'), ref('scene', pageId('h4b'), 'Old'), ref('chapter', ch4, 'Chapter 4')));
  await savePage(t.notes.id, content);
  const rowsBefore = await mentionRows(db, t.notes.id);
  const pageBefore = ok(await pages.getWorkspacePage(t.notes.id));

  ok(await collections.renameCollectionEntry(t.nerai.id, 'Nerai of Vharos'));
  ok(await pages.renameWorkspacePage(t.magic.id, 'The Art'));
  await db.query(`update public.scenes set title = 'The Cave' where id = $1`, [pageId('h4b')]);
  await db.query(`update public.chapters set title = 'The Descent' where id = $1`, [ch4]);

  assert.deepEqual(await mentionRows(db, t.notes.id), rowsBefore);
  const pageAfter = ok(await pages.getWorkspacePage(t.notes.id));
  assert.deepEqual([pageAfter.content, pageAfter.version], [pageBefore.content, pageBefore.version], 'the text is untouched');

  const index = await shellIndex();
  const shown = (type, id) => refModel.describeTarget(index, { type, id })?.title;
  assert.equal(shown('entry', t.nerai.id), 'Nerai of Vharos');
  assert.equal(shown('page', t.magic.id), 'The Art');
  assert.match(shown('scene', pageId('h4b')), /The Cave$/);
  assert.equal(shown('chapter', ch4), nav.chapterTitle('The Descent'));
});

test('editing the text is the only way mentions change: removing one removes its backlink; order follows the text; repeats count once; row identity is kept', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const ch4 = chapterId('hollow.ch4');
  await savePage(t.notes.id, docOf(para(ref('entry', t.nerai.id), ' then ', ref('chapter', ch4), ' and ', ref('entry', t.nerai.id))));
  let rows = await mentionRows(db, t.notes.id);
  assert.deepEqual(rows.map((r) => [targetOf(r).id, r.position]), [[t.nerai.id, 1], [ch4, 2]], 'a repeated mention is one reference');
  const ids = Object.fromEntries(rows.map((r) => [targetOf(r).id, r.id]));

  await savePage(t.notes.id, docOf(para(ref('chapter', ch4), ' then ', ref('entry', t.nerai.id))));
  rows = await mentionRows(db, t.notes.id);
  assert.deepEqual(rows.map((r) => [r.id, r.position]), [[ids[ch4], 1], [ids[t.nerai.id], 2]], 'reordered in place');

  await savePage(t.notes.id, docOf(para('Just ', ref('chapter', ch4))));
  assert.deepEqual((await mentionRows(db, t.notes.id)).map((r) => r.id), [ids[ch4]]);
  assert.deepEqual(refModel.backlinksOf(await loadedRefs(), t.nerai.id), [], 'the backlink went with the mention');

  // Plain text never counts: only explicit references.
  await savePage(t.notes.id, docOf(para('Nerai, Chapter 4, Magic System, @Nerai')));
  assert.deepEqual(await mentionRows(db, t.notes.id), []);
  assert.deepEqual(docModel.inlineReferences(docOf(para('Nerai @Nerai [[Nerai]]'))), []);
});

test('links and mentions stay apart: the Inspector never lists or removes a mention, and the text never touches a link', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const link = ok(await refs.addObjectReference('page', t.notes.id, 'entry', t.nerai.id));
  await savePage(t.notes.id, docOf(para(ref('entry', t.nerai.id))));
  const mention = (await mentionRows(db, t.notes.id))[0];
  assert.notEqual(mention.id, link.id, 'one row each');
  assert.equal((await one(db, `select origin from public.object_references where id = $1`, [link.id])).origin, 'link');

  let loaded = await loadedRefs();
  assert.deepEqual(refModel.relatedOf(loaded, t.notes.id).map((r) => r.id), [link.id]);
  assert.deepEqual(refModel.backlinksOf(loaded, t.nerai.id).map((b) => [b.source.id, b.via, b.mentioned]), [[t.notes.id, [null], true]],
    'one backlink, saying both ways it refers');

  refused(await refs.removeObjectReference(mention.id), 'Reference not found');
  assert.equal(ok(await refs.addObjectReference('page', t.notes.id, 'entry', t.nerai.id)).id, link.id, 'the link, never the mention');
  assert.equal((await mentionRows(db, t.notes.id)).length, 1);

  ok(await refs.removeObjectReference(link.id));
  loaded = await loadedRefs();
  assert.deepEqual(refModel.backlinksOf(loaded, t.nerai.id).map((b) => [b.via, b.mentioned]), [[[], true]], 'removing the link keeps the mention');
  ok(await refs.addObjectReference('page', t.notes.id, 'entry', t.nerai.id));
  await savePage(t.notes.id, docOf(para('gone')));
  loaded = await loadedRefs();
  assert.deepEqual(refModel.backlinksOf(loaded, t.nerai.id).map((b) => [b.via, b.mentioned]), [[[null], false]], 'removing the mention keeps the link');

  // Chapters can be mentioned, never linked or made a Relationship value.
  refused(await refs.addObjectReference('page', t.notes.id, 'chapter', chapterId('hollow.ch4')), 'Unknown object type');
});

test('Trash: a trashed target\'s mention is dormant and returns with it; a new mention of one is kept in the text only; a trashed source hides its mentions; the save never fails', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const content = docOf(para(ref('entry', t.nerai.id, 'Nerai'), ' in ', ref('scene', pageId('h4c'), 'Cave')));
  await savePage(t.notes.id, content);

  ok(await trash.trashWorkspaceObject('entry', t.nerai.id));
  ok(await trash.trashWorkspaceObject('scene', pageId('h4c')));
  let loaded = await loadedRefs();
  assert.deepEqual(refModel.backlinksOf(loaded, t.nerai.id), []);
  assert.deepEqual(refModel.mentionsOf(loaded, t.notes.id), [], 'hidden while their targets are in Trash');
  assert.equal((await mentionRows(db, t.notes.id)).length, 2, 'kept, dormant');
  const index = await shellIndex();
  assert.equal(refModel.describeTarget(index, { type: 'entry', id: t.nerai.id }), null, 'shown as unavailable: its label, not a link');

  // Writing on — still mentioning them, and newly mentioning Djal, trashed first — saves.
  ok(await trash.trashWorkspaceObject('entry', t.djal.id));
  const more = docOf(...content.content, para('Also ', ref('entry', t.djal.id, 'Djal')));
  await savePage(t.notes.id, more);
  assert.deepEqual(ok(await pages.getWorkspacePage(t.notes.id)).content, more, 'the sentence is exactly as written');
  assert.deepEqual((await mentionRows(db, t.notes.id)).map((r) => targetOf(r).id), [t.nerai.id, pageId('h4c')],
    'no reference is made to an object in Trash');

  ok(await trash.restoreWorkspaceObject('entry', t.nerai.id));
  ok(await trash.restoreWorkspaceObject('scene', pageId('h4c')));
  loaded = await loadedRefs();
  assert.deepEqual(refModel.backlinksOf(loaded, t.nerai.id).map((b) => b.source.id), [t.notes.id], 'back with its target');
  assert.deepEqual(refModel.backlinksOf(loaded, pageId('h4c')).map((b) => b.source.id), [t.notes.id]);

  // A trashed source: its mentions are hidden, and return with it.
  ok(await trash.trashWorkspaceObject('page', t.notes.id));
  assert.deepEqual(refModel.backlinksOf(await loadedRefs(), t.nerai.id), []);
  ok(await trash.restoreWorkspaceObject('page', t.notes.id));
  assert.deepEqual(refModel.backlinksOf(await loadedRefs(), t.nerai.id).map((b) => b.source.id), [t.notes.id]);
});

test('permanent deletion of a target removes its reference, never the writer\'s sentence; later saves still succeed', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const ch5 = chapterId('hollow.ch4');
  const content = docOf(para('See ', ref('page', t.magic.id, 'Magic System'), ' and ', ref('chapter', ch5, 'Chapter 4'), ' and ', ref('entry', t.nerai.id, 'Nerai')));
  await savePage(t.notes.id, content);

  ok(await trash.trashWorkspaceObject('page', t.magic.id));
  ok(await trash.deleteTrashedWorkspaceObject('page', t.magic.id));
  // "Remove chapter, keep its scenes" deletes the Chapter itself (not Trash: 037).
  const del = await chapters.removeChapterKeepScenes(ch5, HOLLOW);
  assert.equal(del.error, null, del.error);
  assert.deepEqual((await mentionRows(db, t.notes.id)).map((r) => targetOf(r).id), [t.nerai.id]);
  assert.deepEqual(ok(await pages.getWorkspacePage(t.notes.id)).content, content, 'the text keeps every reference node and its label');
  assert.equal((await all(db, `select 1 from public.scenes where id = $1`, [pageId('h4a')])).length, 1, 'the Chapter\'s Scenes stay (Unplaced)');

  await savePage(t.notes.id, docOf(...content.content, para('More.')));
  assert.deepEqual((await mentionRows(db, t.notes.id)).map((r) => targetOf(r).id), [t.nerai.id]);
  const index = await shellIndex();
  assert.equal(refModel.describeTarget(index, { type: 'page', id: t.magic.id }), null);
  assert.equal(refModel.describeTarget(index, { type: 'chapter', id: ch5 }), null);
});

test('malformed, foreign and self references are ignored — never an error, never a row; nested ones are found', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  signIn(db, BRAM);
  const bramPage = ok(await pages.createWorkspacePage(projectId('tide'), 'Tide notes'));
  signIn(db, ALICE);
  const ashPage = ok(await pages.createWorkspacePage(ASH, 'Ash notes'));
  const junk = docOf(
    para(ref('entry', 'not-a-uuid')),
    para(ref('group', t.nerai.id)),
    para({ type: 'reference', attrs: { targetType: 'entry', targetId: null, label: 'x' } }),
    para(ref('page', t.notes.id, 'Myself')),
    para(ref('scene', pageId('a1a'), 'Alice\'s other Project')),
    para(ref('page', ashPage.id, 'Alice\'s other Project')),
    para(ref('scene', pageId('t1a'), 'Bram\'s')),
    para(ref('page', bramPage.id, 'Bram\'s')),
    para(ref('entry', '00000000-0000-4000-8000-00000000dead', 'Nothing')),
    para(ref('scene', t.nerai.id, 'Wrong type for that id')),
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para(ref('entry', t.nerai.id.toUpperCase(), 'Nested, upper case'))] }] },
  );
  await savePage(t.notes.id, junk);
  assert.deepEqual((await mentionRows(db, t.notes.id)).map(targetOf), [{ type: 'entry', id: t.nerai.id }]);
  // The shell reads the same nodes (it can't know which ids exist); what isn't
  // in this Project's index — foreign, missing, the wrong type — shows as unavailable.
  const read = docModel.inlineReferences(junk, { type: 'page', id: t.notes.id });
  assert.ok(!read.some((r) => r.id === t.notes.id || r.id === 'not-a-uuid' || r.type === 'group'), 'malformed and self are never read');
  const index = await shellIndex();
  assert.deepEqual(read.filter((r) => refModel.describeTarget(index, r)), [{ type: 'entry', id: t.nerai.id }]);
  assert.deepEqual(await all(db, `select * from public.object_references where project_id <> $1`, [HOLLOW]), [], 'nothing crosses Projects');
});

test('saving is as before: versions bump once per change, a stale save conflicts and changes nothing, an offline replay changes nothing, a rename is not a content change — and the manuscript is untouched', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const manuscriptBefore = await all(db, `select id, chapter_id, title, content, word_count, version, trashed_at from public.scenes order by id`);
  const chaptersBefore = await all(db, `select * from public.chapters order by id`);
  const projectsBefore = await all(db, `select id, word_count from public.projects order by id`);

  const v0 = ok(await pages.getWorkspacePage(t.notes.id)).version;
  const content = docOf(para(ref('entry', t.nerai.id)), embed('collection', '00000000-0000-4000-8000-000000000001'));
  const first = await pages.saveWorkspacePageContent(t.notes.id, content, v0);
  assert.deepEqual([first.status, first.version], ['ok', v0 + 1]);
  const rows = await mentionRows(db, t.notes.id);

  // A second window, still on v0: refused, and nothing it held is derived.
  const stale = await pages.saveWorkspacePageContent(t.notes.id, docOf(para(ref('entry', t.djal.id))), v0);
  assert.deepEqual([stale.status, stale.version], ['conflict', v0 + 1]);
  assert.deepEqual(await mentionRows(db, t.notes.id), rows);

  // A queued offline save replayed with the same content: nothing changes.
  const replay = await pages.saveWorkspacePageContent(t.notes.id, content, v0 + 1);
  assert.deepEqual([replay.status, replay.version], ['ok', v0 + 1]);
  assert.deepEqual(await mentionRows(db, t.notes.id), rows);

  ok(await pages.renameWorkspacePage(t.notes.id, 'Renamed'));
  assert.equal(ok(await pages.getWorkspacePage(t.notes.id)).version, v0 + 1);
  assert.deepEqual(await mentionRows(db, t.notes.id), rows);

  assert.deepEqual(await all(db, `select id, chapter_id, title, content, word_count, version, trashed_at from public.scenes order by id`), manuscriptBefore);
  assert.deepEqual(await all(db, `select * from public.chapters order by id`), chaptersBefore);
  assert.deepEqual(await all(db, `select id, word_count from public.projects order by id`), projectsBefore);
});

test('clients only read references: no insert, update or delete of a mention, and the derivation can\'t be called', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  await savePage(t.notes.id, docOf(para(ref('entry', t.nerai.id))));
  const [row] = await mentionRows(db, t.notes.id);
  for (const sql of [
    [`insert into public.object_references (project_id, source_type, source_document_id, target_type, target_entry_id, position, origin)
      values ($1, 'page', $2, 'entry', $3, 2, 'inline')`, [HOLLOW, t.notes.id, t.djal.id]],
    [`update public.object_references set position = 5 where id = $1`, [row.id]],
    [`delete from public.object_references where id = $1`, [row.id]],
    [`select public.sync_workspace_inline_references()`, []],
  ]) {
    await assert.rejects(asUser(db, ALICE, (tx) => tx.query(...sql)), /permission denied|can only be called as triggers/, sql[0]);
  }
  assert.deepEqual(await mentionRows(db, t.notes.id), [row]);
  // Bram never sees Alice's mentions.
  assert.equal((await asUser(db, BRAM, async (tx) => (await tx.query(`select * from public.object_references where origin = 'inline'`)).rows)).length, 0);
  // The table itself holds a mention to its rules: never a Relationship value, never a mention of a Chapter by link.
  const allies = ok(await refs.createRelationshipProperty(t.characters.id, 'Allies', 'entry', t.characters.id, true));
  await assert.rejects(db.query(`insert into public.object_references
      (project_id, source_type, source_entry_id, target_type, target_entry_id, position, origin, property_id)
      values ($1, 'entry', $2, 'entry', $3, 1, 'inline', $4)`, [HOLLOW, t.nerai.id, t.djal.id, allies.id]), /object_references_inline_generic/);
  await assert.rejects(db.query(`insert into public.object_references
      (project_id, source_type, source_document_id, target_type, target_entry_id, target_chapter_id, position, origin)
      values ($1, 'page', $2, 'chapter', $3, $4, 1, 'inline')`, [HOLLOW, t.notes.id, t.djal.id, chapterId('hollow.ch4')]), /object_references_target_matches_type|Both ends/);
  await assert.rejects(db.query(`update public.object_references set origin = 'link' where id = $1`, [row.id]), /for life/);
});

// ── 3. Embedded Views ──────────────────────────────────────────────────────

test('an embedded Collection View is its id only: the saved View, its Entries and values are never copied, and what it shows is the View\'s own arrangement as it changes', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const counts = async () => ({
    views: (await one(db, `select count(*)::int as n from public.workspace_collection_views`)).n,
    entries: (await one(db, `select count(*)::int as n from public.workspace_collection_entries`)).n,
    values: (await one(db, `select count(*)::int as n from public.workspace_entry_values`)).n,
    properties: (await one(db, `select count(*)::int as n from public.workspace_collection_properties`)).n,
    references: (await one(db, `select count(*)::int as n from public.object_references`)).n,
  });
  const table = ok(await views.createCollectionView(t.characters.id, 'Cast', 'table'));
  const before = await counts();
  const content = docOf(para('The cast:'), embed('collection', table.id), para(''));
  assertValidWorkspaceDoc(content);
  await savePage(t.notes.id, content);
  assert.deepEqual(await counts(), before, 'embedding copies nothing and references nothing');
  assert.deepEqual(docModel.inlineReferences(content), [], 'an embed is not a reference');

  // The embed resolves the View by id, and arranges the Collection's Entries exactly as the Collection does.
  const arranged = async () => {
    const w = await workspace.loadProjectWorkspace(HOLLOW);
    const view = w.views.find((v) => v.id === table.id);
    const index = await shellIndex();
    const collection = index.get(view.collection_id);
    return viewModel.arrangeEntries(view, {
      entryIds: collection.entryIds.filter((id) => index.has(id)),
      properties: w.properties.filter((p) => p.collection_id === collection.id),
      values: new Map(),
      titleOf: (id) => index.get(id)?.title ?? '',
    }).map((id) => index.get(id).title);
  };
  assert.deepEqual(await arranged(), ['Nerai', 'Djal']);
  ok(await views.updateCollectionView(table.id, { config: { ...table.config, sort: { by: 'title', direction: 'asc' } } }));
  assert.deepEqual(await arranged(), ['Djal', 'Nerai'], 'a change to the saved View is what the embed shows');
  ok(await collections.createCollectionEntry(t.characters.id, 'Alaric'));
  assert.deepEqual(await arranged(), ['Alaric', 'Djal', 'Nerai'], 'a new Entry appears — the canonical Entries, not a copy');
  ok(await trash.trashWorkspaceObject('entry', t.djal.id));
  assert.deepEqual(await arranged(), ['Alaric', 'Nerai'], 'Trash is respected');
  assert.deepEqual(ok(await pages.getWorkspacePage(t.notes.id)).content, content, 'the document never changed');

  // The View deleted: the embed has nothing to show; the text is kept.
  ok(await views.deleteCollectionView(table.id));
  assert.equal((await workspace.loadProjectWorkspace(HOLLOW)).views.some((v) => v.id === table.id), false);
  assert.deepEqual(ok(await pages.getWorkspacePage(t.notes.id)).content, content);
  // Its Collection in Trash: the Collection leaves the index, so the embed shows it as unavailable.
  ok(await views.createCollectionView(t.characters.id, 'Names', 'list'));
  ok(await trash.trashWorkspaceObject('collection', t.characters.id));
  assert.equal((await shellIndex()).has(t.characters.id), false);
});

test('an embedded Scene View shows the canonical Scene View: manuscript order, Unplaced after, Trash respected, its configuration as it changes — never a Scene\'s prose', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const view = ok(await sceneViewActions.createSceneView(HOLLOW, 'Order', 'list'));
  await savePage(t.notes.id, docOf(embed('scene', view.id)));
  const scenesBefore = await all(db, `select id, content, version, word_count from public.scenes order by id`);

  const arranged = async () => {
    const w = await workspace.loadProjectWorkspace(HOLLOW);
    const v = w.sceneViews.find((x) => x.id === view.id);
    const index = await shellIndex();
    const order = sceneModel.manuscriptSceneOrder(index);
    const ids = viewModel.arrangeItems(v, {
      entryIds: [...order.placed, ...order.unplaced],
      properties: sceneModel.sceneNativeProperties(w.manuscriptId, HOLLOW),
      values: sceneModel.sceneNativeValues(index, [...order.placed, ...order.unplaced]),
      titleOf: (id) => sceneModel.sceneViewLabel(index, id)?.title ?? '',
    });
    return { ids, order, unplacedAt: sceneModel.unplacedStart(index, ids, v.config.sort !== null) };
  };
  let r = await arranged();
  assert.deepEqual(r.ids, [...r.order.placed, ...r.order.unplaced], 'manuscript order: placed in reading order, then Unplaced');
  assert.equal(r.unplacedAt, r.order.placed.length, 'Unplaced Scenes under their own heading');
  assert.ok(r.ids.includes(pageId('h4b')));

  ok(await trash.trashWorkspaceObject('scene', pageId('h4b')));
  r = await arranged();
  assert.equal(r.ids.includes(pageId('h4b')), false, 'a trashed Scene isn\'t shown');

  ok(await sceneViewActions.updateSceneView(view.id, { config: { ...view.config, sort: { by: 'words', direction: 'desc' } } }));
  r = await arranged();
  assert.equal(r.unplacedAt, -1, 'sorted: the View\'s configuration, as saved');
  const index = await shellIndex();
  const words = r.ids.map((id) => index.get(id).words);
  assert.deepEqual(words, [...words].sort((a, b) => b - a));

  const scenesAfter = await all(db, `select id, content, version, word_count from public.scenes order by id`);
  assert.deepEqual(scenesAfter.filter((s) => s.id !== pageId('h4b')), scenesBefore.filter((s) => s.id !== pageId('h4b')),
    'no Scene\'s prose, version or words changed');
});

test('the editor inserts an embed as its own block — replacing an empty line, keeping a line after to write on', () => {
  const { editor } = workspaceEditor(docOf(para('Before'), para('')));
  toEnd(editor);
  ed.insertViewEmbed(editor, editor.state.selection.from, { viewKind: 'collection', viewId: '00000000-0000-4000-8000-0000000000aa' });
  const json = plain(editor.getJSON());
  assertValidWorkspaceDoc(json);
  assert.deepEqual(json.content.map((n) => n.type), ['paragraph', 'viewEmbed', 'paragraph']);
  assert.deepEqual(json.content[1].attrs, { viewKind: 'collection', viewId: '00000000-0000-4000-8000-0000000000aa' });

  const { editor: second } = workspaceEditor(docOf(para('Middle of a line'), para('After')));
  second.commands.setTextSelection(4);
  ed.insertViewEmbed(second, 4, { viewKind: 'scene', viewId: '00000000-0000-4000-8000-0000000000bb' });
  assert.deepEqual(second.getJSON().content.map((n) => n.type), ['paragraph', 'viewEmbed', 'paragraph'], 'after the line; the next line is kept');
  assert.deepEqual(plain(second.getJSON()).content[0], para('Middle of a line'));
  editor.destroy();
  second.destroy();
});

// ── 4. One editor; the manuscript unchanged; offline ──────────────────────

test('Page and Entry bodies share one Workspace editor — one schema, one set of commands — and the manuscript editor has none of it', () => {
  const src = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
  const host = src('src/components/rune2/WorkspacePages.tsx');
  assert.match(host, /<WorkspacePageEditor key=\{pageId\} entry=\{selected\} session=\{opened\.session\} \/>/, 'one editor for both kinds');
  const editorSrc = src('src/components/rune2/WorkspacePageEditor.tsx');
  assert.match(editorSrc, /workspaceEditorExtensions\(/);
  assert.match(editorSrc, /<WorkspaceCommandMenus /);
  assert.doesNotMatch(editorSrc, /session\.kind === "page" &&[^\n]*Command/, 'no Page-only command system');

  // The manuscript editor: its own StarterKit schema, none of the Workspace's nodes or menus.
  const scene = src('src/components/editor/useSceneEditor.ts');
  for (const name of ['workspaceEditor', 'WorkspaceCommandMenus', 'workspaceDocument', 'ReferenceNode', 'viewEmbed', 'extension-list', 'rune2/']) {
    assert.equal(scene.includes(name), false, `useSceneEditor never uses ${name}`);
  }
  const withRef = docOf(para('Nerai ', ref('entry', '00000000-0000-4000-8000-000000000001')));
  assert.throws(() => manuscriptSchema.editorDocument(withRef), 'manuscript prose cannot hold a reference');
  assert.throws(() => manuscriptSchema.editorDocument(docOf(embed('scene', '00000000-0000-4000-8000-000000000001'))));
  assertValidWorkspaceDoc(withRef);

  // Every Workspace document written before this milestone still parses exactly.
  const old = docOf({ type: 'heading', attrs: { level: 1 }, content: [text('Notes')] }, para('Plain ', { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }),
    { type: 'bulletList', content: [{ type: 'listItem', content: [para('one')] }] }, { type: 'blockquote', content: [para('q')] }, { type: 'horizontalRule' });
  assert.deepEqual(plain(workspaceSchema().nodeFromJSON(old).toJSON()), old);
});

test('content this editor cannot hold is reported by its content check (the editor then shows it read-only), never silently accepted', () => {
  let error = null;
  try {
    new ed.Editor({
      element: null,
      extensions: ed.workspaceSchemaExtensions(),
      enableContentCheck: true,
      onContentError: (e) => { error = e.error; },
      content: docOf(para('Kept'), { type: 'futureBlock', attrs: {} }),
    }).destroy();
  } catch {
    // Headless, TipTap's fallback (an empty document parsed from HTML) needs a DOM; the report came first.
  }
  assert.match(String(error?.message), /Invalid JSON content/, 'reported before anything is shown or saved');
  assert.equal(docModel.holdsUnknownContent(error), true, '…as unknown content: the editor goes read-only');

  // A document that merely fails the strict check — an empty one, as every new
  // Page or Entry is — loads as it always has, editable.
  let strict = null;
  new ed.Editor({ element: null, extensions: ed.workspaceSchemaExtensions(), enableContentCheck: true,
    onContentError: (e) => { strict = e.error; }, content: { type: 'doc', content: [] } }).destroy();
  assert.ok(strict, 'the strict check does flag an empty document');
  assert.equal(docModel.holdsUnknownContent(strict), false, '…but it is not unknown content');
  let mark = null;
  try {
    new ed.Editor({ element: null, extensions: ed.workspaceSchemaExtensions(), enableContentCheck: true,
      onContentError: (e) => { mark = e.error; }, content: docOf(para({ type: 'text', text: 'x', marks: [{ type: 'futureMark' }] })) }).destroy();
  } catch { /* headless fallback, as above */ }
  assert.equal(docModel.holdsUnknownContent(mark), true, 'an unknown mark is unknown content too');
  // Every valid Workspace document passes the same check.
  const fine = new ed.Editor({ element: null, extensions: ed.workspaceSchemaExtensions(), enableContentCheck: true,
    onContentError: () => assert.fail('a valid document'), content: docOf(para(ref('entry', '00000000-0000-4000-8000-000000000001')), embed('scene', '00000000-0000-4000-8000-000000000002')) });
  fine.destroy();
});

test('what the editor produces reaches the server whole: node attributes (no prototype, as ProseMirror builds them) become plain JSON before a save — a heading level, a tick, a reference, an embed', () => {
  const { editor } = workspaceEditor(docOf(
    { type: 'heading', attrs: { level: 2 }, content: [text('Cast')] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para('done')] }] },
    para(ref('entry', '00000000-0000-4000-8000-000000000001', 'Nerai')),
    embed('scene', '00000000-0000-4000-8000-000000000002'),
  ));
  const raw = editor.getJSON();
  assert.equal(Object.getPrototypeOf(raw.content[0].attrs), null, 'as the editor gives it: what a server action drops');
  const sent = docModel.toPlainDocument(raw);
  const protos = [];
  (function walk(v) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') { protos.push(Object.getPrototypeOf(v)); Object.values(v).forEach(walk); }
  })(sent);
  assert.ok(protos.every((p) => p === Object.prototype || p === Array.prototype), 'every object plain');
  assert.deepEqual(sent, plain(raw), 'with exactly the same data');
  assert.equal(sent.content[0].attrs.level, 2);
  assert.equal(sent.content[1].content[0].attrs.checked, true);
  assert.deepEqual(docModel.inlineReferences(sent), [{ type: 'entry', id: '00000000-0000-4000-8000-000000000001' }]);
  // The Page and Entry save path applies it (WorkspacePages → PageSaver's save).
  const host = fs.readFileSync(path.join(REPO_DIR, 'src/components/rune2/WorkspacePages.tsx'), 'utf8');
  assert.match(host, /save: \(content, expectedVersion\) => DOCUMENT_IO\[kind\]\.save\(id, toPlainDocument\(content\), expectedVersion\)/);
  editor.destroy();
});

test('offline: a document with references and embeds survives the device store exactly, and the reference store shows its mentions before the server has them', async () => {
  const content = docOf(para('Nerai ', ref('entry', '00000000-0000-4000-8000-0000000000c1', 'Nerai')), embed('scene', '00000000-0000-4000-8000-0000000000c2'));
  for (const kind of ['page', 'entry']) {
    await drafts.putPageDraft({ id: `doc-${kind}`, userId: ALICE, projectId: HOLLOW, content, baseVersion: 3, dirty: true, savedAt: 1 }, kind);
    const draft = await drafts.getPageDraft(`doc-${kind}`, ALICE, kind);
    assert.deepEqual([draft.content, draft.baseVersion, draft.dirty], [content, 3, true], kind);
  }
  // The pending mentions the editor shows: derived from the text, in its order, shaped as saved ones.
  const source = { type: 'page', id: '00000000-0000-4000-8000-0000000000d1' };
  const pending = refModel.pendingMentions(source, docModel.inlineReferences(content, source), 'pending:');
  assert.deepEqual(pending.map((r) => [r.origin, r.target, r.position, r.propertyId, refModel.listKey(r)]), [
    ['inline', { type: 'entry', id: '00000000-0000-4000-8000-0000000000c1' }, 1, null, `inline:${source.id}`],
  ]);
  assert.deepEqual(refModel.backlinksOf(pending, '00000000-0000-4000-8000-0000000000c1').map((b) => [b.source, b.mentioned]), [[source, true]]);
  assert.ok(docModel.sameTargets(docModel.inlineReferences(content), [{ type: 'entry', id: '00000000-0000-4000-8000-0000000000c1' }]));
});
