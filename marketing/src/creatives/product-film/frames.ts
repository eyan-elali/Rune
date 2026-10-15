// The product film's storyboard: thirteen static keyframes, in order. Each
// names its beat; Keyframes.tsx draws it; PRODUCT_FILM_STORYBOARD.md directs
// it. Not timings — composition first, motion after approval.

export const KEYFRAMES = [
  { n: 1, id: "writing", title: "Writing" },
  { n: 2, id: "toward-structure", title: "Toward the navigator" },
  { n: 3, id: "the-book-grows", title: "The novel grows" },
  { n: 4, id: "back-to-revise", title: "Back to The Key Cabinet" },
  { n: 5, id: "the-pause", title: "The pause" },
  { n: 6, id: "revision-notes", title: "Revision Notes" },
  { n: 7, id: "inspector", title: "Inspector" },
  { n: 8, id: "reveal", title: "The connection — full window" },
  { n: 9, id: "research-page", title: "Research Page" },
  { n: 10, id: "collection", title: "Characters Collection" },
  { n: 11, id: "entry", title: "Collection Entry" },
  { n: 12, id: "canvas", title: "Canvas" },
  { n: 13, id: "return", title: "Back to the manuscript" },
  { n: 14, id: "brand", title: "Sutura" },
] as const;

export type KeyframeId = (typeof KEYFRAMES)[number]["id"];

/** The film's master format. */
export const FILM = { width: 1920, height: 1080 } as const;
