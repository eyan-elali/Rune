// Reading Mode's one remembered display choice: whether its comments (Scene
// Revision Notes shown beside the text) are EXPANDED — compact cards in the
// right margin — or COLLAPSED to small margin markers. Kept on this device per
// writer: a way of looking, not a note, so it is never server state and never
// about the manuscript. Every access is guarded; without storage the reader
// starts expanded. The same choice serves the Reading Peek and Full Reading
// Mode, which are one reader.

const KEY = "rune:reading-comments:";

export type CommentsDisplay = "expanded" | "collapsed";

export const DEFAULT_COMMENTS_DISPLAY: CommentsDisplay = "expanded";

export function readCommentsDisplay(userId: string | undefined): CommentsDisplay {
  if (!userId) return DEFAULT_COMMENTS_DISPLAY;
  try {
    const v = window.localStorage.getItem(`${KEY}${userId}`);
    return v === "collapsed" ? "collapsed" : DEFAULT_COMMENTS_DISPLAY;
  } catch {
    return DEFAULT_COMMENTS_DISPLAY;
  }
}

export function writeCommentsDisplay(userId: string | undefined, display: CommentsDisplay): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(`${KEY}${userId}`, display);
  } catch {
    // Storage unavailable: the choice lives for the session only.
  }
}
