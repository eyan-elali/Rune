// Where a floating surface (a picker, a menu, a toolbar popover) goes, given
// the control it hangs from and the room the window leaves. One rule for every
// popover, so none of them can open off-screen or push the page sideways:
//
//   * vertically, the preferred side (below, by default); the other side when
//     the surface doesn't fit and the other side has more room; and, when
//     neither side fits, the roomier one with the surface's height capped to it
//   * horizontally, aligned to the control's start (or end); flipped to the
//     other alignment when that keeps it whole — a popover near the right
//     edge opens inward, leftward — then clamped inside the window; a surface
//     wider than the window is capped to it
//
// Pure: it reads nothing from the DOM, so it is tested directly.

export type FloatingSide = "bottom" | "top";
export type FloatingAlign = "start" | "end";

export type Rect = { left: number; top: number; right: number; bottom: number };

export type FloatingPlacement = {
  x: number;
  y: number;
  side: FloatingSide;
  align: FloatingAlign;
  /** Set when the surface is taller than the room on its side: cap it (and let it scroll). */
  maxHeight: number | null;
  /** Set when the surface is wider than the window: cap it. */
  maxWidth: number | null;
};

export function placeFloating({
  anchor,
  size,
  viewport,
  side = "bottom",
  align = "start",
  gap = 4,
  edge = 8,
  inset = 0,
}: {
  anchor: Rect;
  size: { width: number; height: number };
  viewport: { width: number; height: number };
  side?: FloatingSide;
  align?: FloatingAlign;
  /** Space between the control and the surface. */
  gap?: number;
  /** Space the surface keeps from the window's edges. */
  edge?: number;
  /** How far the surface's edge sits outside the control's (a picker lines its text up with the value's). */
  inset?: number;
}): FloatingPlacement {
  // Vertical: the room on each side.
  const below = viewport.height - edge - (anchor.bottom + gap);
  const above = anchor.top - gap - edge;
  let chosen: FloatingSide = side;
  const room = (s: FloatingSide) => (s === "bottom" ? below : above);
  const other: FloatingSide = side === "bottom" ? "top" : "bottom";
  if (size.height > room(side) && room(other) > room(side)) chosen = other;
  const available = Math.max(0, room(chosen));
  const height = Math.min(size.height, available);
  const maxHeight = size.height > available ? available : null;
  let y = chosen === "bottom" ? anchor.bottom + gap : anchor.top - gap - height;
  y = Math.max(edge, Math.min(y, viewport.height - edge - height));

  // Horizontal: start or end, whichever keeps it whole; then clamp.
  const span = viewport.width - 2 * edge;
  const width = Math.min(size.width, span);
  const maxWidth = size.width > span ? Math.max(0, span) : null;
  const at = (a: FloatingAlign) => (a === "start" ? anchor.left - inset : anchor.right + inset - width);
  // How far an alignment would stick out of the window (0: it fits).
  const overflow = (x: number) => Math.max(0, edge - x) + Math.max(0, x + width - (viewport.width - edge));
  const flipped: FloatingAlign = align === "start" ? "end" : "start";
  const chosenAlign: FloatingAlign = overflow(at(flipped)) < overflow(at(align)) ? flipped : align;
  const x = Math.max(edge, Math.min(at(chosenAlign), viewport.width - edge - width));

  return { x, y, side: chosen, align: chosenAlign, maxHeight, maxWidth };
}

/** The anchor rect for a menu opened at a point (a right click, or a control's corner). */
export function pointRect(x: number, y: number): Rect {
  return { left: x, top: y, right: x, bottom: y };
}
