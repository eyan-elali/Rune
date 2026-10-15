// Creative A, 9:16 — "Chapter 1 was simple." The script, in seconds: every
// beat lives here, so the cut can be retimed without touching the drawing.
// 12s at 30fps.
//
//   1  0.0–1.5   Chapter 1 ends: the last words typed, the period lands.
//   2  1.5–4.0   The camera crosses to the navigator; the book accumulates.
//   3  4.0–5.2   Pull out: Manuscript and Workspace, settled.
//   4  5.2–6.8   Characters opens on its Board; the lanes run past the frame.
//   5  6.8–8.4   Back to the navigator, Story Map; across the Canvas.
//   6  8.4–10.0  Back to Chapter 1. No copy. The writer writes.
//   7  10.0–12.0 The close.

export const DURATION = 12;

export const CAPTIONS = [
  { text: "Chapter 1 was simple.", in: 0, out: 1.5 },
  { text: "Then came everything else.", in: 1.55, out: 4.0 },
  // "center": the live site's own spelling (src/app/(front)/page.tsx).
  { text: "Keep the manuscript at the center.", in: 4.05, out: 5.2 },
  { text: "Everything else grows around it.", in: 5.25, out: 8.35 },
] as const;

/** The copy's ground: the top of the frame is the copy's while there is copy. */
export const SCRIM = { out: 8.85, dur: 0.55 };

/** Shot 1: the last words of Chapter 1. */
export const ENDING = { typeAt: 0.3, seed: 1921, pace: 1.12 };

/** Shot 2: the cross to the navigator, and the book growing — slow, then faster. */
export const CROSS = { at: 1.36, dur: 0.56 };
export const GROWTH = [
  { key: "part", at: 2.02, dur: 0.42 },
  { key: "chapter2", at: 2.46, dur: 0.38 },
  { key: "chapter3", at: 2.82, dur: 0.34 },
  { key: "unplaced", at: 3.1, dur: 0.3 },
  { key: "characters", at: 3.33, dur: 0.27 },
  { key: "world", at: 3.5, dur: 0.24 },
  { key: "research", at: 3.64, dur: 0.22 },
  { key: "storyMap", at: 3.76, dur: 0.2 },
  { key: "ending", at: 3.86, dur: 0.2 },
] as const;
export type GrowthKey = (typeof GROWTH)[number]["key"];

/** Shot 3: the pull out, and the Workspace stepping back while the line is read. */
export const SETTLE = { at: 3.98, dur: 0.72, stepBack: { in: 4.3, out: 5.2, dur: 0.4, ink: 0.42 } };

/** Shot 4: Characters, on its Board. */
export const BOARD = {
  cursorIn: 5.12,
  atRow: 5.46,
  open: 5.56,
  pushAt: 5.6,
  pushDur: 0.55,
  /** The board's own scroll, px: the writer moving across its lanes. */
  scrollAt: 5.9,
  scrollDur: 1.4,
  scroll: 220,
};

/** Shot 5: the Story Map. */
export const MAP = {
  backAt: 6.72,
  backDur: 0.42,
  cursorFrom: 6.8,
  atRow: 7.08,
  open: 7.18,
  pushAt: 7.2,
  pushDur: 0.55,
  /** The writer's own pan across the Canvas. */
  panAt: 7.3,
  panDur: 1.35,
};

/** Shot 6: back to Chapter 1, and writing. */
export const RETURN = {
  backAt: 8.28,
  backDur: 0.42,
  cursorFrom: 8.36,
  atRow: 8.66,
  open: 8.76,
  cursorOut: 8.95,
  pushAt: 8.8,
  pushDur: 0.66,
  typeAt: 9.32,
  seed: 4127,
  pace: 1.05,
};

/** Shot 7: the close. */
export const CLOSE = { footageOut: 9.95, footageDur: 0.35, endIn: 10.25 };

/** How long the content takes to change surface on a click (r2-view-enter's dip). */
export const SWAP = 0.24;
