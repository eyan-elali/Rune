// Native Bases (Rune 2.0, Milestone 21E.2): the structural SCOPE a Scene View
// is arranged within — the Manuscript's page (every placed Scene, Unplaced
// apart) or a Group's page (the Scenes of the Chapters descended from it) —
// over the real index (lib/rune2/navigatorModel.ts, lib/manuscriptStructure.ts)
// and the real View engine (lib/rune2/collectionViews.ts), with the pure
// rules in lib/rune2/sceneViews.ts:
//
//   * Group scope: a Chapter directly under the Group, nested Groups at any
//     depth, several Scenes per Chapter, manuscript order kept
//   * movement: a Chapter moved between Groups, a Scene moved between
//     Chapters, a nested Group moved — each leaves and joins scopes by the
//     live structure alone; nothing is stored about membership
//   * Trash / restore: a trashed Chapter or Scene is out of every scope and
//     back on restore (the index simply lacks or has it)
//   * Manuscript scope: all placed, active Scenes in order; Unplaced apart
//     and never in a Group's
//   * saved Views: List / Table / Board / Timeline, filters, sort and grouping
//     all compose with the scope — no View can show a Scene outside it; each
//     Base owns its saved Views (044) and opens in its first; a View's
//     config is checked against the Manuscript's fields whichever Base
//     holds it
//   * Reading Mode: a View read within a Group keeps that scope in its tab key
//   * the Entry properties fold: a per-Collection, per-writer preference, read
//     leniently and never losing other Collections' choices
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bundleForTest } from '../lib/bundle.mjs';

let model, structure, scenes, views, reading, prefs;
before(async () => {
  model = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'scope_navigator_model' });
  structure = await bundleForTest('src/lib/manuscriptStructure.ts', { name: 'scope_structure' });
  scenes = await bundleForTest('src/lib/rune2/sceneViews.ts', { name: 'scope_scene_views' });
  views = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'scope_collection_views' });
  reading = await bundleForTest('src/lib/rune2/reading.ts', { name: 'scope_reading' });
  prefs = await bundleForTest('src/lib/rune2/entryPropertyPrefs.ts', { name: 'scope_entry_prefs' });
});

const group = (id, parent, position, title = null) => ({ id, parent_group_id: parent, position, title, manuscript_id: 'm' });
const chapter = (id, groupId, position, title, sceneIds) => ({
  id, group_id: groupId, position, title,
  scenes: sceneIds.map((s, i) => ({ id: s, title: `Scene ${i + 1}`, word_count: 100 + i })),
});
const scene = (id, word_count = 10) => ({ id, title: '', word_count });

//   Part 1
//   ├── Chapter 1  (s1a)
//   └── Chapter 2  (s2a, s2b)
//   Part 2
//   ├── Act A
//   │   ├── Chapter 16 (s16a)
//   │   ├── Chapter 17 (s17a, s17b)
//   │   └── Chapter 18 (s18a)
//   └── Chapter 19 (s19a)
//   Chapter 20 (s20a)        — top level
//   Unplaced: u1, u2
function shape() {
  return {
    groups: [group('p1', null, 1, 'Part 1'), group('p2', null, 2, 'Part 2'), group('actA', 'p2', 1, 'Act A')],
    chapters: [
      chapter('c1', 'p1', 1, 'One', ['s1a']),
      chapter('c2', 'p1', 2, 'Two', ['s2a', 's2b']),
      chapter('c16', 'actA', 1, 'Sixteen', ['s16a']),
      chapter('c17', 'actA', 2, 'Seventeen', ['s17a', 's17b']),
      chapter('c18', 'actA', 3, 'Eighteen', ['s18a']),
      chapter('c19', 'p2', 2, 'Nineteen', ['s19a']),
      chapter('c20', null, 3, 'Twenty', ['s20a']),
    ],
    unplaced: [scene('u1'), scene('u2')],
  };
}

function indexOf({ groups, chapters, unplaced }) {
  return model.indexManuscript({
    project: { id: 'p', title: 't' },
    outline: structure.buildManuscriptOutline(groups, chapters),
    groupCount: groups.length,
    chapterCount: chapters.length,
    placedSceneCount: chapters.reduce((n, c) => n + c.scenes.length, 0),
    unplaced,
    manuscriptWords: 0,
    unplacedWords: 0,
  });
}

const inGroup = (index, groupId) => scenes.scopedSceneOrder(index, { kind: 'group', groupId });
const inManuscript = (index) => scenes.scopedSceneOrder(index, { kind: 'manuscript' });

// ── Scope ───────────────────────────────────────────────────────────────────

test('Manuscript scope: every active placed Scene in manuscript order, Unplaced apart', () => {
  const order = inManuscript(indexOf(shape()));
  assert.deepEqual(order.placed, ['s1a', 's2a', 's2b', 's16a', 's17a', 's17b', 's18a', 's19a', 's20a']);
  assert.deepEqual(order.unplaced, ['u1', 'u2']);
});

test('Group scope: direct Chapters, several Scenes per Chapter, manuscript order; never Unplaced', () => {
  const index = indexOf(shape());
  assert.deepEqual(inGroup(index, 'p1'), { placed: ['s1a', 's2a', 's2b'], unplaced: [] });
  assert.deepEqual(inGroup(index, 'actA').placed, ['s16a', 's17a', 's17b', 's18a']);
});

test('Group scope is recursive: a parent Group holds its nested Groups’ Scenes and its own Chapters’', () => {
  const index = indexOf(shape());
  assert.deepEqual(inGroup(index, 'p2').placed, ['s16a', 's17a', 's17b', 's18a', 's19a']);
  // A top-level Chapter is in no Group's scope.
  for (const g of ['p1', 'p2', 'actA']) assert.ok(!inGroup(index, g).placed.includes('s20a'));
  // An unknown Group holds nothing.
  assert.deepEqual(inGroup(index, 'nope'), { placed: [], unplaced: [] });
});

test('groupFacts: Groups, Chapters and Scenes inside a Group at any depth', () => {
  const index = indexOf(shape());
  assert.deepEqual(scenes.groupFacts(index, 'p2'), { groups: 1, chapters: 4, scenes: 5 });
  assert.deepEqual(scenes.groupFacts(index, 'actA'), { groups: 0, chapters: 3, scenes: 4 });
  assert.deepEqual(scenes.groupFacts(index, 'p1'), { groups: 0, chapters: 2, scenes: 3 });
});

test('moving a Chapter between Groups moves its Scenes between scopes, by structure alone', () => {
  const s = shape();
  // Chapter 18 leaves Act A (inside Part 2) for Part 1.
  s.chapters = s.chapters.map((c) => (c.id === 'c18' ? { ...c, group_id: 'p1', position: 3 } : c));
  const index = indexOf(s);
  assert.deepEqual(inGroup(index, 'p1').placed, ['s1a', 's2a', 's2b', 's18a']);
  assert.deepEqual(inGroup(index, 'actA').placed, ['s16a', 's17a', 's17b']);
  assert.deepEqual(inGroup(index, 'p2').placed, ['s16a', 's17a', 's17b', 's19a']);
  // The Manuscript still has it, in its new place.
  assert.deepEqual(inManuscript(index).placed, ['s1a', 's2a', 's2b', 's18a', 's16a', 's17a', 's17b', 's19a', 's20a']);
});

test('moving a Scene between Chapters in different Groups moves it between scopes', () => {
  const s = shape();
  const from = s.chapters.find((c) => c.id === 'c17');
  const moved = from.scenes.find((x) => x.id === 's17b');
  from.scenes = from.scenes.filter((x) => x.id !== 's17b');
  s.chapters.find((c) => c.id === 'c1').scenes.push(moved);
  const index = indexOf(s);
  assert.deepEqual(inGroup(index, 'p1').placed, ['s1a', 's17b', 's2a', 's2b']);
  assert.ok(!inGroup(index, 'p2').placed.includes('s17b'));
  assert.ok(!inGroup(index, 'actA').placed.includes('s17b'));
  // Its number follows its new place and is never stored.
  assert.equal(scenes.sceneNumber(index, 's17b'), '1.2');
});

test('moving a nested Group moves every Scene under it between scopes', () => {
  const s = shape();
  s.groups = s.groups.map((g) => (g.id === 'actA' ? { ...g, parent_group_id: 'p1', position: 3 } : g));
  const index = indexOf(s);
  assert.deepEqual(inGroup(index, 'p1').placed, ['s1a', 's2a', 's2b', 's16a', 's17a', 's17b', 's18a']);
  assert.deepEqual(inGroup(index, 'p2').placed, ['s19a']);
  assert.deepEqual(inGroup(index, 'actA').placed, ['s16a', 's17a', 's17b', 's18a'], 'the moved Group’s own scope is unchanged');
});

test('Trash and restore: a trashed Chapter or Scene is out of every scope, back on restore', () => {
  // The index is built from active objects only (RLS hides Trash): trashing
  // is the object leaving the structure, restoring is its return.
  const trashed = shape();
  trashed.chapters = trashed.chapters.filter((c) => c.id !== 'c17');
  trashed.chapters.find((c) => c.id === 'c2').scenes = [{ id: 's2a', title: 'Scene 1', word_count: 100 }];
  const gone = indexOf(trashed);
  assert.deepEqual(inGroup(gone, 'actA').placed, ['s16a', 's18a']);
  assert.deepEqual(inGroup(gone, 'p1').placed, ['s1a', 's2a']);
  assert.ok(!inManuscript(gone).placed.includes('s17a') && !inManuscript(gone).placed.includes('s2b'));

  const back = indexOf(shape());
  assert.deepEqual(inGroup(back, 'actA').placed, ['s16a', 's17a', 's17b', 's18a']);
  assert.deepEqual(inGroup(back, 'p1').placed, ['s1a', 's2a', 's2b']);
});

// ── Saved Views within a scope ──────────────────────────────────────────────

const PROPS = [
  { id: 'pov', name: 'POV', type: 'select', options: [{ id: 'nerai', name: 'Nerai' }, { id: 'alaric', name: 'Alaric' }], position: 1 },
  { id: 'status', name: 'Status', type: 'status', options: [{ id: 'draft', name: 'Draft' }, { id: 'done', name: 'Done' }], position: 2 },
];
const key = (sceneId, propertyId) => `${sceneId}:${propertyId}`;

function sceneValues(index, ids) {
  const native = scenes.sceneNativeValues(index, ids);
  const values = new Map(native);
  // Nerai narrates the odd Scenes of each Chapter, Alaric the even; Part 1 is done.
  for (const id of ids) {
    const n = index.get(id).ordinal;
    values.set(key(id, 'pov'), n % 2 === 1 ? 'nerai' : 'alaric');
    values.set(key(id, 'status'), id.startsWith('s1a') || id.startsWith('s2') ? 'done' : 'draft');
  }
  return values;
}

function arrangeIn(index, scope, view) {
  const ids = scenes.scopedSceneOrder(index, scope);
  const all = [...ids.placed, ...ids.unplaced];
  const properties = [...PROPS, ...scenes.sceneNativeProperties('m', 'p')];
  return views.arrangeItems(view, {
    entryIds: all,
    properties,
    values: sceneValues(index, all),
    titleOf: (id) => scenes.sceneViewLabel(index, id)?.title ?? '',
  });
}

const view = (type, config = {}) => ({
  id: `v-${type}`, manuscript_id: 'm', project_id: 'p', name: type, type, position: 1,
  config: { ...views.EMPTY_VIEW_CONFIG, ...config }, created_at: '', updated_at: '',
});

test('every View type arranges only the scope’s Scenes: List, Table, Board, Timeline', () => {
  const index = indexOf(shape());
  const scope = { kind: 'group', groupId: 'p2' };
  const inScope = new Set(inGroup(index, 'p2').placed);
  for (const v of [view('list'), view('table'), view('board', { group_by: 'status' }), view('timeline', { axis: 'manuscript' })]) {
    const arranged = arrangeIn(index, scope, v);
    assert.deepEqual(arranged, ['s16a', 's17a', 's17b', 's18a', 's19a'], v.type);
    assert.ok(arranged.every((id) => inScope.has(id)), `${v.type} never leaves the scope`);
  }
});

test('a user filter composes with the structural scope: POV = Nerai inside Part 2', () => {
  const index = indexOf(shape());
  const nerai = view('list', { filters: [{ property: 'pov', op: 'is', value: 'nerai' }] });
  assert.deepEqual(arrangeIn(index, { kind: 'group', groupId: 'p2' }, nerai), ['s16a', 's17a', 's18a', 's19a']);
  assert.deepEqual(arrangeIn(index, { kind: 'group', groupId: 'p1' }, nerai), ['s1a', 's2a']);
  // The same View over the whole manuscript: the scope is the page's, not the View's (u2 is Alaric's).
  assert.deepEqual(arrangeIn(index, { kind: 'manuscript' }, nerai), ['s1a', 's2a', 's16a', 's17a', 's18a', 's19a', 's20a', 'u1']);
});

test('no filter, sort or grouping can widen a scope: an "is not" or an empty filter still stays inside', () => {
  const index = indexOf(shape());
  const scope = { kind: 'group', groupId: 'actA' };
  const inScope = new Set(inGroup(index, 'actA').placed);
  const cases = [
    view('list', { filters: [{ property: 'pov', op: 'is_not', value: 'nerai' }] }),
    view('list', { filters: [{ property: 'status', op: 'is_empty' }] }),
    view('table', { sort: { by: 'words', direction: 'desc' } }),
    view('table', { sort: { by: 'title', direction: 'asc' } }),
    view('board', { group_by: 'pov' }),
    view('list', { filters: [{ property: 'placement', op: 'is', value: 'unplaced' }] }),
  ];
  for (const v of cases) {
    const arranged = arrangeIn(index, scope, v);
    assert.ok(arranged.every((id) => inScope.has(id)), JSON.stringify(v.config));
  }
  // Unplaced Scenes exist, but a Group's scope never holds one.
  assert.deepEqual(arrangeIn(index, scope, cases[5]), []);
  assert.deepEqual(arrangeIn(index, { kind: 'manuscript' }, cases[5]), ['u1', 'u2']);
});

test('a sort within a Group reorders only the Group’s Scenes', () => {
  const index = indexOf(shape());
  const byWordsDesc = view('table', { sort: { by: 'words', direction: 'desc' } });
  // Words: first Scene of a Chapter 100, second 101 — the seconds lead.
  assert.deepEqual(arrangeIn(index, { kind: 'group', groupId: 'p2' }, byWordsDesc), ['s17b', 's16a', 's17a', 's18a', 's19a']);
});

test('each Base opens in its own first View; a Base with no saved View shows an unsaved List of its own (044)', () => {
  const saved = [view('board', { group_by: 'status' }), { ...view('list'), id: 'v-list-2', position: 2 }, { ...view('table'), position: 3 }];
  assert.equal(scenes.defaultViewFor(saved, { kind: 'group', groupId: 'p1' }).id, 'v-board');
  assert.equal(scenes.defaultViewFor(saved, { kind: 'manuscript' }).id, 'v-board');
  // The Manuscript's unsaved List, and a Group's: distinct ids, owners and names.
  const fallback = scenes.sceneFallbackView('m', 'p', PROPS);
  const groupFallback = scenes.sceneFallbackView('m', 'p', PROPS, { kind: 'group', groupId: 'p1' });
  assert.deepEqual([fallback.id, fallback.group_id, fallback.name, fallback.type], ['list:m', null, 'Manuscript order', 'list']);
  assert.deepEqual([groupFallback.id, groupFallback.group_id, groupFallback.name, groupFallback.type], ['list:p1', 'p1', 'List', 'list']);
  assert.deepEqual(groupFallback.config.properties, fallback.config.properties, 'the same first properties');
  assert.equal(views.isFallbackView(groupFallback), true);
  assert.equal(scenes.defaultViewFor([groupFallback], { kind: 'group', groupId: 'p1' }).id, groupFallback.id);
  // Ownership: a View belongs to its Group's Base, or to the Manuscript's; a row read before 044 (no group_id) is the Manuscript's.
  assert.equal(views.viewOwner({ ...view('list'), group_id: 'p1' }), 'p1');
  assert.equal(views.viewOwner({ ...view('list'), group_id: null }), 'm');
  assert.equal(views.viewOwner(view('list')), 'm');
  assert.deepEqual(scenes.viewScope({ group_id: 'p2' }), { kind: 'group', groupId: 'p2' });
  assert.deepEqual(scenes.viewScope({ group_id: null }), { kind: 'manuscript' });
  assert.equal(scenes.baseOwnerId('m', { kind: 'group', groupId: 'p2' }), 'p2');
  assert.equal(scenes.baseOwnerId('m', { kind: 'manuscript' }), 'm');
  // Each Base's tabs are its own.
  const all = [...saved, { ...view('list'), id: 'g-list', group_id: 'p1' }, { ...view('board', { group_by: 'status' }), id: 'g-board', position: 2, group_id: 'p1' }];
  assert.deepEqual(views.viewsOf(all, 'm').map((v) => v.id), ['v-board', 'v-list-2', 'v-table']);
  assert.deepEqual(views.viewsOf(all, 'p1').map((v) => v.id), ['g-list', 'g-board']);
  assert.deepEqual(views.viewsOf(all, 'p2'), []);
});

test('isInGroup reads ancestry only: Chapters and Scenes, at any depth; never a Group itself', () => {
  const index = indexOf(shape());
  assert.equal(scenes.isInGroup(index.get('c18'), 'p2'), true);
  assert.equal(scenes.isInGroup(index.get('c18'), 'actA'), true);
  assert.equal(scenes.isInGroup(index.get('s18a'), 'p2'), true);
  assert.equal(scenes.isInGroup(index.get('actA'), 'actA'), false);
  assert.equal(scenes.isInGroup(index.get('actA'), 'p2'), true);
  assert.equal(scenes.isInGroup(index.get('u1'), 'p2'), false);
});

// ── Reading Mode within a scope ─────────────────────────────────────────────

test('a View read within a Group keeps the Group in its Reading tab key; without one it reads as before', () => {
  const scoped = reading.readingTabKey({ kind: 'view', viewId: 'v1', groupId: 'p2' });
  const plain = reading.readingTabKey({ kind: 'view', viewId: 'v1' });
  assert.notEqual(scoped, plain, 'the Group’s reading is its own tab');
  assert.deepEqual(reading.readingSourceOf(scoped), { kind: 'view', viewId: 'v1', groupId: 'p2' });
  assert.deepEqual(reading.readingSourceOf(plain), { kind: 'view', viewId: 'v1' });
  assert.equal(reading.readingSourceOf('reading:view:@p2'), null);
  assert.equal(reading.readingSourceOf('reading:view:v1@'), null);
});

// ── The Entry properties fold ───────────────────────────────────────────────

test('the fold preference: per Collection, read leniently, other Collections kept', () => {
  assert.deepEqual(prefs.parseCollapsed(null), {});
  assert.deepEqual(prefs.parseCollapsed('not json'), {});
  assert.deepEqual(prefs.parseCollapsed('[1,2]'), {});
  assert.deepEqual(prefs.parseCollapsed('{"a":true,"b":false,"c":"yes","":true}'), { a: true });

  let map = prefs.parseCollapsed('{"characters":true}');
  assert.equal(prefs.isCollapsed(map, 'characters'), true);
  assert.equal(prefs.isCollapsed(map, 'places'), false, 'shown by default');

  map = prefs.withCollapsed(map, 'places', true);
  assert.deepEqual(map, { characters: true, places: true });
  map = prefs.withCollapsed(map, 'characters', false);
  assert.deepEqual(map, { places: true }, 'a Collection shown is simply absent');
  assert.equal(prefs.withCollapsed(map, 'places', true), map, 'unchanged when nothing changes');
  assert.equal(prefs.withCollapsed(map, 'characters', false), map);
});
