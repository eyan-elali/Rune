// The film's event grid, in seconds (MOTION_LANGUAGE_EXPLORATION.md §6, §9).
// Five continuous sequences on one clock. Every major event is here, so the
// pacing reads as a table: compressed where months pass, slow where the
// writer thinks, deliberate where an object changes representation, quiet
// where the writer returns to prose. (Pass 4: ~39s — rhythm over runtime.)

/** Pass 6: the tighter Canvas trail is given exactly 7 frames more, so it is no faster on screen and everything after it moves by whole frames. */
const TRAIL = 7 / 30;

export const T = {
  // ── 1 · THE BOOK GROWS ──────────────────────────────────────────────────
  type: 0.12, // the line's last words, typed — seen from a medium-wide: a writing environment, the manuscript at its centre
  push: 0.0, // the camera is already entering the writing as the writer types…
  pushDur: 1.25, // …and is close on the prose by ~1.0s
  grow: 2.22, // (the writer types at normal speed until ~2.1, close on the prose) months compressed: the camera opens to the structure as time starts (growth.tsx: inertia, drift, rest ≈ 4.99)
  growDur: 2.5,
  climb: 5.36, // after ~0.35s of complete stillness the hand returns (the chrome with it) and climbs back to Part I
  revise: 6.1, // click: The Key Cabinet
  toPause: 6.24, // a horizontal move to the writer's view of the Scene
  toPauseDur: 0.9,

  // ── 2 · THE WRITER THINKS ───────────────────────────────────────────────
  tick1: 7.34, // the caret returns on each tick; the Scene steps down
  tick2: 8.04, // 0.70s after the first: a little more hesitation
  hum: 8.59, // ~0.4s of quiet after the tick's sound: a real "mm" — a person, thinking (audible onset)
  humDur: 0.62, // the real voice (src/audio/voice-mmh.wav): audible from T.hum, the voice gone ~0.45s later, its breath ~0.6s
  reachNotes: 9.51, // ~0.3s of quiet after the voice has gone: then the hand moves
  notes: 9.95, // click: Revision Notes (the panel opens at product speed)
  echo: 10.33, // one shared anchor tone: the line and its quotation
  reachInsp: 10.85,
  insp: 11.11, // click: the Inspector (ordinary)
  scroll: 11.29, // the writer scrolls the panel to Research
  scrollDur: 0.55,
  reachLink: 11.61,
  hoverLink: 11.97,
  lean: 11.65, // attention narrows toward the link

  // ── 3 · THE WORLD OPENS ─────────────────────────────────────────────────
  ledger: 12.23, // ⌘-click: Research → 1998 Guest Ledger
  // (identity expansion: offsets in seq3.tsx; the camera arrives wide at ledger + 2.12)
  intoPage: 14.93, // back into the product: the Page, read
  intoPageDur: 0.9,
  read1: 15.39, // the pointer finds 23:40, T.V.
  readAside: 15.85, // …the contradiction
  read2: 16.29, // …and Elias "in seventeen"
  outToWide: 16.61,
  outDur: 0.82,
  characters: 17.47, // click: Characters

  // ── 4 · THE WORKSPACE BECOMES THE THINKING SPACE ────────────────────────
  toMissing: 17.69,
  toMissingDur: 1.05,
  reachCard: 17.95,
  hoverCard: 18.5,
  closeIn: 18.39,
  elias: 18.77, // click: Elias Vale's card (object expansion)
  // the Entry read: "Dad gave him the key" → Thomas Vale → the navigator (offsets in seq4.tsx)
  canvas: 21.69, // click: The Night of the Fire (representation transformation, ~4.5s; then the wide holds)
  dive: 27.14, // after the wide hold: one push into the 1998 row, then one paper trail to "Plant it"
  diveDur: 2.75 + TRAIL,

  // ── 5 · BACK TO THE BOOK ────────────────────────────────────────────────
  pointer: 29.64 + TRAIL, // the hand finds "Plant it" — the conclusion registers — then goes to the Scene card beside it
  toScene: 30.24 + TRAIL,
  open: 30.79 + TRAIL, // click: the Scene card
  morph: 30.85 + TRAIL,
  morphDur: 1.12,
  still: 31.97 + TRAIL, // the caret, still
  typing: 32.25 + TRAIL, // the writer types
  // (typing ends ≈ 34.4: computed from its schedule)
  away: 0.25, // after the last key: the retreat begins
  brandHold: 2.15, // the title lingers
};
