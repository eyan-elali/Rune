// The Rune 2.0 writing surface's selection mapping (src/lib/rune2/writingTarget.ts):
// which Scene a navigator selection opens in the editor, and how it is named.
// Built over the real navigator index and outline builder.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bundleForTest } from '../lib/bundle.mjs';

let target, model, structure;
before(async () => {
  target = await bundleForTest('src/lib/rune2/writingTarget.ts', { name: 'rune2_writing_target' });
  model = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'rune2_writing_target_model' });
  structure = await bundleForTest('src/lib/manuscriptStructure.ts', { name: 'rune2_writing_target_structure' });
});

const scene = (id, title = '') => ({ id, title, word_count: 0 });

function index() {
  const groups = [{ id: 'part', parent_group_id: null, position: 1, title: 'Part One', manuscript_id: 'm' }];
  const chapters = [
    { id: 'c1', group_id: 'part', position: 1, title: 'The Well', scenes: [scene('s1', 'Arrival'), scene('s2', 'Night')] },
    { id: 'c2', group_id: null, position: 2, title: 'Chapter 2', scenes: [scene('s3', 'Scene 1')] },
    { id: 'c3', group_id: null, position: 3, title: '', scenes: [] },
  ];
  return model.indexManuscript({
    project: { id: 'p', title: 'hollow' },
    outline: structure.buildManuscriptOutline(groups, chapters),
    groupCount: 1, chapterCount: 3, placedSceneCount: 3,
    unplaced: [scene('u1', '')],
    manuscriptWords: 0, unplacedWords: 0,
  });
}

const open = (id) => {
  const i = index();
  return target.writingTargetFor(id === null ? null : i.get(id), i);
};

test('the Manuscript and Groups are structure, not prose: nothing opens', () => {
  assert.equal(open(null), null);
  assert.equal(open('part'), null);
});

test('a Chapter that hides its Scene opens that Scene, presented as the Chapter', () => {
  assert.deepEqual(open('c2'), { kind: 'scene', sceneId: 's3', title: 'Chapter 2', eyebrow: null, note: null });
});

test('a Chapter with several Scenes opens its first, keeping the Chapter as the heading', () => {
  assert.deepEqual(open('c1'), {
    kind: 'scene', sceneId: 's1', title: 'The Well', eyebrow: null, note: 'Scene 1 of 2 · Arrival',
  });
});

test('a visible Scene opens itself, under its Chapter', () => {
  assert.deepEqual(open('s2'), { kind: 'scene', sceneId: 's2', title: 'Night', eyebrow: 'The Well', note: null });
});

test('an Unplaced Scene opens itself', () => {
  assert.deepEqual(open('u1'), { kind: 'scene', sceneId: 'u1', title: 'Untitled scene', eyebrow: 'Unplaced', note: null });
});

test('a Chapter with no Scenes is an empty Chapter', () => {
  assert.deepEqual(open('c3'), { kind: 'emptyChapter', chapterId: 'c3', title: 'Untitled chapter' });
});
