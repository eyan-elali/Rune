// The Rune 2.0 working set (src/lib/rune2/workingSet.ts): tabs over canonical
// object ids — normal navigation vs. an explicit new tab, no duplicates,
// closing, and tabs whose object is gone.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bundleForTest } from '../lib/bundle.mjs';

let ws;
before(async () => {
  ws = await bundleForTest('src/lib/rune2/workingSet.ts', { name: 'rune2_working_set' });
});

const state = (tabs, active) => ({ tabs, active });

test('normal navigation replaces the active tab\'s object, or goes to the tab already showing it', () => {
  assert.deepEqual(ws.navigateTab(state(['a', 'b'], 'a'), 'c'), state(['c', 'b'], 'c'));
  assert.deepEqual(ws.navigateTab(state(['a', 'b'], 'a'), 'b'), state(['a', 'b'], 'b'), 'no duplicate: b\'s tab activates');
  const same = state(['a'], 'a');
  assert.equal(ws.navigateTab(same, 'a'), same, 'no change is the same state');
});

test('open in new tab: inserted after the active tab, never duplicated', () => {
  assert.deepEqual(ws.openTab(state(['a', 'b'], 'a'), 'c'), state(['a', 'c', 'b'], 'c'));
  assert.deepEqual(ws.openTab(state(['a', 'b'], 'a'), 'b'), state(['a', 'b'], 'b'));
});

test('closing: the active tab hands over to its right neighbour, else its left; never zero tabs', () => {
  assert.deepEqual(ws.closeTab(state(['a', 'b', 'c'], 'b'), 'b'), state(['a', 'c'], 'c'));
  assert.deepEqual(ws.closeTab(state(['a', 'b', 'c'], 'c'), 'c'), state(['a', 'b'], 'b'));
  assert.deepEqual(ws.closeTab(state(['a', 'b', 'c'], 'c'), 'a'), state(['b', 'c'], 'c'), 'an inactive tab closes quietly');
  assert.deepEqual(ws.closeTab(state(['a'], 'a'), 'a'), state([ws.MANUSCRIPT_TAB], ws.MANUSCRIPT_TAB));
});

test('a tab whose object is gone disappears, and a neighbour takes over if it was active', () => {
  const has = (k) => k !== 'gone';
  const s = state(['a', 'b'], 'b');
  assert.equal(ws.resolveTabs(s, has), s, 'nothing gone: the same state');
  assert.deepEqual(ws.resolveTabs(state(['a', 'gone', 'b'], 'a'), has), state(['a', 'b'], 'a'));
  assert.deepEqual(ws.resolveTabs(state(['a', 'gone', 'b'], 'gone'), has), state(['a', 'b'], 'b'));
  assert.deepEqual(ws.resolveTabs(state(['a', 'gone'], 'gone'), has), state(['a'], 'a'));
  assert.deepEqual(ws.resolveTabs(state(['gone'], 'gone'), has), state([ws.MANUSCRIPT_TAB], ws.MANUSCRIPT_TAB));
});

// Reliability pass (2026-10-12): reopening a Project where the writer left
// off (resumeLocation.ts → resumedTabs). Per Project: each Project's record
// is read separately, so A → B → A returns to A's own last place.
test('resume: the remembered tabs and active object come back', () => {
  const has = (k) => ['root:manuscript', 'scene-4', 'page-1', 'coll-1'].includes(k);
  assert.deepEqual(ws.resumedTabs(state(['root:manuscript', 'scene-4', 'coll-1'], 'scene-4'), has), state(['root:manuscript', 'scene-4', 'coll-1'], 'scene-4'));
  assert.deepEqual(ws.resumedTabs(state(['page-1'], 'page-1'), has), state(['page-1'], 'page-1'), 'a Workspace Page alone');
});

test('resume: a remembered object that is gone falls back to the Manuscript overview', () => {
  const has = (k) => ['root:manuscript', 'page-1'].includes(k);
  assert.deepEqual(ws.resumedTabs(state(['scene-4', 'page-1'], 'scene-4'), has), state(['root:manuscript', 'page-1'], 'root:manuscript'), 'deleted active Scene: overview, surviving tab kept');
  assert.deepEqual(ws.resumedTabs(state(['scene-4'], 'scene-4'), has), state(['root:manuscript'], 'root:manuscript'));
});

test('resume: nothing usable remembered → null (the Project opens as usual)', () => {
  const has = () => true;
  for (const bad of [null, undefined, 'x', 42, {}, { tabs: 'a', active: 'a' }, { tabs: [], active: 7 }]) {
    assert.equal(ws.resumedTabs(bad, has), null, JSON.stringify(bad));
  }
});

test('resume: malformed or oversized records are cleaned, never trusted', () => {
  const has = (k) => k !== 'gone';
  const many = Array.from({ length: 40 }, (_, i) => `t${i}`);
  const r = ws.resumedTabs({ tabs: [...many, 7, 'gone', 't1'], active: 't39' }, has);
  assert.ok(r.tabs.length <= ws.RESUME_TAB_LIMIT, 'capped');
  assert.equal(r.active, 't39', 'the active object is always among the tabs');
  assert.ok(r.tabs.includes('t39'));
  assert.equal(new Set(r.tabs).size, r.tabs.length, 'no duplicates');
  assert.ok(!r.tabs.includes('gone'));
});
