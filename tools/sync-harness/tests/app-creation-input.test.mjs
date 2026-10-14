// Typing while a Scene or an Entry is being created (fresh-stranger
// regression, 2026-10-14): creation takes a server round trip, and nothing
// typed in that gap may look accepted and then vanish, or land in the Scene
// above. The rules:
//   * a Scene's editor (and an Entry's name field) exists only once the server
//     has made it — there is never a writable stand-in;
//   * creation first lets go of any focused text surface (releaseTextEntry),
//     shows that it is working, and runs once per reach (a ref, not render state);
//   * an empty Chapter's "Start writing" line starts on a click or Enter/Space,
//     never on a typed letter (that letter would have nowhere to go);
//   * once made, the new Scene takes focus and saves through the ordinary
//     path (sync scenario nc1: its first words save, no conflict, one row).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readRepoFile } from '../lib/pg.mjs';
import { bundleForTest } from '../lib/bundle.mjs';

// Just enough DOM for the helper's instanceof checks.
class FakeElement { constructor() { this.blurred = false; this.kids = new Set(); } blur() { this.blurred = true; } contains(n) { return n === this || this.kids.has(n); } }
class FakeSelection { constructor(anchorNode) { this.anchorNode = anchorNode; this.rangeCount = anchorNode ? 1 : 0; } removeAllRanges() { this.rangeCount = 0; this.anchorNode = null; } }
class FakeHTMLElement extends FakeElement { constructor(editable = false) { super(); this.isContentEditable = editable; } }
class FakeTextArea extends FakeHTMLElement { constructor(o = {}) { super(); this.readOnly = !!o.readOnly; this.disabled = !!o.disabled; } }
class FakeInput extends FakeHTMLElement { constructor(type, o = {}) { super(); this.type = type; this.readOnly = !!o.readOnly; this.disabled = !!o.disabled; } }

let pending;
before(async () => {
  globalThis.HTMLElement = FakeHTMLElement;
  globalThis.HTMLTextAreaElement = FakeTextArea;
  globalThis.HTMLInputElement = FakeInput;
  pending = await bundleForTest('src/components/rune2/pendingCreation.ts', { name: 'creation_input_pending' });
});

test('creation lets go of a focused text surface, and of nothing else', () => {
  const editor = new FakeHTMLElement(true);
  const caret = { nodeType: 3, parentElement: { closest: () => null } }; editor.kids.add(caret);
  const sel = new FakeSelection(caret);
  assert.equal(pending.releaseTextEntry(editor, sel), true, 'a focused Scene editor (contenteditable) is released');
  assert.ok(editor.blurred);
  assert.equal(sel.rangeCount, 0, 'its caret is cleared too, so selection-based input cannot land in it');
  const plainText = { nodeType: 3, parentElement: { closest: () => null } };
  const elsewhere = new FakeSelection(plainText);
  pending.releaseTextEntry(new FakeHTMLElement(true), elsewhere);
  assert.equal(elsewhere.rangeCount, 1, 'a selection in ordinary page text is left alone');
  // A real click on "+ Scene": focus is on the button, but the caret is still
  // in the Scene above. Nothing is blurred; the stranded caret is cleared.
  const strandedCaret = { nodeType: 3, parentElement: { closest: (q) => (q.includes('contenteditable') ? {} : null) } };
  const stranded = new FakeSelection(strandedCaret);
  const control = new FakeHTMLElement(false);
  assert.equal(pending.releaseTextEntry(control, stranded), false, 'the control keeps focus');
  assert.equal(stranded.rangeCount, 0, 'a caret left in another editor is cleared');
  for (const field of [new FakeTextArea(), new FakeInput('text'), new FakeInput('search'), new FakeInput('number')]) {
    assert.equal(pending.releaseTextEntry(field, null), true, 'a writable field is released');
  }
  const button = new FakeHTMLElement(false);
  assert.equal(pending.releaseTextEntry(button, null), false, 'the "+ Scene" / "New entry" control keeps focus');
  assert.equal(button.blurred, false);
  assert.equal(pending.releaseTextEntry(new FakeInput('checkbox'), null), false, 'a checkbox is not text entry');
  assert.equal(pending.releaseTextEntry(new FakeTextArea({ readOnly: true }), null), false, 'a read-only field is left alone');
  assert.equal(pending.releaseTextEntry(null, null), false, 'nothing focused');
});

test('a Scene editor exists only for a Scene the server returned; a pending Scene has nothing writable', () => {
  const src = readRepoFile('src/components/rune2/Rune2Editor.tsx');
  assert.match(src, /item\.scene \? \(\s*<SceneBlock/, 'the editor block renders only with server Scene data');
  const pendingBlock = src.slice(src.indexOf('key={`pending:${item.id}`}'), src.indexOf('</section>', src.indexOf('key={`pending:${item.id}`}')));
  assert.ok(pendingBlock.length > 0, 'pending Scene section found');
  assert.doesNotMatch(pendingBlock, /EditorContent|contentEditable|<textarea|<input/, 'a pending Scene shows no writable surface');
  assert.match(src, /if \(!focusRequested \|\| !editor\) return;\s*editor\.chain\(\)\.focus\("start"/, 'the new Scene takes focus once its editor exists');
});

test('"+ Scene": one creation per reach, text focus released first, a visible pending state, a readable failure', () => {
  const src = readRepoFile('src/components/rune2/Rune2Content.tsx');
  const fn = src.slice(src.indexOf('function AddSceneAction'), src.indexOf('export function Rune2SelectionView'));
  assert.match(fn, /if \(creating\.current\) return;\s*creating\.current = true;/, 'a ref guards a double submit before `busy` renders');
  assert.ok(fn.indexOf('releaseTextEntry()') > -1 && fn.indexOf('releaseTextEntry()') < fn.indexOf('await createScene('), 'focus is released before the round trip');
  assert.match(fn, /Adding a scene…/, 'pending state is shown');
  assert.match(fn, /disabled=\{busy\}/, 'the control is disabled while creating');
  assert.match(fn, /Couldn’t add a scene\. Nothing was changed — try again\./, 'failure is human-readable');
  assert.match(fn, /requestSceneFocus\(r\.data\.id\)/, 'the new Scene is focused after creation');
  assert.match(fn, /creating\.current = false;/, 'the guard is released in finally');
});

test('an empty Chapter starts on a click or Enter/Space, never on a typed letter', () => {
  const src = readRepoFile('src/components/rune2/Rune2Writing.tsx');
  assert.doesNotMatch(src, /e\.key\.length === 1[^\n]*startChapter/, 'a printable key no longer starts (and swallows) the first Scene');
  assert.match(src, /if \(creating \|\| starting\.current\) return;\s*starting\.current = true;/, 'one first Scene per reach');
  assert.match(src, /creating \? "Starting…" : "Start writing"/, 'pending state is shown');
  assert.match(src, /Couldn’t start the chapter\. Nothing was changed — try again\./, 'failure is human-readable');
});

test('New entry: one creation per reach, text focus released first, a visible pending state', () => {
  const hook = readRepoFile('src/components/rune2/useNewEntry.ts');
  assert.match(hook, /if \(creating\.current\) return;\s*creating\.current = true;/, 'a ref guards a double submit');
  assert.ok(hook.indexOf('releaseTextEntry(from)') > -1 && hook.indexOf('releaseTextEntry(from)') < hook.indexOf('await createCollectionEntry('), 'focus is released before the round trip');
  const view = readRepoFile('src/components/rune2/CollectionView.tsx');
  assert.match(view, /busy \? "Adding entry…" : "New entry"/, 'the View\'s "New entry" shows it is working');
  assert.match(view, /busy \? "Adding an entry…" : notice/, 'the context bar\'s "+ Entry" shows it is working');
  const bodies = readRepoFile('src/components/rune2/CollectionViewBodies.tsx');
  assert.match(bodies, /busy \? "Adding entry…" : addNotice/, 'a Board lane\'s "New" shows it is working');
});
