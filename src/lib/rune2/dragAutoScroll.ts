// Drag auto-scroll (Milestone 18): while the writer drags something through
// a long scrolling list — the navigator's Scenes, Chapters, Groups or
// Workspace items — and holds the pointer near the list's top or bottom edge,
// the list scrolls that way: slowly at the edge of the zone, faster the
// closer the pointer is to the edge (and fastest just beyond it), so Chapter
// 1 can be dragged to Chapter 30 without letting go. It scrolls only the one
// list it is given — never the page — and stops the moment the pointer leaves
// the zone, the list can go no further, or the drag ends.
//
// Pure of the DOM: the controller is handed how to read the list's box and
// scroll it, and how to schedule frames, so the same code runs in the
// navigator (useDragAutoScroll) and under test with a fake clock. It never
// decides where anything is dropped: the rows' own drag-over handlers keep
// doing that as the list moves under the pointer.

export type AutoScrollOptions = {
  /** How deep the zone is inside each edge, in px. */
  edge: number;
  /** How far beyond the edge the pointer still counts (at full speed), in px. */
  overshoot: number;
  /** Top speed, in px per frame. */
  maxSpeed: number;
  /** Speed at the inner edge of the zone, in px per frame. */
  minSpeed: number;
};

export const AUTO_SCROLL_DEFAULTS: AutoScrollOptions = { edge: 56, overshoot: 80, maxSpeed: 22, minSpeed: 2 };

/** Reduced motion: the list still scrolls (a drag must reach far rows) but gently, with no surge. */
export const AUTO_SCROLL_REDUCED: AutoScrollOptions = { edge: 56, overshoot: 80, maxSpeed: 10, minSpeed: 4 };

/**
 * The scroll step for a pointer at `y` over a list spanning `top`..`bottom`:
 * negative scrolls up, positive down, 0 outside the zones. Grows with
 * nearness to the edge (quadratically, so it starts gently); at or beyond the
 * edge (up to `overshoot`) it is `maxSpeed`. A list too short for two zones
 * splits itself in half.
 */
export function autoScrollSpeed(
  y: number,
  box: { top: number; bottom: number },
  options: AutoScrollOptions = AUTO_SCROLL_DEFAULTS
): number {
  const height = box.bottom - box.top;
  if (height <= 0) return 0;
  const edge = Math.min(options.edge, height / 2);
  const step = (depth: number) => {
    // depth: how far inside the zone's inner boundary toward the edge, 0..1.
    const t = Math.max(0, Math.min(1, depth));
    return Math.round(options.minSpeed + (options.maxSpeed - options.minSpeed) * t * t);
  };
  if (y < box.top - options.overshoot || y > box.bottom + options.overshoot) return 0;
  if (y < box.top + edge) return -step((box.top + edge - y) / edge);
  if (y > box.bottom - edge) return step((y - (box.bottom - edge)) / edge);
  return 0;
}

export type AutoScrollTarget = {
  /** The list's visible box, in the pointer's coordinates. */
  box: () => { top: number; bottom: number };
  /** Its current scroll offset and how far it can go. */
  scrollTop: () => number;
  maxScrollTop: () => number;
  /** Scrolls the list (and only the list) by `dy`. */
  scrollBy: (dy: number) => void;
};

export type FrameScheduler = {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

export type AutoScrollController = {
  /** The pointer is at `y` during a drag: scroll if it is in a zone, stop if not. */
  update: (y: number) => void;
  /** The drag ended (dropped, cancelled, or the pointer left the window). */
  stop: () => void;
  /** Whether it is scrolling now. */
  active: () => boolean;
};

export function createAutoScroll(
  target: AutoScrollTarget,
  frames: FrameScheduler,
  options: AutoScrollOptions = AUTO_SCROLL_DEFAULTS
): AutoScrollController {
  let y: number | null = null;
  let handle: number | null = null;

  const halt = () => {
    if (handle !== null) frames.cancel(handle);
    handle = null;
  };

  const tick = () => {
    handle = null;
    if (y === null) return;
    const speed = autoScrollSpeed(y, target.box(), options);
    const top = target.scrollTop();
    const room = speed < 0 ? top : target.maxScrollTop() - top;
    // Out of the zone, or nowhere further to go: stop until the pointer moves again.
    if (speed === 0 || room <= 0) return;
    target.scrollBy(speed < 0 ? -Math.min(-speed, room) : Math.min(speed, room));
    handle = frames.request(tick);
  };

  return {
    update(next) {
      y = next;
      if (handle === null) tick();
    },
    stop() {
      y = null;
      halt();
    },
    active: () => handle !== null,
  };
}
