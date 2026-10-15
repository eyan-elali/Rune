// Creative A — "Writing a book starts simple." The script, in seconds: every
// beat's timing lives here, so the edit can be retimed without touching the
// drawing. 15s at 30fps.

export const DURATION = 15;

export const CAPTIONS = {
  simple: { text: "Writing a book starts simple.", in: 0, out: 3.4 },
  suddenly: { text: "Then suddenly…", in: 3.5, out: 6.4 },
  // "center": the live site's own phrase (src/app/(front)/page.tsx — "keeps
  // your manuscript at the center"). The body copy elsewhere mixes US and UK
  // spellings; change this one word if the brand settles on "centre".
  centre: { text: "The manuscript stays at the center.", in: 6.55, out: 9.4 },
  around: { text: "Everything else grows around it.", in: 9.55, out: 11.95 },
} as const;

/** The writer at work in Chapter 1. */
export const WRITING = {
  typeAt: 1.65,
  seed: 1921,
  savingAt: 2.3,
  savedAt: 3.45,
};

/** The book growing, one thing at a time, through the navigator. */
export const GROWTH = {
  chapter2: 3.8,
  part: 4.2,
  unplaced: 4.62,
  workspace: 5.04,
  world: 5.4,
  research: 5.76,
  ending: 6.12,
  /** How long one arrival takes. */
  arrive: 0.42,
};

/** The manuscript and the Workspace told apart: the Workspace's rows step back. */
export const EMPHASIS = { in: 6.7, out: 9.05, dur: 0.5, ink: 0.36 };

/** Characters opened beside the Chapter, then the Chapter again. */
export const VISIT = {
  cursorIn: 9.5,
  atCharacters: 10.12,
  openCharacters: 10.26,
  leave: 11.0,
  atChapterTab: 11.42,
  backToChapter: 11.56,
  cursorOut: 11.8,
  /** The content's change of surface. */
  swap: 0.24,
};

/** The close. */
export const CLOSE = { shotOut: 12.0, shotDur: 0.5, endIn: 12.4 };
