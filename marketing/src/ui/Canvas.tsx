import type { CSSProperties } from "react";
import { AlignStartVertical, ImagePlus, Maximize, Minus, Plus, Redo2, Scan, Search, SquareDashed, Undo2 } from "lucide-react";
import { ICON } from "@/components/rune2/icons";
import { endpoints } from "@/components/rune2/CanvasConnections";

// A Canvas (components/rune2/CanvasSurface.tsx), drawn: the dotted ground
// that moves with the world, Sections in their own layer beneath, the
// connections' one SVG (CanvasConnections — the same endpoints, arrow marker
// and labels), the cards (CanvasCard: an object's eyebrow, title, meta and
// preview; a note's text), then the title and the quiet tools over the
// surface. Every class is the app's; the viewport (tx, ty, scale) is the
// creative's, the way a writer pans.

export type CanvasViewport = { tx: number; ty: number; scale: number };

export type CanvasSectionSpec = { id: string; x: number; y: number; width: number; height: number; title: string; count: number };
export type CanvasCardSpec =
  | { id: string; kind: "note"; x: number; y: number; width: number; height: number; text: string }
  | {
      id: string;
      kind: "scene" | "chapter" | "entry" | "page";
      x: number;
      y: number;
      width: number;
      height: number;
      eyebrow: string;
      title: string;
      meta?: string;
      preview?: string;
    };
export type CanvasLineSpec = { from: string; to: string; label?: string; directed?: boolean };

export function CanvasPage({
  title,
  sections,
  cards,
  lines,
  vp,
  hover,
  selected,
}: {
  title: string;
  sections: CanvasSectionSpec[];
  cards: CanvasCardSpec[];
  lines: CanvasLineSpec[];
  vp: CanvasViewport;
  /** The card the pointer is over (the app's hover ring). */
  hover?: string;
  /** The card that is selected (the app's accent hairline and halo). */
  selected?: string;
}) {
  const rect = new Map(cards.map((c) => [c.id, c]));
  const drawn = lines.flatMap((l) => {
    const a = rect.get(l.from);
    const b = rect.get(l.to);
    return a && b ? [{ ...l, ...endpoints(a, b) }] : [];
  });
  return (
    <div
      className="r2-canvas"
      role="application"
      aria-label={`${title} canvas`}
      style={{ backgroundSize: `${24 * vp.scale}px ${24 * vp.scale}px`, backgroundPosition: `${vp.tx}px ${vp.ty}px` }}
    >
      <div className="r2-canvas-world" style={{ transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.scale})` }}>
        {sections.map((s, z) => (
          <div
            key={s.id}
            className="r2-canvas-section"
            style={{ transform: `translate(${s.x}px, ${s.y}px)`, width: s.width, height: s.height, zIndex: z }}
            data-section
          >
            <div className="r2-canvas-section-head">
              <span className="r2-canvas-section-title">{s.title}</span>
              {s.count > 0 && <span className="r2-canvas-section-count">{s.count}</span>}
            </div>
          </div>
        ))}

        <svg className="r2-canvas-lines" aria-hidden>
          <defs>
            <marker id="r2-canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={9} markerHeight={9} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path d="M 1 1 L 9 5 L 1 9" />
            </marker>
          </defs>
          {drawn.map((l) => (
            <g key={`${l.from}-${l.to}`} className="r2-canvas-line" data-directed={l.directed || undefined}>
              <line className="r2-canvas-line-stroke" x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} markerEnd={l.directed ? "url(#r2-canvas-arrow)" : undefined} />
              {l.label && (
                <text className="r2-canvas-line-label" x={(l.from.x + l.to.x) / 2} y={(l.from.y + l.to.y) / 2} textAnchor="middle" dominantBaseline="central">
                  {l.label}
                </text>
              )}
            </g>
          ))}
        </svg>

        {cards.map((c, i) => {
          const style: CSSProperties = {
            transform: `translate(${c.x}px, ${c.y}px)`,
            width: c.width,
            height: c.height,
            zIndex: sections.length + i + 1,
            ...(hover === c.id ? { boxShadow: "0 0 0 1px var(--r2-border-strong), var(--r2-shadow-sm)" } : {}),
          };
          if (c.kind === "note")
            return (
              <div key={c.id} className="r2-canvas-card r2-canvas-card--note" style={style} role="group">
                <textarea className="r2-canvas-note" rows={1} readOnly tabIndex={-1} spellCheck={false} value={c.text} />
              </div>
            );
          return (
            <div key={c.id} className={`r2-canvas-card r2-canvas-card--${c.kind}`} style={style} role="group" data-selected={selected === c.id || undefined}>
              <p className="r2-canvas-card-eyebrow">{c.eyebrow}</p>
              <p className="r2-canvas-card-title">{c.title}</p>
              {c.meta && <p className="r2-canvas-card-meta">{c.meta}</p>}
              {c.preview && <p className="r2-canvas-card-preview">{c.preview}</p>}
            </div>
          );
        })}
      </div>

      <div className="r2-canvas-ui r2-canvas-head r2-page">
        <header className="r2-doc-head r2-page-head">
          <p className="r2-doc-eyebrow">Canvas</p>
          <textarea className="r2-page-title" rows={1} readOnly value={title} />
        </header>
      </div>

      <div className="r2-canvas-ui r2-canvas-tools" role="toolbar" aria-label="Canvas tools">
        <button type="button" tabIndex={-1} className="r2-action">
          <Plus {...ICON} aria-hidden />
          Add
        </button>
        <span className="r2-canvas-tools-group">
          {[ImagePlus, SquareDashed, AlignStartVertical, Search].map((Icon, i) => (
            <button key={i} type="button" tabIndex={-1} className="r2-icon-button">
              <Icon {...ICON} aria-hidden />
            </button>
          ))}
        </span>
        <span className="r2-canvas-tools-group">
          {[Undo2, Redo2].map((Icon, i) => (
            <button key={i} type="button" tabIndex={-1} className="r2-icon-button" disabled={i === 1}>
              <Icon {...ICON} aria-hidden />
            </button>
          ))}
        </span>
        <span className="r2-canvas-tools-group">
          <button type="button" tabIndex={-1} className="r2-icon-button">
            <Minus {...ICON} aria-hidden />
          </button>
          <button type="button" tabIndex={-1} className="r2-canvas-zoom">
            {`${Math.round(vp.scale * 100)}%`}
          </button>
          {[Plus, Scan, Maximize].map((Icon, i) => (
            <button key={i} type="button" tabIndex={-1} className="r2-icon-button" disabled={i === 1}>
              <Icon {...ICON} aria-hidden />
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
