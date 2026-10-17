// Performance Ad #1 — the event grid, in seconds. One clock; every value on
// screen is a function of it. ~11.2s: the hook lands at once, the growth is
// the middle, the writing is the end.

export const T = {
  // ── 1 · ALMOST NOTHING (composition A: hook + Chapter 1) ────────────────
  type: 0.2, // the writer types the clause's last words at a natural pace (ends ≈ 2.1)
  hookOut: 1.78, // the hook is gone by here (a 0.32s fade)
  // ── 2 · WRITING (B: close on the prose) ─────────────────────────────────
  push: 1.55,
  pushDur: 0.95,
  // ── 3 · THE BOOK GROWS (C: the spine) ───────────────────────────────────
  grow: 2.25, // time compresses: the stream runs (inertia; rest ≈ 5.3)
  growDur: 2.45,
  open: 2.32, // the camera opens from the prose to the spine…
  openDur: 1.25,
  line1: 3.3, // "Start simple."
  // (REST is computed in stream.ts: grow + growDur·0.86 + drift)
  // ── 4–5 · SUBSTANTIAL · THE WORKSPACE, NOTICED (D) ──────────────────────
  chromeBack: 0.12, // after rest: the writer reaches for the interface (the pointer is off-frame)
  line2: 5.2, // "Build outward when the book asks for it."
  copyOut: 7.0,
  // ── 6 · RETURN TO WRITING (E) ───────────────────────────────────────────
  back: 6.95,
  backDur: 0.85,
  type2: 7.45,
  holdAfter: 0.34, // the caret holds after the last key, then the retreat
  // ── 7 · CTA (F) ─────────────────────────────────────────────────────────
  retreatDur: 0.8,
  brandHold: 1.2,
} as const;
