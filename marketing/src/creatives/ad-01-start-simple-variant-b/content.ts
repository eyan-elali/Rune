import { FLAT_A, PART_ONE, PART_TWO, WORKSPACE } from "../ad-01-start-simple/content";

// Variant B — the same book as the Control (ad-01-start-simple/content.ts),
// read-only; this file adds only what the variant needs: which rows arrive
// during the lapse (no Workspace: that is the variant's point), and the
// three thought-objects that loosen from the writing and find their place.

export { CHAPTERS_ONE, CHAPTERS_TWO, FLAT_A, FLAT_A_PROSE, LAST, MANUSCRIPT_WORDS, OPEN, PART_ONE, PART_TWO, PEN_NAME, PROJECT, RETURN_TYPED, SEGMENTS, UNPLACED, WORKSPACE } from "../ad-01-start-simple/content";

/**
 * Rows that arrive with the writing front (stream.ts: arrivalTimes). The
 * Manuscript only. The Upright's Scenes stay folded (a disclosure the writer
 * left closed) so the spine fits the phone's clear zone at a larger scale.
 */
export const ARRIVALS: readonly [id: string, segment: number, at: number][] = [
  [PART_ONE.id, 1, -0.07],
  ["c-flores", 1, 0],
  ["c-upright", 2, -0.03],
  ["c-lia", 3, 0],
  ["c-hall", 4, 0],
  ["unplaced", 4, 0.68],
  [PART_TWO.id, 5, -0.08],
  ["c-second", 5, 0],
  ["s-amelia", 5, 0.04],
  [FLAT_A.id, 6, 0],
  ["s-tea", 6, 0.3],
  ["c-beats", 6, 0.44],
  ["c-viola", 6, 0.58],
  ["c-equal", 6, 0.74],
];

/**
 * The thought-objects: what the book gave the writer to keep track of. Each
 * is one real Workspace object (a Page) — the eyebrow is what the writer
 * would call it, the title is the Page's title, the row is where it lives.
 * They loosen from the writing while a given passage is being written
 * (segment, fraction) and are put away, in order, once the page is still.
 */
export type Thought = { id: string; kind: string; title: string; folder?: { id: string; title: string }; segment: number; at: number };
export const THOUGHTS: readonly Thought[] = [
  { id: "p-rui", kind: "Character", title: "Rui Carvalho", folder: { id: "f-characters", title: WORKSPACE.characters.title }, segment: 2, at: 0.1 },
  { id: WORKSPACE.pitch.id, kind: "Research", title: WORKSPACE.pitch.title, folder: { id: WORKSPACE.research.id, title: WORKSPACE.research.title }, segment: 4, at: 0.2 },
  { id: "p-question", kind: "Note", title: "Why has he kept the A flat?", segment: 6, at: 0.1 },
];
