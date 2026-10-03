// The Workspace draft store (lib/rune2/workspaceDrafts.ts, IndexedDB
// "rune-workspace") — BC-B: what one writer holds unsent on a device
// (pages/entries, Revision Note changes, Canvas changes) is counted truthfully
// and per writer, and a draft whose object is gone for good (a saver's
// 'unavailable') is kept, listed, copyable as text and discardable only by
// its writer — never dropped on the writer's behalf. Real module over
// fake-indexeddb; nothing here reaches a server.
import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bundleForTest } from '../lib/bundle.mjs';

const ME = 'writer-1';
const OTHER = 'writer-2';
const PROJECT = 'project-1';
const doc = (...paragraphs) => ({ type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) });
const noteItem = (id, text) => ({ id, canvas_id: 'cv', project_id: PROJECT, item_type: 'note', content: doc(text), x: 0, y: 0, width: 200, height: 60, z: 1, version: 2 });

let drafts;
before(async () => {
  drafts = await bundleForTest('src/lib/rune2/workspaceDrafts.ts', { name: 'bcb_workspace_drafts' });
});

test('unsent work is counted per writer: dirty pages and entries, note changes, non-empty canvas drafts', async () => {
  await drafts.putPageDraft({ id: 'p1', userId: ME, projectId: PROJECT, content: doc('kept'), baseVersion: 1, dirty: true, savedAt: 1 });
  await drafts.putPageDraft({ id: 'p2', userId: ME, projectId: PROJECT, content: doc('clean'), baseVersion: 1, dirty: false, savedAt: 1 });
  await drafts.putPageDraft({ id: 'e1', userId: ME, projectId: PROJECT, content: doc('entry'), baseVersion: 3, dirty: true, savedAt: 1 }, 'entry');
  await drafts.putPageDraft({ id: 'p9', userId: OTHER, projectId: PROJECT, content: doc('theirs'), baseVersion: 1, dirty: true, savedAt: 1 });
  await drafts.putNoteChange({ noteId: 'n1', userId: ME, projectId: PROJECT, kind: 'create', targetType: 'scene', targetId: 's', body: 'note', baseVersion: 0, queuedAt: 't', state: 'pending', remote: null, rev: 1 });
  await drafts.putNoteChange({ noteId: 'n2', userId: OTHER, projectId: PROJECT, kind: 'create', targetType: 'scene', targetId: 's', body: 'note', baseVersion: 0, queuedAt: 't', state: 'pending', remote: null, rev: 1 });
  await drafts.putCanvasDraft({ canvasId: 'c1', userId: ME, projectId: PROJECT, savedAt: 1, entries: [{ id: 'i1', kind: 'item', op: 'update', fields: ['x'], item: noteItem('i1', 'moved') }] });
  await drafts.putCanvasDraft({ canvasId: 'c2', userId: ME, projectId: PROJECT, savedAt: 1, entries: [] }); // empty: cleared, not counted
  assert.deepEqual(await drafts.countUnsentWorkspaceWork(ME), { documents: 2, notes: 1, canvases: 1 });
  assert.deepEqual(await drafts.countUnsentWorkspaceWork(OTHER), { documents: 1, notes: 1, canvases: 0 });
  assert.deepEqual(await drafts.countUnsentWorkspaceWork('nobody'), { documents: 0, notes: 0, canvases: 0 });
});

test('a stranded draft (its object gone for good) is kept and listed with its text; only a dirty one, only for its writer; the saver persisting again clears the mark', async () => {
  assert.deepEqual(await drafts.listStrandedDrafts(ME), []);
  await drafts.markPageDraftUnavailable('p1', 'page');
  await drafts.markPageDraftUnavailable('p2', 'page'); // clean: nothing unsent, not marked
  await drafts.markPageDraftUnavailable('e1', 'entry');
  await drafts.markPageDraftUnavailable('missing', 'page'); // no such draft: nothing happens
  const mine = await drafts.listStrandedDrafts(ME);
  assert.deepEqual(mine.map((d) => [d.kind, d.id, d.words]).sort(), [['entry', 'e1', 1], ['page', 'p1', 1]]);
  assert.deepEqual(await drafts.listStrandedDrafts(OTHER), [], 'another writer sees nothing of it');
  assert.equal(await drafts.getStrandedDraftText('page', 'p1', ME), 'kept');
  assert.equal(await drafts.getStrandedDraftText('page', 'p1', OTHER), null);
  assert.equal(await drafts.countUnsentWorkspaceWork(ME).then((c) => c.documents), 2, 'still counted as unsent');

  // The saver persists again (the object turned out reachable): the mark goes.
  await drafts.putPageDraft({ id: 'p1', userId: ME, projectId: PROJECT, content: doc('kept', 'more'), baseVersion: 1, dirty: true, savedAt: 2 });
  assert.deepEqual((await drafts.listStrandedDrafts(ME)).map((d) => d.id), ['e1']);
  assert.equal((await drafts.getPageDraft('p1', ME)).unavailable, undefined);
});

test('a stranded Canvas draft offers its note texts (and only drafts with note text); discarding is the writer\'s, and only of a stranded draft', async () => {
  await drafts.putCanvasDraft({
    canvasId: 'c3', userId: ME, projectId: PROJECT, savedAt: 5,
    entries: [
      { id: 'n1', kind: 'item', op: 'create', fields: [], item: noteItem('n1', 'one idea') },
      { id: 'n2', kind: 'item', op: 'update', fields: ['content'], item: noteItem('n2', 'another, longer idea') },
      { id: 'n3', kind: 'item', op: 'delete', fields: [], item: null },
      { id: 'k1', kind: 'connection', op: 'create', fields: [], item: { id: 'k1', source_item_id: 'n1', target_item_id: 'n2', version: 0 } },
    ],
  });
  await drafts.markCanvasDraftUnavailable('c3');
  await drafts.markCanvasDraftUnavailable('c1'); // geometry only: marked, but offers no words, so not listed
  const listed = await drafts.listStrandedDrafts(ME);
  assert.deepEqual(listed.map((d) => [d.kind, d.id, d.notes, d.words]), [['canvas', 'c3', 2, 5], ['entry', 'e1', 0, 1]]);
  assert.equal(await drafts.getStrandedDraftText('canvas', 'c3', ME), 'one idea\n\nanother, longer idea');

  assert.equal(await drafts.discardStrandedDraft('page', 'p1', ME), false, 'not stranded: never discarded this way');
  assert.equal(await drafts.discardStrandedDraft('canvas', 'c3', OTHER), false, 'not theirs');
  assert.equal(await drafts.discardStrandedDraft('canvas', 'c3', ME), true);
  assert.equal(await drafts.discardStrandedDraft('entry', 'e1', ME), true);
  assert.deepEqual(await drafts.listStrandedDrafts(ME), []);
  assert.equal(await drafts.getCanvasDraft('c3', ME), null);
  assert.equal(await drafts.getPageDraft('p1', ME).then((d) => d?.dirty), true, 'the live draft is untouched');
});
