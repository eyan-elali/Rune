"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link2, X } from "lucide-react";
import { ICON, ICON_SM } from "@/components/rune2/icons";
import { Editor, Navigator } from "./FrontManuscript";
import { Reveal } from "./Reveal";

// Section 4 of the landing page (front.css: "The details"): the manuscript
// stays open and primary, and what a scene needs stays close. One
// composition: the Project shell at the left — the same navigator and
// editor as the manuscript section (FrontManuscript), with the Inspector
// open beside the writing — and, at the right, the workspace objects the
// Inspector's fields point to. Thin lines join each field to its object.
//
// Everything is the product's own language. The Inspector is the real
// panel (rune2.css: .r2-panel, .r2-inspector, Rune2Panel.tsx): the Scene's
// kind, title, place and facts; its Properties — the Manuscript's Scene
// properties (migration 032), here two Relationships (028), a Select and a
// Status — and its Connections (ObjectLinks). Each object at the right is
// drawn as its own surface is: an Entry with its properties, a Page, a
// Scene Timeline View's lane (the Select as lanes), a Page of research.
//
// The lines are measured, not drawn by hand: after layout, each field's
// value and its object are located and one quiet curve is set between
// them (LINKS). Hovering either end brightens the pair. Nothing here is a
// control; the composition is one image, and it is complete without the
// lines (narrow screens hide them and stack the two halves).

const CHAPTER = "The Letters";
const SCENE = "The Thursday Boat";

// Fewer paragraphs than the manuscript section: the column is narrower
// beside the Inspector, and the prose is context here, not the subject.
const PROSE = [
  "The letters came on the Thursday boat, three of them, tied with the grey string her mother had always used. Ada did not open them at the harbour. She carried them up the hill the way one carries something that might still be warm.",
  "By the time she reached the house the wind had turned. She set the letters on the table beside the lamp and left them there while she made tea, as if the ordinary tasks could be made to go first.",
  "The first was dated in March, which meant it had waited somewhere for the better part of a season. She read it standing, and then again sitting down, and the second reading was the one that counted.",
];

type LinkId = "ada" | "house" | "when" | "research";

// Each line: the Inspector field it leaves and the object it reaches, and
// the one small tone that tells it from the others (the section's tones,
// front.css: --lp-tone-*).
const LINKS: ReadonlyArray<{ id: LinkId; tone: "sage" | "terracotta" | "blue" | "sand" }> = [
  { id: "ada", tone: "sage" },
  { id: "house", tone: "terracotta" },
  { id: "when", tone: "blue" },
  { id: "research", tone: "sand" },
];

// ── The Inspector ──────────────────────────────────────────────────────

function PropRow({
  label,
  children,
  link,
  anchor,
}: {
  label: string;
  children: ReactNode;
  link?: LinkId;
  anchor?: (id: LinkId, el: HTMLElement | null) => void;
}) {
  return (
    <div className="r2-prop" data-link={link}>
      <dt className="r2-prop-label">
        <span className="r2-prop-label-text">{label}</span>
      </dt>
      <dd className="r2-prop-value" ref={link && anchor ? (el) => anchor(link, el) : undefined}>
        {children}
      </dd>
    </div>
  );
}

function Inspector({ anchor }: { anchor: (id: LinkId, el: HTMLElement | null) => void }) {
  return (
    <aside className="r2-panel" data-open="">
      <div className="r2-panel-inner">
        <div className="r2-panel-head">
          <h2>Inspector</h2>
          <span className="r2-icon-button">
            <X {...ICON} />
          </span>
        </div>
        <div className="r2-panel-body">
          <div className="r2-inspector">
            <header className="r2-insp-head">
              <p className="r2-insp-kind">Scene</p>
              <p className="r2-insp-title">{SCENE}</p>
              <p className="r2-insp-place">
                <span className="r2-insp-place-step">
                  <span className="r2-insp-place-link">Part One</span>
                </span>
                <span className="r2-insp-place-step">
                  <span className="r2-insp-place-sep">/</span>
                  <span className="r2-insp-place-link">{CHAPTER}</span>
                </span>
              </p>
              <p className="r2-insp-facts">
                <span>Scene 2 of 3</span>
                <span>1,412 words</span>
              </p>
            </header>

            <section className="r2-insp-section">
              <header className="r2-insp-section-head">
                <h3 className="r2-insp-label">Properties</h3>
                <span className="r2-insp-aside">
                  <span className="r2-insp-aside-link">Edit</span>
                </span>
              </header>
              <div className="r2-scene-props">
                <section className="r2-props">
                  <dl className="r2-props-list">
                    <PropRow label="Point of view" link="ada" anchor={anchor}>
                      <div className="r2-prop-choice r2-prop-relation">
                        <span className="r2-prop-links">
                          <span className="r2-prop-link">Ada Marsh</span>
                        </span>
                      </div>
                    </PropRow>
                    <PropRow label="Location" link="house" anchor={anchor}>
                      <div className="r2-prop-choice r2-prop-relation">
                        <span className="r2-prop-links">
                          <span className="r2-prop-link">The house</span>
                        </span>
                      </div>
                    </PropRow>
                    <PropRow label="Timeline" link="when" anchor={anchor}>
                      <div className="r2-prop-choice">
                        <span className="r2-prop-button">
                          <span className="r2-prop-options" data-type="select">
                            <span className="r2-prop-option">March, year two</span>
                          </span>
                        </span>
                      </div>
                    </PropRow>
                    <PropRow label="Status">
                      <div className="r2-prop-choice">
                        <span className="r2-prop-button">
                          <span className="r2-prop-options" data-type="status">
                            <span className="r2-prop-option">Draft</span>
                          </span>
                        </span>
                      </div>
                    </PropRow>
                  </dl>
                </section>
              </div>
            </section>

            <section className="r2-insp-section">
              <header className="r2-insp-section-head">
                <h3 className="r2-insp-label">Connections</h3>
                <span className="r2-insp-aside">
                  <span className="r2-insp-aside-link">
                    <Link2 {...ICON_SM} />
                    Link to…
                  </span>
                </span>
              </header>
              <div className="r2-links">
                <h4 className="r2-links-sub">Related</h4>
                <ul className="r2-links-list">
                  <li data-link="research" ref={(el) => anchor("research", el)}>
                    <span className="r2-link">
                      <span className="r2-link-title">Why the letters wait</span>
                      <span className="r2-link-hint">Research</span>
                    </span>
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── The objects ────────────────────────────────────────────────────────

function Card({
  id,
  kind,
  anchor,
  children,
}: {
  id: LinkId;
  kind: string;
  anchor: (id: LinkId, el: HTMLElement | null) => void;
  children: ReactNode;
}) {
  return (
    <li className="r2-lp-dt-card" data-link={id} data-kind={kind} ref={(el) => anchor(id, el)}>
      {children}
    </li>
  );
}

// The Entry "Ada Marsh", in the Collection Characters: its Collection as
// the eyebrow, its title, its properties as the Entry shows them
// (rune2.css: .r2-props on a page), a line of its body.
function AdaEntry() {
  return (
    <>
      <p className="r2-lp-ws-page-eyebrow">
        <span className="r2-lp-ws-dot" data-tone="sage" />
        Characters
      </p>
      <p className="r2-lp-dt-title">Ada Marsh</p>
      <dl className="r2-lp-dt-props">
        <div className="r2-prop">
          <dt className="r2-prop-label">
            <span className="r2-prop-label-text">Role</span>
          </dt>
          <dd className="r2-prop-value">Protagonist</dd>
        </div>
        <div className="r2-prop">
          <dt className="r2-prop-label">
            <span className="r2-prop-label-text">Status</span>
          </dt>
          <dd className="r2-prop-value">
            <span className="r2-prop-options" data-type="status">
              <span className="r2-prop-option">Drafted</span>
            </span>
          </dd>
        </div>
      </dl>
      <p className="r2-lp-dt-text">Born on the island. Left at nineteen, telling no one, and came back for the house.</p>
    </>
  );
}

// The Page "The house", in the folder Places: a Workspace Page, set in the
// interface sans as Pages are.
function HousePage() {
  return (
    <>
      <p className="r2-lp-ws-page-eyebrow">
        <span className="r2-lp-ws-dot" data-tone="terracotta" />
        Places
      </p>
      <p className="r2-lp-dt-title">The house</p>
      <p className="r2-lp-dt-text">Two rooms and a loft above the harbour road. Her mother’s, then no one’s, now hers.</p>
    </>
  );
}

// The Scenes in a Timeline View (rune2.css: .r2-timeline): the manuscript's
// Chapters as the axis (one Chapter in view), the Select "Timeline" as lanes, each Scene a mark
// with its name beside it. The lane the Inspector's value names holds the
// open Scene.
const TIMELINE_CHAPTERS = [CHAPTER] as const;
const TIMELINE_LANES: ReadonlyArray<{ name: string; count: number; item: string; at: number; selected?: boolean }> = [
  { name: "Year one", count: 2, item: "The Ferry", at: 0 },
  { name: "March, year two", count: 3, item: SCENE, at: 0, selected: true },
];

function TimelineLanes() {
  return (
    <>
      <p className="r2-lp-ws-page-eyebrow">
        <span className="r2-lp-ws-dot" data-tone="blue" />
        Scenes · Timeline
      </p>
      <div className="r2-lp-dt-tl">
        <div className="r2-lp-dt-tl-axis">
          <span className="r2-lp-dt-tl-corner">Manuscript</span>
          <span className="r2-lp-dt-tl-track">
            {TIMELINE_CHAPTERS.map((c, i) => (
              <span key={c} className="r2-lp-dt-tl-chapter" style={{ left: `${i * 100}%` }}>
                {c}
              </span>
            ))}
          </span>
        </div>
        {TIMELINE_LANES.map((lane) => (
          <div key={lane.name} className="r2-lp-dt-tl-lane">
            <span className="r2-lp-dt-tl-rail">
              <span className="r2-lp-dt-tl-lane-name">{lane.name}</span>
              <span className="r2-lp-dt-tl-lane-count">{lane.count}</span>
            </span>
            <span className="r2-lp-dt-tl-track">
              <span className="r2-lp-dt-tl-item" data-selected={lane.selected || undefined} style={{ left: `${lane.at}%` }}>
                <span className="r2-lp-dt-tl-mark" />
                {lane.item}
              </span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// The Page "Why the letters wait", in the folder Research: a note the
// Scene is linked to (Connections).
function ResearchPage() {
  return (
    <>
      <p className="r2-lp-ws-page-eyebrow">
        <span className="r2-lp-ws-dot" data-tone="sand" />
        Research
      </p>
      <p className="r2-lp-dt-title">Why the letters wait</p>
      <p className="r2-lp-dt-text">The delay is the mother’s, not the post’s: she wrote all three at once, and sent none.</p>
    </>
  );
}

// ── The lines ──────────────────────────────────────────────────────────

type Segment = { id: LinkId; tone: string; x1: number; y1: number; x2: number; y2: number };

// Where a line leaves the Inspector: the field's value, at the panel's right
// gutter (the sheet is flush with the shell's edge); where it arrives: the
// object's left edge, at its title. Measured against the composition.
function measure(
  root: HTMLElement,
  shot: HTMLElement,
  from: Map<LinkId, HTMLElement>,
  to: Map<LinkId, HTMLElement>
): Segment[] {
  const r = root.getBoundingClientRect();
  const edge = shot.getBoundingClientRect().right - r.left - 14;
  const out: Segment[] = [];
  for (const l of LINKS) {
    const a = from.get(l.id);
    const b = to.get(l.id);
    if (!a || !b) continue;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    out.push({
      id: l.id,
      tone: l.tone,
      x1: edge,
      y1: ra.top + ra.height / 2 - r.top,
      x2: rb.left - r.left,
      y2: rb.top + 30 - r.top,
    });
  }
  return out;
}

function curve(s: Segment) {
  const dx = Math.max(24, (s.x2 - s.x1) * 0.55);
  return `M ${s.x1} ${s.y1} C ${s.x1 + dx} ${s.y1}, ${s.x2 - dx} ${s.y2}, ${s.x2} ${s.y2}`;
}

// ── The section ────────────────────────────────────────────────────────

const SHOT_LABEL =
  "Sutura with the scene The Thursday Boat open and the Inspector beside it. The Inspector lists the scene's properties — Point of view: Ada Marsh; Location: The house; Timeline: March, year two; Status: Draft — and its connections: the research page Why the letters wait. To the right stand the objects those fields point to: the character entry Ada Marsh in Characters, the page The house in Places, the scene's lane March, year two in a timeline view of the scenes, and the research page. Thin lines join each field to its object.";

export function FrontDetails() {
  const root = useRef<HTMLDivElement>(null);
  const shot = useRef<HTMLDivElement>(null);
  const from = useRef(new Map<LinkId, HTMLElement>());
  const to = useRef(new Map<LinkId, HTMLElement>());
  const [segments, setSegments] = useState<Segment[]>([]);
  const [active, setActive] = useState<LinkId | null>(null);

  const anchorFrom = useCallback((id: LinkId, el: HTMLElement | null) => {
    if (el) from.current.set(id, el);
    else from.current.delete(id);
  }, []);
  const anchorTo = useCallback((id: LinkId, el: HTMLElement | null) => {
    if (el) to.current.set(id, el);
    else to.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const el = root.current;
    const sh = shot.current;
    if (!el || !sh) return;
    const update = () => setSegments(measure(el, sh, from.current, to.current));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(sh);
    for (const t of to.current.values()) ro.observe(t);
    return () => ro.disconnect();
  }, []);

  // Fonts arriving after first layout move the rows a little: measure again.
  useEffect(() => {
    const el = root.current;
    const sh = shot.current;
    if (!el || !sh || typeof document === "undefined" || !("fonts" in document)) return;
    let live = true;
    document.fonts.ready.then(() => {
      if (live) setSegments(measure(el, sh, from.current, to.current));
    });
    return () => {
      live = false;
    };
  }, []);

  // Hovering a field or an object brightens that pair; the root carries the
  // choice, so the stylesheet can reach both ends and the line (front.css).
  const over = (e: React.MouseEvent) => {
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-link]");
    setActive((hit?.dataset.link as LinkId | undefined) ?? null);
  };

  return (
    <section id="details" className="r2-lp-dt" aria-labelledby="lp-dt-title">
      <div className="r2-lp-dt-in">
        <Reveal className="r2-lp-dt-head">
          <p className="r2-lp-eyebrow">The details</p>
          <h2 id="lp-dt-title" className="r2-lp-h2">
            The book stays open. The details stay close.
          </h2>
          <p className="r2-lp-lede">
            Open what a scene needs — point of view, place, character, time, and notes — without leaving the manuscript.
          </p>
        </Reveal>
        <Reveal delay>
          <div
            ref={root}
            className="r2-lp-dt-stage"
            role="img"
            aria-label={SHOT_LABEL}
            data-active={active ?? undefined}
            onMouseOver={over}
            onMouseLeave={() => setActive(null)}
          >
            <div className="r2-lp-dt-shot" aria-hidden>
              <div ref={shot} className="r2-lp-shot">
                <div className="r2-lp-shot-in">
                  <Navigator />
                  <Editor prose={PROSE} />
                  <Inspector anchor={anchorFrom} />
                  <div className="r2-lp-shot-status">
                    1,412 words <span>·</span> Saved
                  </div>
                </div>
              </div>
            </div>
            <ul className="r2-lp-dt-objects" aria-hidden>
              <Card id="ada" kind="entry" anchor={anchorTo}>
                <AdaEntry />
              </Card>
              <Card id="house" kind="page" anchor={anchorTo}>
                <HousePage />
              </Card>
              <Card id="when" kind="timeline" anchor={anchorTo}>
                <TimelineLanes />
              </Card>
              <Card id="research" kind="page" anchor={anchorTo}>
                <ResearchPage />
              </Card>
            </ul>
            <svg className="r2-lp-dt-lines" aria-hidden>
              {segments.map((s) => (
                <g key={s.id} data-link={s.id} data-tone={s.tone}>
                  <path d={curve(s)} />
                  <circle cx={s.x1} cy={s.y1} r={2.5} />
                  <circle cx={s.x2} cy={s.y2} r={2.5} />
                </g>
              ))}
            </svg>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
