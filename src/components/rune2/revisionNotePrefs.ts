"use client";

import { useSyncExternalStore } from "react";

// Two session-only choices about how Revision Notes show — never saved, never
// about the notes themselves: whether resolved notes are shown (the panel and
// the reader's annotation layer alike), and whether the reader shows its
// annotation markers at all. One tiny store, so the panel and the reader
// agree without a provider.

type Prefs = { showResolved: boolean; annotations: boolean };

let prefs: Prefs = { showResolved: false, annotations: true };
const listeners = new Set<() => void>();

function set(next: Partial<Prefs>) {
  prefs = { ...prefs, ...next };
  for (const fn of listeners) fn();
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const get = () => prefs;

export function useRevisionNotePrefs(): Prefs & { setShowResolved: (v: boolean) => void; setAnnotations: (v: boolean) => void } {
  const current = useSyncExternalStore(subscribe, get, get);
  return {
    ...current,
    setShowResolved: (showResolved) => set({ showResolved }),
    setAnnotations: (annotations) => set({ annotations }),
  };
}
