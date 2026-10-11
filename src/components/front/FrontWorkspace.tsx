import type { ComponentType, CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ICON_SM_BOLD } from "@/components/rune2/icons";
import { Reveal } from "./Reveal";

// Section 3 of the landing page (front.css: "The workspace"): the answer to
// what follows the manuscript section — the book stays clean and central,
// so how does the workspace grow around it when a writer needs more?
//
// One statement, then the four ways the workspace can expand, composed as
// one overview that fits a desktop viewport: three compact surfaces across
// — Pages, Collections, Scene properties — and the Canvas wide beneath
// them, the section's anchor, with the room a spatial surface wants. Each
// card shows one capability as a restrained preview of the product's own
// surface — a page, a table, an inspector, a canvas — drawn with this
// section's own small classes rather than the live components, which need
// a Project and a session. Nothing in a preview is a control; the card as
// a whole is the one link.
//
// It is not a list of features. Four, not forty: the few places the
// workspace can grow, and only when the writing asks. The destinations
// (WORKSPACE_FEATURES: /workspace/<slug>) are placeholders for the closer
// looks to come; the cards are built to lead deeper, and today they lead
// to a page that says so.

export type WorkspaceFeatureSlug = "pages" | "collections" | "canvas" | "scene-properties";

export const WORKSPACE_FEATURES: ReadonlyArray<{
  slug: WorkspaceFeatureSlug;
  title: string;
  line: string;
}> = [
  { slug: "pages", title: "Pages", line: "Characters, places, research. A page for what the book needs." },
  { slug: "collections", title: "Collections", line: "The same kind of thing, many times over, in order." },
  { slug: "scene-properties", title: "Scene properties", line: "Point of view, status, place and time, on the scene." },
  { slug: "canvas", title: "Canvas", line: "Lay the book's pieces out and draw the lines between them." },
];

export function workspaceFeaturePath(slug: WorkspaceFeatureSlug) {
  return `/workspace/${slug}`;
}

// ── The previews ───────────────────────────────────────────────────────

// Pages: one page, open — a Workspace Page as the writer sees it: its
// folder as an eyebrow, its title, a line or two of its text, and the
// quiet fact that the book refers to it. One surface, no stack.
function PagesPreview() {
  return (
    <div className="r2-lp-ws-page">
      <p className="r2-lp-ws-page-eyebrow">
        <span className="r2-lp-ws-dot" data-tone="sage" />
        Characters
      </p>
      <p className="r2-lp-ws-page-title">Ada Marsh</p>
      <p className="r2-lp-ws-page-text">
        Born on the island. Left at nineteen, telling no one, and came back for the house.
      </p>
      <p className="r2-lp-ws-page-meta">Mentioned in 3 scenes</p>
    </div>
  );
}

// Collections: a few rows of one kind of thing, with light metadata beside
// each name. Not a database — a list that has learned a column or two.
const COLLECTION_ROWS = [
  { name: "Ada Marsh", role: "Protagonist", status: "Drafted", tone: "sage" },
  { name: "Tomas Reyes", role: "Ferryman", status: "Drafted", tone: "sage" },
  { name: "Mrs. Hale", role: "Neighbour", status: "Sketched", tone: "sand" },
] as const;

function CollectionsPreview() {
  return (
    <div className="r2-lp-ws-table">
      <div className="r2-lp-ws-table-head">
        <span>Characters</span>
        <span className="r2-lp-ws-table-count">3</span>
      </div>
      <div className="r2-lp-ws-table-cols">
        <span>Name</span>
        <span>Role</span>
        <span>Status</span>
      </div>
      {COLLECTION_ROWS.map((row) => (
        <div key={row.name} className="r2-lp-ws-table-row">
          <span className="r2-lp-ws-table-name">{row.name}</span>
          <span>{row.role}</span>
          <span>
            <span className="r2-lp-ws-tag" data-tone={row.tone}>
              {row.status}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// Canvas: the product's own surface (rune2.css: "Canvas") — the dot grid,
// a Section (a tinted region with a serif title and its count), cards for
// the book's pieces (a Scene with its prose preview, a Page), a note on
// the plane's own paper, and the fine lines between them, one carrying a
// label. Positions are percentages of the stage, each card centred on its
// point; the lines are one SVG beneath, joining the cards' centres.
//
// A phone gets a second, smaller arrangement of the same plane (front.css:
// Section 3, "Phones"): the three cards only — the chosen scene, the two
// pages it leads to — and the two lines between them. A card carries both
// positions as custom properties (--lp-x/y/w for the wide stage, --lp-mx/
// my/mw for the narrow one) and the stylesheet reads the pair for the
// width; a piece with no narrow position is the wide stage's alone. The
// lines are two SVG layers, one per arrangement, and the stylesheet shows
// one.
type CanvasPoint = { x: number; y: number; w: number };
const CANVAS_ITEMS = [
  {
    id: "scene",
    kind: "card",
    selected: true,
    eyebrow: "Scene · The Letters",
    title: "The Thursday Boat",
    text: "The letters came on the Thursday boat, three of them, tied with the grey string.",
    x: 22,
    y: 58,
    w: 192,
    narrow: { x: 46, y: 24, w: 134 },
  },
  { id: "ada", kind: "card", eyebrow: "Page · Characters", title: "Ada Marsh", x: 58, y: 24, w: 150, narrow: { x: 68, y: 58, w: 92 } },
  { id: "house", kind: "card", eyebrow: "Page · Places", title: "The house", x: 58, y: 76, w: 140, narrow: { x: 36, y: 82, w: 92 } },
  { id: "note", kind: "note", text: "Why does she wait a whole day to open them?", x: 84, y: 48, w: 168 },
] as const;
const CANVAS_LINES: ReadonlyArray<{ from: string; to: string; label?: string }> = [
  { from: "scene", to: "ada", label: "point of view" },
  { from: "scene", to: "house" },
  { from: "ada", to: "note" },
];
/** The narrow stage's lines: the chosen scene to each page. */
const CANVAS_LINES_NARROW: ReadonlyArray<{ from: string; to: string }> = [
  { from: "scene", to: "ada" },
  { from: "scene", to: "house" },
];

function canvasPosition(wide: CanvasPoint, narrow?: CanvasPoint): CSSProperties {
  return {
    "--lp-x": `${wide.x}%`,
    "--lp-y": `${wide.y}%`,
    "--lp-w": `${wide.w}px`,
    ...(narrow ? { "--lp-mx": `${narrow.x}%`, "--lp-my": `${narrow.y}%`, "--lp-mw": `${narrow.w}px` } : {}),
  } as CSSProperties;
}

function CanvasLines({ layout, lines }: { layout: "wide" | "narrow"; lines: ReadonlyArray<{ from: string; to: string }> }) {
  const at = (id: string) => CANVAS_ITEMS.find((n) => n.id === id)!;
  const point = (n: (typeof CANVAS_ITEMS)[number]) => (layout === "narrow" && "narrow" in n ? n.narrow : n);
  return (
    <svg className="r2-lp-ws-canvas-lines" data-layout={layout} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {lines.map((l) => {
        const a = at(l.from);
        const b = at(l.to);
        const pa = point(a);
        const pb = point(b);
        const selected = ("selected" in a && a.selected) || ("selected" in b && b.selected);
        return (
          <line
            key={`${l.from}-${l.to}`}
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            data-selected={selected || undefined}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function CanvasPreview() {
  const at = (id: string) => CANVAS_ITEMS.find((n) => n.id === id)!;
  return (
    <div className="r2-lp-ws-canvas">
      <div className="r2-lp-ws-canvas-section">
        <span className="r2-lp-ws-canvas-section-title">Part One</span>
        <span className="r2-lp-ws-canvas-section-count">3</span>
      </div>
      <CanvasLines layout="wide" lines={CANVAS_LINES} />
      <CanvasLines layout="narrow" lines={CANVAS_LINES_NARROW} />
      {CANVAS_LINES.filter((l) => l.label).map((l) => {
        const a = at(l.from);
        const b = at(l.to);
        return (
          <span key={l.label} className="r2-lp-ws-canvas-label" style={{ left: `${(a.x + b.x) / 2}%`, top: `${(a.y + b.y) / 2}%` }}>
            {l.label}
          </span>
        );
      })}
      {CANVAS_ITEMS.map((n) =>
        n.kind === "note" ? (
          <span key={n.id} className="r2-lp-ws-canvas-note" style={canvasPosition(n)}>
            {n.text}
          </span>
        ) : (
          <span
            key={n.id}
            className="r2-lp-ws-canvas-card"
            data-selected={"selected" in n && n.selected ? "" : undefined}
            style={canvasPosition(n, n.narrow)}
          >
            <span className="r2-lp-ws-canvas-eyebrow">{n.eyebrow}</span>
            <span className="r2-lp-ws-canvas-title">{n.title}</span>
            {"text" in n && <span className="r2-lp-ws-canvas-text">{n.text}</span>}
          </span>
        )
      )}
    </div>
  );
}

// Scene properties: the inspector's property list for one scene — a label
// and its value, row by row, with the few that are a choice set as tags.
// A phone shows the first three (front.css: Section 3, "Phones"); each row
// is named (data-prop) so the stylesheet can leave the rest out.
const SCENE_PROPERTIES: ReadonlyArray<{ id: string; label: string; value: string; tag?: boolean; dot?: string }> = [
  { id: "pov", label: "Point of view", value: "Ada", dot: "sage" },
  { id: "status", label: "Status", value: "Draft", tag: true },
  { id: "location", label: "Location", value: "The house", dot: "terracotta" },
  { id: "timeline", label: "Timeline", value: "March, year two" },
  { id: "words", label: "Words", value: "1,412" },
];

function ScenePropertiesPreview() {
  return (
    <div className="r2-lp-ws-props">
      <div className="r2-lp-ws-props-head">
        <p className="r2-lp-ws-props-eyebrow">Scene · The Letters</p>
        <p className="r2-lp-ws-props-title">The Thursday Boat</p>
      </div>
      <dl className="r2-lp-ws-props-list">
        {SCENE_PROPERTIES.map((p) => (
          <div key={p.id} className="r2-lp-ws-props-row" data-prop={p.id}>
            <dt>{p.label}</dt>
            <dd data-numeric={p.label === "Words" || undefined}>
              {p.tag ? (
                <span className="r2-lp-ws-tag" data-tone="blue">
                  {p.value}
                </span>
              ) : (
                <>
                  {p.dot && <span className="r2-lp-ws-dot" data-tone={p.dot} />}
                  {p.value}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const PREVIEWS: Record<WorkspaceFeatureSlug, ComponentType> = {
  pages: PagesPreview,
  collections: CollectionsPreview,
  canvas: CanvasPreview,
  "scene-properties": ScenePropertiesPreview,
};

// ── The section ────────────────────────────────────────────────────────

export function FrontWorkspace() {
  return (
    <section id="workspace" className="r2-lp-ws" aria-labelledby="lp-ws-title">
      <div className="r2-lp-ws-in">
        <Reveal className="r2-lp-ws-head">
          <p className="r2-lp-eyebrow">The workspace</p>
          <h2 id="lp-ws-title" className="r2-lp-h2">
            When the book asks for more.
          </h2>
          <p className="r2-lp-lede">Add structure only when it helps.</p>
        </Reveal>
        <Reveal delay>
          <ul className="r2-lp-ws-grid">
            {WORKSPACE_FEATURES.map((f) => {
              const Preview = PREVIEWS[f.slug];
              return (
                <li key={f.slug} className="r2-lp-ws-cell" data-feature={f.slug}>
                  <Link href={workspaceFeaturePath(f.slug)} className="r2-lp-ws-card r2-material r2-material--interactive">
                    <div className="r2-lp-ws-card-text">
                      <h3 className="r2-lp-ws-card-title">{f.title}</h3>
                      <p className="r2-lp-ws-card-line">{f.line}</p>
                    </div>
                    <div className="r2-lp-ws-card-preview" aria-hidden>
                      <Preview />
                    </div>
                    <span className="r2-lp-ws-card-cue">
                      Learn more
                      <ArrowRight {...ICON_SM_BOLD} aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
