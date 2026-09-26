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
