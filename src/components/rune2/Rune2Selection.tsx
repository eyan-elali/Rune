"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ProjectManuscript } from "@/lib/rune2/projectManuscript";
import { indexManuscript, type NavEntry } from "@/lib/rune2/navigatorModel";

// What the writer has selected in the project navigator, shared with the
// context bar and the content area. Client state only for now: the editor
// milestone decides whether selection becomes a route.
//
// Selection is held by id and resolved against the current manuscript, so a
// Scene moved to Unplaced stays selected, and a deleted object falls back to
// the Manuscript itself (null).

type Rune2SelectionValue = {
  manuscript: ProjectManuscript;
  index: Map<string, NavEntry>;
  /** The selected object, or null for the Manuscript as a whole. */
  selected: NavEntry | null;
  select: (id: string | null) => void;
};

const Rune2SelectionContext = createContext<Rune2SelectionValue | null>(null);

export function Rune2SelectionProvider({
  manuscript,
  children,
}: {
  manuscript: ProjectManuscript;
  children: ReactNode;
}) {
  const [selectedId, select] = useState<string | null>(null);
  const index = useMemo(() => indexManuscript(manuscript), [manuscript]);
  const selected = (selectedId && index.get(selectedId)) || null;

  const value = useMemo(
    () => ({ manuscript, index, selected, select }),
    [manuscript, index, selected]
  );
  return <Rune2SelectionContext.Provider value={value}>{children}</Rune2SelectionContext.Provider>;
}

export function useRune2Selection(): Rune2SelectionValue {
  const value = useContext(Rune2SelectionContext);
  if (!value) throw new Error("useRune2Selection must be used inside Rune2SelectionProvider");
  return value;
}
