"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_COMMENTS_DISPLAY,
  readCommentsDisplay,
  writeCommentsDisplay,
  type CommentsDisplay,
} from "@/lib/rune2/readingCommentPrefs";

// Two choices about how Revision Notes show — never saved with the notes,
// never about the notes themselves: whether resolved notes are shown (the
// panel and the reader's comments alike; session only), and whether the
// reader's comments are expanded to cards or collapsed to markers (kept on
// the device per writer, readingCommentPrefs). One tiny store, so the panel
// and the reader — the Peek and Full Reading Mode are one reader — agree
// without a provider.

type Prefs = { showResolved: boolean; comments: CommentsDisplay };

let prefs: Prefs = { showResolved: false, comments: DEFAULT_COMMENTS_DISPLAY };
let readFor: string | undefined;
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

export function useRevisionNotePrefs(userId?: string): Prefs & {
  setShowResolved: (v: boolean) => void;
  setComments: (v: CommentsDisplay) => void;
} {
  // The writer's remembered display, read once the writer is known.
  useEffect(() => {
    if (!userId || userId === readFor) return;
    readFor = userId;
    const remembered = readCommentsDisplay(userId);
    if (remembered !== prefs.comments) set({ comments: remembered });
  }, [userId]);
  const current = useSyncExternalStore(subscribe, get, get);
  return {
    ...current,
    setShowResolved: (showResolved) => set({ showResolved }),
    setComments: (comments) => {
      set({ comments });
      writeCommentsDisplay(readFor, comments);
    },
  };
}
