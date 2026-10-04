import { boundsOf, type Rect } from "./canvas";

// Canvas arrangement (Milestone 22B) — the pure geometry of tidying a board:
// aligning and distributing a selection, a restrained "tidy", and the quiet
// alignment guides a drag or a resize snaps to. Every function takes rects
// and returns new positions; nothing here knows what a rect shows, so none of
// it can touch the Scene, Page or Entry behind a card.

export type Positioned = { id: string; rect: Rect };
export type Placement = Map<string, { x: number; y: number }>;

export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";
export type DistributeMode = "horizontal" | "vertical";

export type ArrangeAction =
  | { kind: "align"; mode: AlignMode; label: string }
  | { kind: "distribute"; mode: DistributeMode; label: string }
  | { kind: "tidy"; label: string }
  | { kind: "connect"; label: string };

/**
 * What "Arrange the selection" offers for a selection of `count` placements,
 * `cards` of which are cards (not Sections): align needs two, distribute
 * three, tidy two, connect exactly two cards. One rule for the toolbar
 * button's enabled state and the menu's items, so neither can disagree.
 */
export function arrangeActions(count: number, cards: number): ArrangeAction[] {
  const out: ArrangeAction[] = [];
  if (count >= 2) {
    out.push(
      { kind: "align", mode: "left", label: "Align left" },
      { kind: "align", mode: "centerX", label: "Align centre" },
      { kind: "align", mode: "right", label: "Align right" },
      { kind: "align", mode: "top", label: "Align top" },
      { kind: "align", mode: "centerY", label: "Align middle" },
      { kind: "align", mode: "bottom", label: "Align bottom" }
    );
  }
  if (count >= 3) {
    out.push({ kind: "distribute", mode: "horizontal", label: "Distribute horizontally" }, { kind: "distribute", mode: "vertical", label: "Distribute vertically" });
  }
  if (count >= 2) out.push({ kind: "tidy", label: "Tidy" });
  if (count === 2 && cards === 2) out.push({ kind: "connect", label: "Connect" });
  return out;
}

/** The selection aligned on one edge or axis of its own bounds. */
export function align(items: readonly Positioned[], mode: AlignMode): Placement {
  const out: Placement = new Map();
  const b = boundsOf(items.map((i) => i.rect));
  if (!b || items.length < 2) return out;
  for (const { id, rect } of items) {
    let x = rect.x;
    let y = rect.y;
    switch (mode) {
      case "left":
        x = b.x;
        break;
      case "centerX":
        x = b.x + b.width / 2 - rect.width / 2;
        break;
      case "right":
        x = b.x + b.width - rect.width;
        break;
      case "top":
        y = b.y;
        break;
      case "centerY":
        y = b.y + b.height / 2 - rect.height / 2;
        break;
      case "bottom":
        y = b.y + b.height - rect.height;
        break;
    }
    out.set(id, { x: round(x), y: round(y) });
  }
  return out;
}

/**
 * The selection spread evenly along one axis: the first and last stay, the
 * gaps between neighbours become equal (by edges, so cards of different
 * sizes read as evenly spaced). Three or more; order is the current order.
 */
export function distribute(items: readonly Positioned[], mode: DistributeMode): Placement {
  const out: Placement = new Map();
  if (items.length < 3) return out;
  const h = mode === "horizontal";
  const sorted = [...items].sort((a, b) => (h ? a.rect.x - b.rect.x : a.rect.y - b.rect.y));
  const first = sorted[0].rect;
  const last = sorted[sorted.length - 1].rect;
  const span = h ? last.x + last.width - first.x : last.y + last.height - first.y;
  const total = sorted.reduce((n, i) => n + (h ? i.rect.width : i.rect.height), 0);
  const gap = (span - total) / (sorted.length - 1);
  let at = h ? first.x : first.y;
  for (const { id, rect } of sorted) {
    out.set(id, h ? { x: round(at), y: rect.y } : { x: rect.x, y: round(at) });
    at += (h ? rect.width : rect.height) + gap;
  }
  return out;
}

export const TIDY_GAP = 24;

/**
 * A restrained tidy: the selection kept where it is (its top-left corner
 * stays), its cards laid in rows in their current reading order — by the
 * row they already sit in (cards whose vertical extents overlap), left to
 * right — with even gaps, wrapping at the selection's present width. Nothing
 * is re-thought: a messy cluster becomes the same cluster, straightened.
 */
export function tidy(items: readonly Positioned[], gap = TIDY_GAP): Placement {
  const out: Placement = new Map();
  const b = boundsOf(items.map((i) => i.rect));
  if (!b || items.length < 2) return out;
  // Rows by overlapping vertical extent, in order of their top.
  const byTop = [...items].sort((p, q) => p.rect.y - q.rect.y || p.rect.x - q.rect.x);
  const rows: Positioned[][] = [];
  for (const item of byTop) {
    const row = rows[rows.length - 1];
    const last = row?.[row.length - 1];
    if (row && last && item.rect.y < rowBottom(row)) row.push(item);
    else rows.push([item]);
  }
  const ordered = rows.flatMap((row) => row.sort((p, q) => p.rect.x - q.rect.x));
  // A row that already reads as one row stays one row, even if even gaps make it a little wider than the cluster was.
  const rowWidth = (row: Positioned[]) => row.reduce((n, i) => n + i.rect.width, 0) + gap * (row.length - 1);
  const maxWidth = Math.max(b.width, ...rows.map(rowWidth));
  let x = b.x;
  let y = b.y;
  let rowHeight = 0;
  for (const { id, rect } of ordered) {
    if (x > b.x && x + rect.width > b.x + maxWidth) {
      x = b.x;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    out.set(id, { x: round(x), y: round(y) });
    x += rect.width + gap;
    rowHeight = Math.max(rowHeight, rect.height);
  }
  return out;
}

function rowBottom(row: Positioned[]): number {
  return Math.max(...row.map((i) => i.rect.y + i.rect.height));
}

// ── Guides and snapping ─────────────────────────────────────────────────────

export type Guide = { axis: "x" | "y"; at: number; from: number; to: number };

export type Snap = { dx: number; dy: number; guides: Guide[] };

const NO_SNAP: Snap = { dx: 0, dy: 0, guides: [] };

/** The three x (or y) lines of a rect: its two edges and its centre. */
function lines(rect: Rect, axis: "x" | "y"): number[] {
  return axis === "x" ? [rect.x, rect.x + rect.width / 2, rect.x + rect.width] : [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

/**
 * Where a moving rect would snap: the smallest nudge (within `threshold`,
 * world units) that puts one of its edges or its centre on an edge or centre
 * of another rect — one per axis — and the guide lines to show. Gentle: a
 * threshold of a few screen pixels, so free placement stays free.
 */
export function snapRect(moving: Rect, others: readonly Rect[], threshold: number): Snap {
  if (others.length === 0 || threshold <= 0) return NO_SNAP;
  const result: Snap = { dx: 0, dy: 0, guides: [] };
  for (const axis of ["x", "y"] as const) {
    let best: { delta: number; at: number; other: Rect } | null = null;
    const mine = lines(moving, axis);
    for (const other of others) {
      for (const at of lines(other, axis)) {
        for (const m of mine) {
          const delta = at - m;
          if (Math.abs(delta) > threshold) continue;
          if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, at, other };
        }
      }
    }
    if (!best) continue;
    if (axis === "x") result.dx = best.delta;
    else result.dy = best.delta;
    const snapped = axis === "x" ? { ...moving, x: moving.x + best.delta } : { ...moving, y: moving.y + best.delta };
    const span = axis === "x" ? [snapped.y, snapped.y + snapped.height, best.other.y, best.other.y + best.other.height] : [snapped.x, snapped.x + snapped.width, best.other.x, best.other.x + best.other.width];
    result.guides.push({ axis, at: best.at, from: Math.min(...span), to: Math.max(...span) });
  }
  return result;
}

/**
 * Where the edge being dragged in a resize would snap: the right (or bottom)
 * edge only, since the other corner is fixed.
 */
export function snapEdge(edge: number, axis: "x" | "y", others: readonly Rect[], threshold: number, extent: [number, number]): { delta: number; guide: Guide } | null {
  let best: { delta: number; at: number; other: Rect } | null = null;
  for (const other of others) {
    for (const at of lines(other, axis)) {
      const delta = at - edge;
      if (Math.abs(delta) > threshold) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, at, other };
    }
  }
  if (!best) return null;
  const span = axis === "x" ? [extent[0], extent[1], best.other.y, best.other.y + best.other.height] : [extent[0], extent[1], best.other.x, best.other.x + best.other.width];
  return { delta: best.delta, guide: { axis, at: best.at, from: Math.min(...span), to: Math.max(...span) } };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
