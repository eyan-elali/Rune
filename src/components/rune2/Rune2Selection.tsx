"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ProjectManuscript } from "@/lib/rune2/projectManuscript";
import { indexManuscript, type NavEntry } from "@/lib/rune2/navigatorModel";

// What the writer has selected in the project navigator, shared with the
// context bar and the content area. Client state only for now: the editor
// milestone decides whether selection becomes a route.
//
// Selection is held by id and resolved against the current manuscript, so a
// Scene moved to Unplaced stays selected, and a deleted object falls back to
// the Manuscript itself (null).
//
// Also shared here, because actions outside the navigator change it: which
// navigator rows are open, and a request to focus a Scene's prose once its
// editor appears (a Scene just created from the writing surface).

type Rune2SelectionValue = {
  manuscript: ProjectManuscript;
  index: Map<string, NavEntry>;
  /** The selected object, or null for the Manuscript as a whole. */
  selected: NavEntry | null;
  select: (id: string | null) => void;
  /**
   * Selects an object as soon as the manuscript contains it — for one just
   * created, before the manuscript is re-read — so the selection never
   * falls back to the Manuscript in between.
   */
  selectWhenPresent: (id: string) => void;
  /** Open navigator rows (Groups, Chapters, sections) — UI state only. */
  open: Record<string, boolean>;
  setOpenFor: (ids: string[], value: boolean) => void;
  /** A Scene whose prose should take focus when its editor appears. */
  focusSceneId: string | null;
  requestSceneFocus: (id: string | null) => void;
};

const Rune2SelectionContext = createContext<Rune2SelectionValue | null>(null);

export function Rune2SelectionProvider({
  manuscript,
  children,
}: {
  manuscript: ProjectManuscript;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [awaitedId, setAwaitedId] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [focusSceneId, requestSceneFocus] = useState<string | null>(null);
  const index = useMemo(() => indexManuscript(manuscript), [manuscript]);

  // Adjusted during render (not in an effect) so the awaited object is
  // selected in the same render that first contains it.
  if (awaitedId && index.has(awaitedId)) {
    setSelectedId(awaitedId);
    setAwaitedId(null);
  }
  const selected = (selectedId && index.get(selectedId)) || null;

  const select = useCallback((id: string | null) => {
    setAwaitedId(null);
    requestSceneFocus(null);
    setSelectedId(id);
  }, []);
  const selectWhenPresent = useCallback((id: string) => setAwaitedId(id), []);
  const setOpenFor = useCallback(
    (ids: string[], value: boolean) =>
      setOpen((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, value])) })),
    []
  );

  const value = useMemo(
    () => ({
      manuscript,
      index,
      selected,
      select,
      selectWhenPresent,
      open,
      setOpenFor,
      focusSceneId,
      requestSceneFocus,
    }),
    [manuscript, index, selected, select, selectWhenPresent, open, setOpenFor, focusSceneId]
  );
  return <Rune2SelectionContext.Provider value={value}>{children}</Rune2SelectionContext.Provider>;
}

export function useRune2Selection(): Rune2SelectionValue {
  const value = useContext(Rune2SelectionContext);
  if (!value) throw new Error("useRune2Selection must be used inside Rune2SelectionProvider");
  return value;
}
