// The Rune 2.0 writing surface's selection mapping (src/lib/rune2/writingTarget.ts):
// which Scenes a navigator selection opens in the editor, and how they are named.
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
    { id: 'c1', group_id: 'part', position: 1, title: 'The Well', scenes: [scene('s1', 'Arrival'), scene('s2', 'Night'), scene('s4', '')] },
    { id: 'c2', group_id: null, position: 2, title: 'Chapter 2', scenes: [scene('s3', 'Scene 1')] },
    { id: 'c3', group_id: null, position: 3, title: '', scenes: [] },
  ];
  return model.indexManuscript({
    project: { id: 'p', title: 'hollow' },
    outline: structure.buildManuscriptOutline(groups, chapters),
    groupCount: 1, chapterCount: 3, placedSceneCount: 4,
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

test('a Chapter that hides its Scene opens that one Scene as the Chapter, with no boundary', () => {
  assert.deepEqual(open('c2'), {
    kind: 'scenes', view: 'chapter', scenes: [{ id: 's3', mark: null }], marks: false,
    title: 'Chapter 2', eyebrow: null, addSceneTo: 'c2',
  });
});

test('a Chapter with several Scenes opens all of them, in order, as one continuous Chapter', () => {
  assert.deepEqual(open('c1'), {
    kind: 'scenes', view: 'chapter',
    scenes: [{ id: 's1', mark: 'Arrival' }, { id: 's2', mark: 'Night' }, { id: 's4', mark: null }],
    marks: true, title: 'The Well', eyebrow: null, addSceneTo: 'c1',
  });
});

test('a visible Scene opens alone, focused, under its Chapter', () => {
  assert.deepEqual(open('s2'), {
    kind: 'scenes', view: 'scene', scenes: [{ id: 's2', mark: null }], marks: false,
    title: 'Night', eyebrow: 'The Well', addSceneTo: 'c1',
  });
});

test('an Unplaced Scene opens alone, with no "+ Scene" target', () => {
  assert.deepEqual(open('u1'), {
    kind: 'scenes', view: 'scene', scenes: [{ id: 'u1', mark: null }], marks: false,
    title: 'Untitled scene', eyebrow: 'Unplaced', addSceneTo: null,
  });
});

test('a Chapter with no Scenes is an empty Chapter', () => {
  assert.deepEqual(open('c3'), { kind: 'emptyChapter', chapterId: 'c3', title: 'Untitled chapter' });
});
