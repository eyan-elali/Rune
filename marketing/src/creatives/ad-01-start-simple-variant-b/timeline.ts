// Variant B — the event grid, in seconds. The opening and the close are the
// Control's; the middle is the experiment: the book grows, three thoughts
// loosen from it, and once the page is still the writer puts them away.

export const T = {
  // ── 1 · ALMOST NOTHING (A: hook + Chapter 1) — identical to Control ─────
  type: 0.2,
  hookOut: 1.78,
  // ── 2 · WRITING (B: close on the prose) — identical to Control ──────────
  push: 1.55,
  pushDur: 0.95,
  // ── 3 · THE BOOK GROWS, AND GIVES THE WRITER THINGS TO KEEP ─────────────
  grow: 2.25,
  growDur: 2.3, // (REST ≈ 4.85)
  open: 2.32,
  openDur: 1.25,
  emergeDur: 0.8, // a thought loosening from the page and coming to rest beside it
  // ── 4 · THE PAGE IS STILL · THE THOUGHTS ARE PUT AWAY ───────────────────
  chromeBack: 0.12,
  organise: 0.3, // after rest: the first thought goes to its place…
  organiseGap: 0.3, // …then the next
  dockDur: 0.72,
  line2: 5.9, // "Build outward when the book asks for it."
  copyOut: 7.2,
  // ── 5 · RETURN TO WRITING (E) ───────────────────────────────────────────
  back: 7.15,
  backDur: 0.85,
  type2: 7.65,
  holdAfter: 0.34,
  // ── 6 · CTA (F) ─────────────────────────────────────────────────────────
  retreatDur: 0.8,
  brandHold: 1.2,
} as const;
