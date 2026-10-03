// The Rune 2.0 working set: which objects are open in tabs, and which tab is
// active. Pure rules over tab keys (canonical object ids, or MANUSCRIPT_TAB);
// the shell keeps the state (components/rune2/Rune2Selection.tsx). A key is
// any canonical id, so Workspace objects can join later unchanged. An object
// is open in at most one tab, and there is always at least one tab.

/** The tab key of the Manuscript itself (its overview). Every other key is an object id. */
export const MANUSCRIPT_TAB = "root:manuscript";

export type TabState = { tabs: string[]; active: string };

/**
 * The tabs as they stand against the current manuscript: tabs whose object is
 * gone are dropped, and if the active one was among them, its nearest
 * surviving neighbour (right, then left) is active instead. Never empty.
 */
export function resolveTabs(state: TabState, has: (key: string) => boolean): TabState {
  const tabs = state.tabs.filter(has);
  if (has(state.active)) return tabs.length === state.tabs.length ? state : { tabs, active: state.active };
  const at = state.tabs.indexOf(state.active);
  const right = state.tabs.slice(at + 1).find(has);
  const left = state.tabs.slice(0, Math.max(at, 0)).reverse().find(has);
  const active = right ?? left;
  return active ? { tabs, active } : { tabs: [MANUSCRIPT_TAB], active: MANUSCRIPT_TAB };
}

/** Normal navigation: the active tab shows `key` — unless `key` has a tab already, which becomes active. */
export function navigateTab(state: TabState, key: string): TabState {
  if (state.tabs.includes(key)) return state.active === key ? state : { ...state, active: key };
  return { tabs: state.tabs.map((k) => (k === state.active ? key : k)), active: key };
}

/** "Open in new tab": a tab for `key` after the active one — unless it has one already. */
export function openTab(state: TabState, key: string): TabState {
  if (state.tabs.includes(key)) return state.active === key ? state : { ...state, active: key };
  const tabs = [...state.tabs];
  tabs.splice(tabs.indexOf(state.active) + 1, 0, key);
  return { tabs, active: key };
}

/**
 * The tab strip's "+" (Open another): a tab for `key` at the end of the
 * strip, the others kept — unless it has a tab already, which becomes
 * active (an object is open in at most one tab).
 */
export function appendTab(state: TabState, key: string): TabState {
  if (state.tabs.includes(key)) return state.active === key ? state : { ...state, active: key };
  return { tabs: [...state.tabs, key], active: key };
}

/** Closes `key`'s tab; closing the active tab activates the one to its right, else its left. */
export function closeTab(state: TabState, key: string): TabState {
  const at = state.tabs.indexOf(key);
  if (at === -1) return state;
  const tabs = state.tabs.filter((k) => k !== key);
  if (tabs.length === 0) return { tabs: [MANUSCRIPT_TAB], active: MANUSCRIPT_TAB };
  if (state.active !== key) return { tabs, active: state.active };
  return { tabs, active: tabs[Math.min(at, tabs.length - 1)] };
}

/**
 * Removes the tabs of objects that no longer belong in the working set (moved
 * to Trash) — from the state itself, not only from what resolveTabs shows, so
 * a later restore never brings a tab back. An active tab among them hands its
 * place to a neighbour, as closing it would.
 */
export function forgetTabs(state: TabState, keys: readonly string[]): TabState {
  return keys.reduce((s, key) => (s.tabs.includes(key) ? closeTab(s, key) : s), state);
}
