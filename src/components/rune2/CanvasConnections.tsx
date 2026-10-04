"use client";

import { memo, type PointerEvent as ReactPointerEvent } from "react";
import type { Point, Rect } from "@/lib/rune2/canvas";
import type { CanvasConnection } from "@/lib/types";

// The connections of a Canvas (Milestone 22B): one SVG in world units,
// beneath the cards, drawing a quiet line (or an arrow) from the edge of
// one placement to the edge of another, with its label at the midpoint.
// Each is hit through a wide invisible stroke so it can be selected,
// opened (its label) and removed like anything else on the board. A
// connection never means anything to the book: it is this board's own
// line between two of its cards.

export type ConnectionLine = { connection: CanvasConnection; from: Point; to: Point };

/** Where a line from the centre of `a` to the centre of `b` leaves `a` and enters `b`. */
export function endpoints(a: Rect, b: Rect): { from: Point; to: Point } {
  const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  return { from: edgePoint(a, ca, cb), to: edgePoint(b, cb, ca) };
}

/** The point where the ray from `center` (inside `rect`) toward `toward` crosses the rect's edge. */
export function edgePoint(rect: Rect, center: Point, toward: Point): Point {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: center.x + dx * t, y: center.y + dy * t };
}

const ARROW = 9;

export const CanvasConnections = memo(function CanvasConnections({
  lines,
  selected,
  draft,
  onPointerDown,
  onDoubleClick,
}: {
  lines: ConnectionLine[];
  selected: string | null;
  /** A connection being drawn: from a card's edge to the pointer. */
  draft: { from: Point; to: Point } | null;
  onPointerDown: (id: string, e: ReactPointerEvent<SVGElement>) => void;
  onDoubleClick: (id: string) => void;
}) {
  return (
    <svg className="r2-canvas-lines" aria-hidden>
      <defs>
        <marker id="r2-canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={ARROW} markerHeight={ARROW} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M 1 1 L 9 5 L 1 9" />
        </marker>
      </defs>
      {lines.map(({ connection: c, from, to }) => {
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const isSelected = selected === c.id;
        return (
          <g key={c.id} className="r2-canvas-line" data-selected={isSelected || undefined} data-directed={c.directed || undefined}>
            <line className="r2-canvas-line-hit" x1={from.x} y1={from.y} x2={to.x} y2={to.y} onPointerDown={(e) => onPointerDown(c.id, e)} onDoubleClick={() => onDoubleClick(c.id)} />
            <line className="r2-canvas-line-stroke" x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={c.directed ? "url(#r2-canvas-arrow)" : undefined} />
            {c.label && (
              <text className="r2-canvas-line-label" x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" onPointerDown={(e) => onPointerDown(c.id, e)} onDoubleClick={() => onDoubleClick(c.id)}>
                {c.label}
              </text>
            )}
          </g>
        );
      })}
      {draft && <line className="r2-canvas-line-draft" x1={draft.from.x} y1={draft.from.y} x2={draft.to.x} y2={draft.to.y} />}
    </svg>
  );
});
