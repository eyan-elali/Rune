// The Rune 2.0 navigator's presentation rules (src/lib/rune2/navigatorModel.ts):
// which Chapters list their Scenes, and the id index behind selection and
// breadcrumbs — built over the real outline builder (lib/manuscriptStructure.ts).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bundleForTest } from '../lib/bundle.mjs';

let model, structure;
before(async () => {
  model = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'rune2_navigator_model' });
  structure = await bundleForTest('src/lib/manuscriptStructure.ts', { name: 'rune2_navigator_structure' });
});

const group = (id, parent, position, title = null) => ({ id, parent_group_id: parent, position, title, manuscript_id: 'm' });
const chapter = (id, groupId, position, title, scenes) => ({ id, group_id: groupId, position, title, scenes });
const scene = (id, word_count, title = '') => ({ id, title, word_count });

function manuscript() {
  const groups = [group('book', null, 1, 'Book One'), group('part', 'book', 1, null)];
  const chapters = [
    chapter('c1', 'part', 1, 'The Well', [scene('s1', 100, 'Scene 1'), scene('s2', 50, 'Scene 2')]),
    chapter('c2', null, 2, '', [scene('s3', 7, 'Scene 1')]),
    chapter('c3', 'book', 2, 'Empty', []),
  ];
  return {
    project: { id: 'p', title: 'hollow' },
    outline: structure.buildManuscriptOutline(groups, chapters),
    groupCount: 2, chapterCount: 3, placedSceneCount: 3,
    unplaced: [scene('u1', 12, '')],
    manuscriptWords: 157, unplacedWords: 12,
  };
}

test('chapterShowsScenes: a Chapter reads as just the Chapter until it has several Scenes', () => {
  assert.equal(model.chapterShowsScenes({ scenes: [] }), false);
  assert.equal(model.chapterShowsScenes({ scenes: [1] }), false);
  assert.equal(model.chapterShowsScenes({ scenes: [1, 2] }), true);
});

test('indexManuscript: every object by id, with kind, display title, words and ancestry', () => {
  const index = model.indexManuscript(manuscript());
  assert.deepEqual([...index.keys()].sort(), ['book', 'c1', 'c2', 'c3', 'part', 's1', 's2', 's3', 'u1']);

  const book = index.get('book');
  assert.equal(book.kind, 'group');
  assert.equal(book.words, 150, 'a Group sums its Chapters at any depth');
  assert.equal(book.childCount, 2);

  assert.equal(index.get('part').title, 'Untitled group');
  assert.deepEqual(index.get('part').path.map((p) => p.id), ['book']);

  const well = index.get('c1');
  assert.equal(well.kind, 'chapter');
  assert.equal(well.words, 150);
  assert.deepEqual(well.sceneIds, ['s1', 's2']);
  assert.deepEqual(well.path.map((p) => p.title), ['Book One', 'Untitled group']);

  assert.equal(index.get('c2').title, 'Untitled chapter');
  assert.deepEqual(index.get('c2').path, [], 'a top-level Chapter has no ancestors');
  assert.equal(index.get('c3').words, 0);

  const s2 = index.get('s2');
  assert.equal(s2.kind, 'scene');
  assert.deepEqual(s2.path.map((p) => p.id), ['book', 'part', 'c1']);

  const u1 = index.get('u1');
  assert.equal(u1.kind, 'unplacedScene');
  assert.equal(u1.title, 'Untitled scene');
  assert.equal(u1.words, 12);
  assert.deepEqual(u1.path, []);
});

test('unnamed Scenes are labelled by their current position — presentation only, never stored', () => {
  const groups = [];
  const chapters = [
    chapter('c1', null, 1, 'The Well', [scene('a', 0, 'Arrival'), scene('b', 0, ''), scene('c', 0, '  '), scene('d', 0, 'Untitled scene')]),
  ];
  const ms = {
    project: { id: 'p', title: 'hollow' },
    outline: structure.buildManuscriptOutline(groups, chapters),
    groupCount: 0, chapterCount: 1, placedSceneCount: 4,
    unplaced: [scene('u', 0, ''), scene('v', 0, 'Draft ending')],
    manuscriptWords: 0, unplacedWords: 0,
  };
  const index = model.indexManuscript(ms);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => index.get(id).title), ['Arrival', 'Scene 2', 'Scene 3', 'Scene 4']);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => index.get(id).named), [true, false, false, false]);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => index.get(id).ordinal), [1, 2, 3, 4]);
  assert.equal(index.get('c1').ordinal, 1);
  assert.equal(index.get('u').title, 'Untitled scene', 'an Unplaced Scene has no Chapter position');
  assert.equal(index.get('u').named, false);
  assert.equal(index.get('v').title, 'Draft ending');

  // Order changes: the labels follow the position, not the Scene.
  const moved = { ...ms, outline: structure.buildManuscriptOutline(groups, [
    chapter('c1', null, 1, 'The Well', [scene('c', 0, ''), scene('a', 0, 'Arrival'), scene('b', 0, '')]),
  ]) };
  const after = model.indexManuscript(moved);
  assert.deepEqual(['c', 'a', 'b'].map((id) => after.get(id).title), ['Scene 1', 'Arrival', 'Scene 3']);
});

test('indexManuscript overlays titles renamed but not yet re-read, everywhere they appear', () => {
  const index = model.indexManuscript(manuscript(), { c1: 'The Deep Well', s2: 'Descent', part: '', u1: 'Loose end' });
  assert.equal(index.get('c1').title, 'The Deep Well');
  assert.equal(index.get('s2').title, 'Descent');
  assert.equal(index.get('s2').named, true);
  assert.equal(index.get('s2').path.at(-1).title, 'The Deep Well', 'breadcrumb ancestry uses the new title');
  assert.equal(index.get('part').title, 'Untitled group');
  assert.equal(index.get('u1').title, 'Loose end');
});
