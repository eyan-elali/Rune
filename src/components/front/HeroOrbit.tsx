// The hero's orbit (front.css: "The orbit"): the workspace that emerges
// around the headline as the reader scrolls. Pure presentation — every
// piece is placed on the stage by a point (x, y in percent), reached by a
// hairline drawn from a point on the headline's edge (`from`), and arrives
// at its own moment (`d`, a fraction of the hero's travel). The timing is
// read by CSS from --d/--s; this file only lays the pieces out. The lines
// leave the headline's edge — measured, not guessed (placeLines), so they
// never cross the type at any size — and stop just short of their piece.
//
// Nothing here is a real writer's work: a chapter, a character, a property,
// a timeline, a note, a reference, tags, a collection — the kinds of thing
// the Workspace holds, as small as they can be and still be read.

import type { CSSProperties, ReactNode } from "react";

type Point = readonly [x: number, y: number];

interface OrbitItem {
  id: string;
  /** Where the piece sits on the stage, percent of width and height. */
  at: Point;
  /** When its line begins, 0–1 of the hero's travel. */
  d: number;
  /** Shown in the phone row too. */
  phone?: boolean;
  variant: "material" | "chip" | "text" | "plain";
  content: ReactNode;
}

// Hue tokens: a little colour, only from the system's own semantic colours.
const BLUE = "var(--r2-accent)";
const AMBER = "var(--r2-warning)";
const GREEN = "var(--r2-success)";
const ROSE = "var(--r2-danger)";

const ITEMS: readonly OrbitItem[] = [
  {
    id: "chapter",
    at: [13, 30],
    d: 0,
    phone: true,
    variant: "material",
    content: (
      <>
        <span className="r2-lp-item-kind">Chapter 12</span>
        <span className="r2-lp-item-name r2-lp-item-name--serif">The Harbour</span>
        <span className="r2-lp-rule r2-lp-rule--mid" />
        <span className="r2-lp-rule r2-lp-rule--short" />
      </>
    ),
  },
  {
    id: "act",
    at: [34, 13],
    d: 0.2,
    variant: "plain",
    content: (
      <span className="r2-lp-act">
        <span>Act II</span>
        <span className="r2-lp-act-count">42,318 words</span>
      </span>
    ),
  },
  {
    id: "collection",
    at: [67, 12],
    d: 0.34,
    variant: "chip",
    content: (
      <>
        <span className="r2-lp-item-name">Places</span>
        <span className="r2-lp-dots" aria-hidden="true">
          <i style={{ "--hue": AMBER } as CSSProperties} />
          <i style={{ "--hue": GREEN } as CSSProperties} />
          <i style={{ "--hue": BLUE } as CSSProperties} />
        </span>
      </>
    ),
  },
  {
    id: "character",
    at: [85, 27],
    d: 0.08,
    phone: true,
    variant: "chip",
    content: (
      <>
        <span className="r2-lp-dot-ink" style={{ "--hue": ROSE } as CSSProperties} aria-hidden="true" />
        <span className="r2-lp-item-name">Mara Vance</span>
        <span>Character</span>
      </>
    ),
  },
  {
    id: "status",
    at: [90, 52],
    d: 0.16,
    phone: true,
    variant: "material",
    content: (
      <span className="r2-lp-kv" style={{ "--hue": BLUE } as CSSProperties}>
        <span className="r2-lp-kv-key">Status</span>
        <span className="r2-lp-kv-val">
          <i aria-hidden="true" />
          Drafting
        </span>
      </span>
    ),
  },
  {
    id: "timeline",
    at: [80, 78],
    d: 0.26,
    variant: "material",
    content: (
      <span className="r2-lp-timeline" style={{ "--hue": AMBER } as CSSProperties}>
        <span className="r2-lp-item-kind" style={{ marginBottom: 2 }}>
          Timeline
        </span>
        <span className="r2-lp-timeline-rail" aria-hidden="true">
          <i style={{ "--at": "8%" } as CSSProperties} data-label="1893" />
          <i style={{ "--at": "46%" } as CSSProperties} data-label="Spring" />
          <i style={{ "--at": "86%" } as CSSProperties} data-label="The fire" />
        </span>
      </span>
    ),
  },
  {
    id: "tags",
    at: [60, 89],
    d: 0.42,
    phone: true,
    variant: "plain",
    content: (
      <span className="r2-lp-tags">
        <span className="r2-lp-tag" style={{ "--hue": GREEN } as CSSProperties}>
          Research
        </span>
        <span className="r2-lp-tag" style={{ "--hue": AMBER } as CSSProperties}>
          Setting
        </span>
      </span>
    ),
  },
  {
    id: "note",
    at: [17, 73],
    d: 0.12,
    phone: true,
    variant: "text",
    content: <span className="r2-lp-item--text">“She never said whose letter it was.”</span>,
  },
  {
    id: "reference",
    at: [10, 52],
    d: 0.32,
    variant: "material",
    content: (
      <span className="r2-lp-media">
        <span className="r2-lp-media-tile" aria-hidden="true" />
        <span className="r2-lp-media-tile r2-lp-media-tile--2" aria-hidden="true" />
        <span>
          <span className="r2-lp-item-kind" style={{ marginBottom: 4 }}>
            Reference
          </span>
          <span className="r2-lp-item-name">Harbour, 1890s</span>
        </span>
      </span>
    ),
  },
];

/** The line to a piece begins at its moment and takes this much of the travel. */
const LINE_SPAN = 0.26;
/** The piece itself follows, once the line is most of the way there. */
const ITEM_LAG = 0.16;
const ITEM_SPAN = 0.2;
/** The hero holds the headline alone for this much of its travel. */
const LEAD = 0.14;

/** How far outside the headline's box a line begins. */
const EDGE = 26;
/** How far short of its piece a line stops. */
const SHORT = 34;

/**
 * Sets each line's ends from the headline's measured box: it leaves the box's
 * padded edge along the ray from the box's centre to the piece, and stops
 * short of the piece. Called by FrontHero whenever the stage is resized.
 */
export function placeLines(stage: HTMLElement, title: HTMLElement, column: HTMLElement) {
  // The box the lines keep out of: as wide as the headline, as tall as the
  // whole centre column (headline, line, action) — so no line crosses the type.
  const box = stage.getBoundingClientRect();
  const t = title.getBoundingClientRect();
  const c = column.getBoundingClientRect();
  const cx = t.left - box.left + t.width / 2;
  const cy = c.top - box.top + c.height / 2;
  const hw = t.width / 2 + EDGE;
  const hh = c.height / 2 + EDGE;
  for (const line of stage.querySelectorAll<SVGLineElement>(".r2-lp-line")) {
    const [ax, ay] = (line.dataset.at ?? "50 50").split(" ").map(Number);
    const x = (ax / 100) * box.width;
    const y = (ay / 100) * box.height;
    const dx = x - cx;
    const dy = y - cy;
    // The ray's exit from the padded box: the nearer of the two edge crossings.
    const k = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
    const len = Math.hypot(dx, dy);
    const ex = x - (dx / len) * SHORT;
    const ey = y - (dy / len) * SHORT;
    line.setAttribute("x1", (cx + dx * k).toFixed(1));
    line.setAttribute("y1", (cy + dy * k).toFixed(1));
    line.setAttribute("x2", ex.toFixed(1));
    line.setAttribute("y2", ey.toFixed(1));
  }
}

export function HeroOrbit() {
  return (
    <div className="r2-lp-orbit" aria-hidden="true">
      {/* Ends set by placeLines; pathLength=1 so one dash offset draws any of them. */}
      <svg className="r2-lp-lines">
        {ITEMS.map((item) => (
          <line
            key={item.id}
            className="r2-lp-line"
            data-at={`${item.at[0]} ${item.at[1]}`}
            pathLength={1}
            style={{ "--d": LEAD + item.d, "--s": LINE_SPAN } as CSSProperties}
          />
        ))}
      </svg>
      {ITEMS.map((item) => (
        <div
          key={item.id}
          className={`r2-lp-item r2-lp-item--${item.variant}`}
          data-phone={item.phone ? "yes" : "no"}
          style={
            {
              "--x": `${item.at[0]}%`,
              "--y": `${item.at[1]}%`,
              "--d": LEAD + item.d + ITEM_LAG,
              "--s": ITEM_SPAN,
            } as CSSProperties
          }
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
