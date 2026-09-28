"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ProjectManuscript } from "@/lib/rune2/projectManuscript";
import type { ProjectWorkspace } from "@/lib/rune2/projectWorkspace";
import { indexManuscript, indexWorkspace, isSelectable, type NavEntry } from "@/lib/rune2/navigatorModel";
import {
  closeTab as closeTabIn,
  MANUSCRIPT_TAB,
  navigateTab,
  openTab,
  resolveTabs,
  type TabState,
} from "@/lib/rune2/workingSet";

// The Rune 2.0 shell's client state, shared by the navigator, the tabs, the
// context bar, the content area and the right-hand panel. Session-local: none
// of it is persisted, and none of it copies manuscript state.
//
// The working set: a few open tabs, each naming one canonical object by id (or
// the Manuscript itself). The selection *is* the active tab — there is no
// second selection to keep in step — and every tab resolves against the
// current manuscript, so a renamed object's tab is renamed, a Scene moved to
// Unplaced keeps its tab, and a tab whose object is gone disappears, handing
// its place to a neighbour. Normal navigation replaces the active tab's
// object; only an explicit "open in new tab" adds a tab. An object is open in
// at most one tab: opening it again goes to that tab. Workspace Pages are
// objects like any other here: one index holds the Manuscript's objects and
// the Workspace's, keyed by canonical id — Collections and their Entries
// included, so an Entry is one tab however it was opened. Workspace Folders
// are in the index too (the navigator and item paths use them) but are
// navigation only: never selected, never a tab.
//
// Also shared here, because actions outside the navigator change them: which
// navigator rows are open, a request to focus a Scene's prose once its editor
// appears (a Scene just created from the writing surface), titles renamed but
// not yet re-read, which view the right-hand panel shows, whether the
// navigator is retracted, and whether Project Search is open.

export { MANUSCRIPT_TAB };

export type PanelView = "notes" | "inspector";

export type WorkingTab = {
  key: string;
  /** The tab's object, or null for the Manuscript. */
  entry: NavEntry | null;
};

type Rune2SelectionValue = {
  manuscript: ProjectManuscript;
  workspace: ProjectWorkspace;
  index: Map<string, NavEntry>;
  /** The selected object (the active tab's), or null for the Manuscript as a whole. */
  selected: NavEntry | null;
  /** Opens an object (null: the Manuscript) in the active tab — or goes to its tab. */
  select: (id: string | null) => void;
  /** Opens an object in a tab of its own, after the active one — or goes to its tab. */
  openInNewTab: (id: string | null) => void;
  /**
   * Selects an object as soon as the manuscript contains it — for one just
   * created, before the manuscript is re-read — so the selection never
   * falls back in between.
   */
  selectWhenPresent: (id: string) => void;
  tabs: WorkingTab[];
  activeTab: string;
  activateTab: (key: string) => void;
  closeTab: (key: string) => void;
  /** Open navigator rows (Groups, Chapters, sections) — UI state only. */
  open: Record<string, boolean>;
  setOpenFor: (ids: string[], value: boolean) => void;
  /** A Scene whose prose should take focus when its editor appears. */
  focusSceneId: string | null;
  requestSceneFocus: (id: string | null) => void;
  /** Shows a title at once, until the manuscript is re-read. */
  setRenamedTitle: (id: string, title: string) => void;
  /** Whether the navigator is retracted — presentation state only. */
  navCollapsed: boolean;
  toggleNav: () => void;
  /** The one right-hand panel's view, or null when it is closed. */
  panel: PanelView | null;
  /** Opens the panel on a view, switches it, or — for the view showing — closes it. */
  togglePanel: (view: PanelView) => void;
  closePanel: () => void;
  /** Whether Project Search is open — presentation state only. */
  searchOpen: boolean;
  setSearchOpen: (open: boolean | ((open: boolean) => boolean)) => void;
};

const Rune2SelectionContext = createContext<Rune2SelectionValue | null>(null);

export function Rune2SelectionProvider({
  manuscript,
  workspace,
  children,
}: {
  manuscript: ProjectManuscript;
  workspace: ProjectWorkspace;
  children: ReactNode;
}) {
  const [tabState, setTabState] = useState<TabState>({ tabs: [MANUSCRIPT_TAB], active: MANUSCRIPT_TAB });
  const [awaitedId, setAwaitedId] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [focusSceneId, requestSceneFocus] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelView | null>(null);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Titles renamed but not yet re-read; a fresh read supersedes them.
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const [read, setRead] = useState({ manuscript, workspace });
  if (read.manuscript !== manuscript || read.workspace !== workspace) {
    setRead({ manuscript, workspace });
    setRenamed({});
  }

  const index = useMemo(
    () => new Map([...indexManuscript(manuscript, renamed), ...indexWorkspace(workspace.tree, renamed, workspace.entries)]),
    [manuscript, workspace, renamed]
  );
  const has = useCallback(
    (key: string) => {
      if (key === MANUSCRIPT_TAB) return true;
      const entry = index.get(key);
      return entry !== undefined && isSelectable(entry);
    },
    [index]
  );

  // Adjusted during render (not in an effect) so the awaited object is
  // selected in the same render that first contains it.
  if (awaitedId && has(awaitedId)) {
    setAwaitedId(null);
    setTabState((prev) => navigateTab(resolveTabs(prev, has), awaitedId));
  }

  const resolved = resolveTabs(tabState, has);
  const selected = resolved.active === MANUSCRIPT_TAB ? null : (index.get(resolved.active) ?? null);

  const select = useCallback(
    (id: string | null) => {
      if (id !== null && !has(id)) return;
      setAwaitedId(null);
      requestSceneFocus(null);
      setTabState((prev) => navigateTab(resolveTabs(prev, has), id ?? MANUSCRIPT_TAB));
    },
    [has]
  );
  const openInNewTab = useCallback(
    (id: string | null) => {
      if (id !== null && !has(id)) return;
      setAwaitedId(null);
      requestSceneFocus(null);
      setTabState((prev) => openTab(resolveTabs(prev, has), id ?? MANUSCRIPT_TAB));
    },
    [has]
  );
  const activateTab = useCallback(
    (key: string) => {
      requestSceneFocus(null);
      setTabState((prev) => navigateTab(resolveTabs(prev, has), key));
    },
    [has]
  );
  const closeTab = useCallback(
    (key: string) => setTabState((prev) => closeTabIn(resolveTabs(prev, has), key)),
    [has]
  );
  const selectWhenPresent = useCallback((id: string) => setAwaitedId(id), []);
  const setOpenFor = useCallback(
    (ids: string[], value: boolean) =>
      setOpen((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, value])) })),
    []
  );
  const setRenamedTitle = useCallback(
    (id: string, title: string) => setRenamed((prev) => ({ ...prev, [id]: title })),
    []
  );
  const toggleNav = useCallback(() => setNavCollapsed((v) => !v), []);
  const togglePanel = useCallback((view: PanelView) => setPanel((prev) => (prev === view ? null : view)), []);
  const closePanel = useCallback(() => setPanel(null), []);

  const tabs = useMemo(
    () => resolved.tabs.map((key) => ({ key, entry: key === MANUSCRIPT_TAB ? null : (index.get(key) ?? null) })),
    [resolved.tabs, index]
  );

  const value = useMemo(
    () => ({
      manuscript,
      workspace,
      index,
      selected,
      select,
      openInNewTab,
      selectWhenPresent,
      tabs,
      activeTab: resolved.active,
      activateTab,
      closeTab,
      open,
      setOpenFor,
      focusSceneId,
      requestSceneFocus,
      setRenamedTitle,
      navCollapsed,
      toggleNav,
      panel,
      togglePanel,
      closePanel,
      searchOpen,
      setSearchOpen,
    }),
    [
      manuscript,
      workspace,
      index,
      selected,
      select,
      openInNewTab,
      selectWhenPresent,
      tabs,
      resolved.active,
      activateTab,
      closeTab,
      open,
      setOpenFor,
      focusSceneId,
      setRenamedTitle,
      navCollapsed,
      toggleNav,
      panel,
      togglePanel,
      closePanel,
      searchOpen,
    ]
  );
  return <Rune2SelectionContext.Provider value={value}>{children}</Rune2SelectionContext.Provider>;
}

export function useRune2Selection(): Rune2SelectionValue {
  const value = useContext(Rune2SelectionContext);
  if (!value) throw new Error("useRune2Selection must be used inside Rune2SelectionProvider");
  return value;
}
