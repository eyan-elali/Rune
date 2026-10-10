// The landing header's hide/reveal decision, as a pure fold over the scroll
// position (FrontHeader reads it; front.css "Header" draws it). The same
// model as the Opius landing header (opiuslabs: header-scroll-intent.ts):
//
//   · at the top of the page the header is FLAT — part of the hero, only
//     type on the page's tone (y within HERO_FLAT_ZONE);
//   · a little further the row is still shown but takes its FLOATING
//     material — the pill — because the hero's copy is about to pass under
//     it (up to SCROLL_TOP_REVEAL the header can never hide);
//   · past that, down hides and up reveals, each only once the scroll has
//     travelled SCROLL_INTENT_THRESHOLD in that direction. A change of
//     direction resets the travel: that is the dead zone that keeps a
//     trackpad's wiggle, or momentum settling, from toggling the header.
//
// No timer and no grace window: one scroll event, one step.

/** How far (px) a scroll travels in one direction before the header reacts. */
export const SCROLL_INTENT_THRESHOLD = 14;

/** Up to here the header is always shown, so it never vanishes over the hero's top. */
export const SCROLL_TOP_REVEAL = 80;

/** Up to here the header is flat, part of the hero; past it, the floating pill. */
export const HERO_FLAT_ZONE = 56;

export interface HeaderScrollState {
  /** The scroll position the last step saw. */
  y: number;
  /** Travel accumulated in the current direction; a direction change resets it. */
  travel: number;
  hidden: boolean;
  /** The floating pill (below the hero) rather than the flat, full-width row. */
  floating: boolean;
}

/** The state for a page that starts, or reloads, at `y`: shown, material by position. */
export function initialHeaderScrollState(y: number): HeaderScrollState {
  return { y, travel: 0, hidden: false, floating: y > HERO_FLAT_ZONE };
}

/** One scroll event: the position is now `y`. */
export function advanceHeaderScrollState(state: HeaderScrollState, y: number): HeaderScrollState {
  const floating = y > HERO_FLAT_ZONE;
  const delta = y - state.y;
  if (delta === 0) return { ...state, y, floating };

  if (y <= SCROLL_TOP_REVEAL) return { y, travel: 0, hidden: false, floating };

  const travel = delta > 0 !== state.travel > 0 ? delta : state.travel + delta;
  const hidden = travel > SCROLL_INTENT_THRESHOLD ? true : travel < -SCROLL_INTENT_THRESHOLD ? false : state.hidden;
  return { y, travel, hidden, floating };
}
