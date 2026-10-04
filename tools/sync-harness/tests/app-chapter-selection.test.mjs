// Chapter-wide selection and copy (Pre-Beta Trust Audit, C/D/E): the model
// behind selecting a Chapter as one document when each Scene is its own
// editor (src/lib/rune2/chapterSelection.ts).
//
//   * ranges: ⌘A is the title and every Scene; a range from a point in one
//     Scene to a point in another covers the tail of the first, every Scene
//     between whole (an empty one included), and the head of the last, in
//     either direction
//   * clipboard text: title, then each Scene's selected prose in manuscript
//     order, paragraphs separated as ProseMirror separates them, Scenes by a
//     blank line, empty Scenes adding nothing; rich formatting keeps its words
//   * keys: ⌘A selects; ⌘C/⌘X copy (and never delete); Escape and the arrows
//     collapse; typing, Backspace, Delete, Enter and Tab are swallowed — a
//     Chapter selection can never become an edit across Scenes; other
//     shortcuts pass through
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bundleForTest } from '../lib/bundle.mjs';
import { editorDocument } from '../lib/tiptap-schema.mjs';

let m;
before(async () => {
  m = await bundleForTest('src/lib/rune2/chapterSelection.ts');
});

const p = (...texts) => ({
  type: 'doc',
  content: texts.map((t) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] })),
});
const docs = () => [
  editorDocument(p('One alpha.', 'One beta.')),
  editorDocument(p('')),
  editorDocument(p('Three alpha.')),
  editorDocument({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Four' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Bold ', marks: [] }, { type: 'text', text: 'word', marks: [{ type: 'bold' }] }, { type: 'text', text: '.' }] },
    ],
  }),
];
const sizes = (ds) => ds.map((d) => d.content.size);

test('⌘A: the whole Chapter — title and every Scene, first position to last', () => {
  const ds = docs();
  const all = m.wholeChapter(sizes(ds));
  assert.equal(all.title, true);
  assert.deepEqual(all.anchor, { index: 0, pos: 0 });
  assert.deepEqual(all.head, { index: 3, pos: ds[3].content.size });
  assert.deepEqual(m.sceneSpans(all, sizes(ds)), ds.map((d) => ({ from: 0, to: d.content.size })));
  assert.equal(m.spannedScenes(all), 4);
  // A single-Scene document.
  const one = m.wholeChapter([ds[0].content.size]);
  assert.deepEqual(m.sceneSpans(one, [ds[0].content.size]), [{ from: 0, to: ds[0].content.size }]);
  assert.equal(m.isCollapsed(one), false);
});

test('a drag from Scene 1 into Scene 3 covers its tail, the empty Scene whole, and the head of Scene 3 — either way round', () => {
  const ds = docs();
  const down = { anchor: { index: 0, pos: 5 }, head: { index: 2, pos: 7 }, title: false };
  assert.deepEqual(m.sceneSpans(down, sizes(ds)), [{ from: 5, to: ds[0].content.size }, { from: 0, to: 2 }, { from: 0, to: 7 }, null]);
  const up = { anchor: { index: 2, pos: 7 }, head: { index: 0, pos: 5 }, title: false };
  assert.deepEqual(m.sceneSpans(up, sizes(ds)), m.sceneSpans(down, sizes(ds)));
  assert.deepEqual(m.orderedEnds(up), { from: { index: 0, pos: 5 }, to: { index: 2, pos: 7 } });
  assert.equal(m.spannedScenes(up), 3);
  // Within one Scene, positions are clamped to its document.
  const inOne = { anchor: { index: 2, pos: 3 }, head: { index: 2, pos: 999 }, title: false };
  assert.deepEqual(m.sceneSpans(inOne, sizes(ds)), [null, null, { from: 3, to: ds[2].content.size }, null]);
  assert.equal(m.isCollapsed({ anchor: { index: 1, pos: 1 }, head: { index: 1, pos: 1 }, title: false }), true);
  assert.equal(m.isCollapsed({ anchor: { index: 1, pos: 1 }, head: { index: 1, pos: 1 }, title: true }), false);
});

test('clipboard text: title, Scenes in order, paragraphs and Scenes separated, empty Scenes silent, formatting kept as words', () => {
  const ds = docs();
  const all = m.wholeChapter(sizes(ds));
  const spans = m.sceneSpans(all, sizes(ds));
  const parts = ds.map((doc, i) => ({ doc, span: spans[i] }));
  assert.equal(
    m.chapterText('Chapter One', parts),
    'Chapter One\n\nOne alpha.\n\nOne beta.\n\nThree alpha.\n\nFour\n\nBold word.'
  );
  // Without the title, and a partial range: from inside "One beta." to inside "Three alpha."
  const partial = { anchor: { index: 0, pos: 17 }, head: { index: 2, pos: 6 }, title: false };
  const ps = m.sceneSpans(partial, sizes(ds));
  assert.equal(
    m.chapterText(null, ds.map((doc, i) => ({ doc, span: ps[i] })).filter((x) => x.span)),
    'beta.\n\nThree'
  );
  // Nothing selected but the title: the title alone.
  assert.equal(m.chapterText('T', [{ doc: ds[1], span: { from: 0, to: ds[1].content.size } }]), 'T');
});

test('keys: select-all, copy, collapse, swallow, pass — on macOS and elsewhere', () => {
  const k = (key, mods = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  assert.equal(m.chapterKeyAction(k('a', { metaKey: true }), true), 'select-all');
  assert.equal(m.chapterKeyAction(k('A', { metaKey: true }), true), 'select-all');
  assert.equal(m.chapterKeyAction(k('a', { ctrlKey: true }), false), 'select-all');
  assert.equal(m.chapterKeyAction(k('a', { ctrlKey: true }), true), 'pass', 'Ctrl+A on a Mac is not select-all');
  assert.equal(m.chapterKeyAction(k('a', { metaKey: true, shiftKey: true }), true), 'pass');
  assert.equal(m.chapterKeyAction(k('c', { metaKey: true }), true), 'copy');
  assert.equal(m.chapterKeyAction(k('x', { metaKey: true }), true), 'copy', '⌘X copies and never deletes');
  assert.equal(m.chapterKeyAction(k('Escape'), true), 'collapse');
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) assert.equal(m.chapterKeyAction(k(key), true), 'collapse', key);
  assert.equal(m.chapterKeyAction(k('ArrowDown', { shiftKey: true }), true), 'pass');
  for (const key of ['Backspace', 'Delete', 'Enter', 'Tab', 'x', ' ', 'é']) assert.equal(m.chapterKeyAction(k(key), true), 'swallow', key);
  for (const key of ['z', 'b', 'i']) assert.equal(m.chapterKeyAction(k(key, { metaKey: true }), true), 'pass', key);
  assert.equal(m.chapterKeyAction(k('Shift', { shiftKey: true }), true), 'pass');
  assert.equal(m.chapterKeyAction(k('F5'), true), 'pass');
});
