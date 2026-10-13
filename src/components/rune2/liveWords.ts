"use client";

import { useSyncExternalStore } from "react";

// The live word count of every Scene with an open editor, as the editors
// themselves report it (Rune2Editor's per-Scene report — the same number the
// document status shows). A read-only mirror for surfaces outside the
// editors' subtree (the Widgets board): it is written from the report the
// editor already makes and never touches an editor, a save or the queue.
// A Scene whose editor closes is removed, so its stored count stands again.

type Snapshot = { version: number; words: ReadonlyMap<string, number> };

const words = new Map<string, number>();
let snapshot: Snapshot = { version: 0, words };
const listeners = new Set<() => void>();

export function reportLiveWords(sceneId: string, count: number | null): void {
  if (count === null) {
    if (!words.delete(sceneId)) return;
  } else {
    if (words.get(sceneId) === count) return;
    words.set(sceneId, count);
  }
  snapshot = { version: snapshot.version + 1, words };
  for (const fn of listeners) fn();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const get = () => snapshot;

/** Every open Scene's live words, by Scene id. Re-renders as any of them changes. */
export function useLiveWords(): ReadonlyMap<string, number> {
  return useSyncExternalStore(subscribe, get, get).words;
}
