import type { CSSProperties } from "react";
import { CHAPTER, SCENE } from "./shell";

// The Canvas page's drawing: the product's own plane (CanvasSurface,
// CanvasCard, CanvasSection, CanvasConnections; rune2.css: "Canvas") — the
// content tone with the faintest dot grid, two Sections' tinted regions,
// the book's pieces as compact cards raised a hair off the plane (Scenes
// with their prose preview in the manuscript's type, Pages, Entries, a note
// on the plane's paper), the fine lines between them, two carrying a label,
// and the quiet title at the corner. Wide, and mostly empty: a canvas is
// room to think in, and the room is the point. The cards are the product's
// classes; only their placement is this drawing's: percentages of the
// stage, each card centred on its point; a tablet keeps the same places
// and leaves out the pieces marked for the wide stage alone (wideOnly), so
// the plane stays open; a phone has a narrower arrangement of three, read
// by the stylesheet from the same custom properties the landing uses
// (--lp-x/y/w, --lp-mx/my/mw).

type Point = { x: number; y: number; w: number };
type Item = {
  id: string;
  kind: "scene" | "page" | "entry" | "note";
  eyebrow?: string;
  title?: string;
  meta?: string;
  text?: string;
  selected?: boolean;
  /** Only on the wide stage: left out on a tablet, where the plane has less room. */
  wideOnly?: boolean;
  wide: Point;
  narrow?: Point;
};

const ITEMS: Item[] = [
  { id: "ferry", kind: "scene", eyebrow: `Scene · ${CHAPTER}`, title: "The Ferry", meta: "1,934 words", wide: { x: 17, y: 29, w: 184 } },
  {
    id: "boat",
    kind: "scene",
    eyebrow: `Scene · ${CHAPTER}`,
    title: SCENE,
    meta: "1,412 words",
    text: "The letters came on the Thursday boat, three of them, tied with the grey string her mother had always used.",
    selected: true,
    wide: { x: 17, y: 55, w: 212 },
    narrow: { x: 34, y: 26, w: 168 },
  },
  { id: "high", kind: "scene", eyebrow: `Scene · ${CHAPTER}`, title: "High Water", meta: "318 words", wide: { x: 17, y: 81, w: 168 } },
  { id: "ada", kind: "entry", eyebrow: "Characters", title: "Ada Marsh", wide: { x: 46, y: 54, w: 156 }, narrow: { x: 72, y: 60, w: 112 } },
  { id: "tomas", kind: "entry", eyebrow: "Characters", title: "Tomas Reyes", wideOnly: true, wide: { x: 46, y: 25, w: 156 } },
  { id: "house", kind: "page", eyebrow: "Page · Places", title: "The house", wide: { x: 60, y: 78, w: 156 }, narrow: { x: 30, y: 78, w: 112 } },
  { id: "letters", kind: "page", eyebrow: "Page", title: "Why the letters wait", wide: { x: 70, y: 28, w: 180 } },
  { id: "note", kind: "note", text: "Why does she wait a whole day to open them? What is she afraid the second letter says?", wideOnly: true, wide: { x: 88, y: 42, w: 200 } },
  { id: "ferries", kind: "page", eyebrow: "Page · Research", title: "The island ferries", wideOnly: true, wide: { x: 77, y: 85, w: 156 } },
  { id: "fifties", kind: "page", eyebrow: "Page · Research", title: "Letters, 1950s", wideOnly: true, wide: { x: 91, y: 85, w: 150 } },
];

const SECTIONS: ReadonlyArray<{ title: string; count: number; x: number; y: number; w: number; h: number; wideOnly?: boolean }> = [
  { title: CHAPTER, count: 3, x: 4, y: 14, w: 26, h: 80 },
  { title: "Research", count: 2, x: 70, y: 74, w: 28, h: 22, wideOnly: true },
];

const LINES: ReadonlyArray<{ from: string; to: string; label?: string; narrow?: boolean }> = [
  { from: "boat", to: "ada", label: "point of view", narrow: true },
  { from: "boat", to: "house", narrow: true },
  { from: "high", to: "house" },
  { from: "ferry", to: "tomas", label: "point of view" },
  { from: "ada", to: "letters" },
  { from: "letters", to: "note" },
  { from: "letters", to: "fifties" },
];

function at(id: string) {
  return ITEMS.find((i) => i.id === id)!;
}

/** A line between the pieces, or a label on one, that the tablet stage leaves out with them. */
function wideOnly(l: { from: string; to: string }) {
  return at(l.from).wideOnly || at(l.to).wideOnly || undefined;
}

function place(item: Item): CSSProperties {
  const n = item.narrow;
  return {
    "--lp-x": `${item.wide.x}%`,
    "--lp-y": `${item.wide.y}%`,
    "--lp-w": `${item.wide.w}px`,
    ...(n ? { "--lp-mx": `${n.x}%`, "--lp-my": `${n.y}%`, "--lp-mw": `${n.w}px` } : {}),
  } as CSSProperties;
}

function Lines({ layout }: { layout: "wide" | "narrow" }) {
  const lines = layout === "narrow" ? LINES.filter((l) => l.narrow) : LINES;
  const point = (item: Item) => (layout === "narrow" && item.narrow ? item.narrow : item.wide);
  return (
    <svg className="r2-fp-canvas-lines" data-layout={layout} viewBox="0 0 100 100" preserveAspectRatio="none">
      {lines.map((l) => {
        const a = point(at(l.from));
        const b = point(at(l.to));
        const selected = at(l.from).selected || at(l.to).selected;
        return (
          <line
            key={`${l.from}-${l.to}`}
            className="r2-canvas-line-stroke"
            data-selected={selected || undefined}
            data-wide-only={wideOnly(l)}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

export function CanvasPlane() {
  return (
    <div className="r2-canvas r2-fp-canvas">
      <div className="r2-canvas-ui r2-canvas-head">
        <div className="r2-page-head">
          <p className="r2-page-title">The crossing</p>
        </div>
      </div>
      <div className="r2-canvas-ui r2-canvas-tools">
        <span className="r2-canvas-zoom">100%</span>
      </div>
      {SECTIONS.map((s) => (
        <div
          key={s.title}
          className="r2-canvas-section r2-fp-canvas-section"
          data-wide-only={s.wideOnly || undefined}
          style={{ "--lp-x": `${s.x}%`, "--lp-y": `${s.y}%`, "--lp-w": `${s.w}%`, "--lp-h": `${s.h}%` } as CSSProperties}
        >
          <div className="r2-canvas-section-head">
            <span className="r2-canvas-section-title">{s.title}</span>
            <span className="r2-canvas-section-count">{s.count}</span>
          </div>
        </div>
      ))}
      <Lines layout="wide" />
      <Lines layout="narrow" />
      {LINES.filter((l) => l.label).map((l) => {
        const a = at(l.from).wide;
        const b = at(l.to).wide;
        return (
          <span key={`${l.from}-${l.to}`} className="r2-fp-canvas-label" data-wide-only={wideOnly(l)} style={{ left: `${(a.x + b.x) / 2}%`, top: `${(a.y + b.y) / 2}%` }}>
            {l.label}
          </span>
        );
      })}
      {ITEMS.map((item) =>
        item.kind === "note" ? (
          <div
            key={item.id}
            className="r2-canvas-card r2-canvas-card--note r2-fp-canvas-card"
            data-narrow={item.narrow ? "" : undefined}
            data-wide-only={item.wideOnly || undefined}
            style={place(item)}
          >
            <span className="r2-canvas-note">{item.text}</span>
          </div>
        ) : (
          <div
            key={item.id}
            className={`r2-canvas-card r2-canvas-card--${item.kind} r2-fp-canvas-card`}
            data-selected={item.selected || undefined}
            data-narrow={item.narrow ? "" : undefined}
            data-wide-only={item.wideOnly || undefined}
            style={place(item)}
          >
            <p className="r2-canvas-card-eyebrow">{item.eyebrow}</p>
            <p className="r2-canvas-card-title">{item.title}</p>
            {item.meta && <p className="r2-canvas-card-meta">{item.meta}</p>}
            {item.text && <p className="r2-canvas-card-preview">{item.text}</p>}
          </div>
        )
      )}
    </div>
  );
}
