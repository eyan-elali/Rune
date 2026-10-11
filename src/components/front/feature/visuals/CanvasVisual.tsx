import type { CSSProperties } from "react";
import { CHAPTER, SCENE } from "./shell";

// The Canvas page's drawing: the product's own plane (CanvasSurface,
// CanvasCard, CanvasSection, CanvasConnections; rune2.css: "Canvas") — the
// content tone with the faintest dot grid, a Section's tinted region, the
// book's pieces as compact cards raised a hair off the plane (a Scene with
// its prose preview in the manuscript's type, Pages, an Entry, a note on
// the plane's paper), the fine lines between them, one carrying a label,
// and the quiet title at the corner. The cards are the product's classes;
// only their placement is this drawing's: percentages of the stage, each
// card centred on its point, and a narrower arrangement for a phone, read
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
  wide: Point;
  narrow?: Point;
};

const ITEMS: Item[] = [
  {
    id: "boat",
    kind: "scene",
    eyebrow: `Scene · ${CHAPTER}`,
    title: SCENE,
    meta: "1,412 words",
    text: "The letters came on the Thursday boat, three of them, tied with the grey string her mother had always used.",
    selected: true,
    wide: { x: 21, y: 40, w: 204 },
    narrow: { x: 34, y: 26, w: 168 },
  },
  { id: "high", kind: "scene", eyebrow: `Scene · ${CHAPTER}`, title: "High Water", meta: "318 words", wide: { x: 21, y: 78, w: 160 } },
  { id: "ada", kind: "entry", eyebrow: "Characters", title: "Ada Marsh", wide: { x: 54, y: 22, w: 150 }, narrow: { x: 72, y: 60, w: 112 } },
  { id: "house", kind: "page", eyebrow: "Page · Places", title: "The house", wide: { x: 56, y: 64, w: 144 }, narrow: { x: 30, y: 78, w: 112 } },
  { id: "letters", kind: "page", eyebrow: "Page", title: "Why the letters wait", wide: { x: 84, y: 30, w: 168 } },
  { id: "note", kind: "note", text: "Why does she wait a whole day to open them? What is she afraid the second letter says?", wide: { x: 82, y: 72, w: 196 } },
];

const LINES: ReadonlyArray<{ from: string; to: string; label?: string; narrow?: boolean }> = [
  { from: "boat", to: "ada", label: "point of view", narrow: true },
  { from: "boat", to: "house", narrow: true },
  { from: "high", to: "house" },
  { from: "ada", to: "letters" },
  { from: "letters", to: "note" },
];

function at(id: string) {
  return ITEMS.find((i) => i.id === id)!;
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
      <div className="r2-canvas-section r2-fp-canvas-section">
        <div className="r2-canvas-section-head">
          <span className="r2-canvas-section-title">{CHAPTER}</span>
          <span className="r2-canvas-section-count">2</span>
        </div>
      </div>
      <Lines layout="wide" />
      <Lines layout="narrow" />
      {LINES.filter((l) => l.label).map((l) => {
        const a = at(l.from).wide;
        const b = at(l.to).wide;
        return (
          <span key={l.label} className="r2-fp-canvas-label" style={{ left: `${(a.x + b.x) / 2}%`, top: `${(a.y + b.y) / 2}%` }}>
            {l.label}
          </span>
        );
      })}
      {ITEMS.map((item) =>
        item.kind === "note" ? (
          <div key={item.id} className="r2-canvas-card r2-canvas-card--note r2-fp-canvas-card" data-narrow={item.narrow ? "" : undefined} style={place(item)}>
            <span className="r2-canvas-note">{item.text}</span>
          </div>
        ) : (
          <div
            key={item.id}
            className={`r2-canvas-card r2-canvas-card--${item.kind} r2-fp-canvas-card`}
            data-selected={item.selected || undefined}
            data-narrow={item.narrow ? "" : undefined}
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
