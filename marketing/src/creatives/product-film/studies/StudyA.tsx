import type { CSSProperties } from "react";
import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE, EASE_FRAME } from "../../../foundation/time";
import { SCENE, SCENE_OPEN_LINE, SCENE_OPEN_TYPED, SCENE_PROSE } from "../../../data/salt-house";
import { PLANS, ShellFor, Window, type Plan } from "../Keyframes";
import { DirectionalBlur, Slip, TextCarrier, carrierAt, type Path } from "./Carrier";
import { CARRY, CAMERA, SETTLE, clamp01, lerp, logLerp, span, type Point } from "./motion";
import type { Measured, Probes } from "./probe";
import { Field, frameScope, type Cue, type Phase, type StudyDef } from "./Study";
import pulseA from "../../../audio/pulse-1.wav";
import pulseB from "../../../audio/pulse-2.wav";
import clickSound from "../../../audio/click.wav";

// STUDY A — the pause → Revision Notes.
//
// Authentic source: frame 05 (the Scene; the caret resting after "Seventeen
// was empty."). Authentic destination: frame 06 (Revision Notes; the first
// note anchored to that sentence). The semantic object is the sentence.
//
// The idea: a Revision Note's excerpt is a QUOTATION. The sentence never
// leaves the manuscript — a copy lifts off the page, the page slides away
// beneath it as the panel opens (the real layout), and the copy carries into
// the note's anchor, where the quotation marks close around it. The thinking
// motif before it is the caret: each tick is a blink, and each takes the rest
// of the Scene one step down in ink until one line is left.

const SENTENCE = "Seventeen was empty.";
const PANEL_W = 320; // rune2.css --r2-panel-width
const CURSOR = 30 / 20; // ~30px on screen at any scale

// ── The event grid (seconds) ───────────────────────────────────────────────
const T = {
  tick1: 0.62,
  tick2: 1.18,
  reach: 1.42, // the pointer leaves for Revision Notes
  click: 1.98,
  panel: 2.0, // the panel opens: 300ms on --r2-ease-frame (product speed)
  pickup: 2.04, // the line is picked up off the page: a slip of the surface, lifted
  lift: 2.14, // the quotation leaves
  carry: 1.1,
  quotes: 3.1,
  handoff: 3.4, // the real excerpt takes over
  reink: 3.24,
  tick3: 4.12,
  tick4: 4.68,
  onward: 5.0, // the pointer moves on toward the Inspector
  end: 5.9,
};

// ── Authentic states ───────────────────────────────────────────────────────

const PROSE = [...SCENE_PROSE, SCENE_OPEN_LINE + SCENE_OPEN_TYPED];

/** The Scene's writing surface (Keyframes' settled SceneDoc markup), with the film's ink steps. */
function SceneProse({ ink, caret }: { ink: number; caret: number }) {
  const dim: CSSProperties | undefined = ink < 1 ? { opacity: ink } : undefined;
  const caretStyle: CSSProperties = {
    display: "inline-block",
    width: 2,
    height: "1.08em",
    marginLeft: 1,
    marginRight: -3,
    verticalAlign: "-0.18em",
    background: "var(--r2-ms-caret)",
    opacity: caret,
  };
  return (
    <div className="r2-writing">
      <article className="r2-doc r2-doc--manuscript">
        <header className="r2-doc-head" style={dim}>
          <p className="r2-doc-eyebrow">The East Stair</p>
          <h1 className="r2-doc-title">
            <span className="r2-doc-title-text">{SCENE.title}</span>
          </h1>
        </header>
        <div className="r2-scenes">
          <section className="r2-scene">
            <div className="r2-prose">
              <div className="ProseMirror tiptap">
                {PROSE.map((p, i) => (
                  <p key={i} style={i === 3 ? undefined : dim}>
                    {p}
                    {i === 3 && <span style={caretStyle} />}
                  </p>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}

const base = PLANS["the-pause"];
const plan = (opts: { panel: boolean; ink?: number; caret?: number }): Plan => ({
  ...base,
  cursor: undefined,
  panel: opts.panel ? "notes" : undefined,
  mainNode: <SceneProse ink={opts.ink ?? 1} caret={opts.caret ?? 1} />,
});

const probes = [
  {
    id: "closed",
    node: (
      <Window>
        <ShellFor plan={plan({ panel: false })} />
      </Window>
    ),
    anchors: [
      { key: "sentence", selector: ".r2-prose p", text: SENTENCE },
      { key: "notesAction", selector: ".r2-contextbar-panel .r2-action", mode: "box" as const },
      { key: "inspectorAction", selector: ".r2-contextbar-panel .r2-action--icon", mode: "box" as const },
    ],
  },
  {
    id: "open",
    node: (
      <Window>
        <ShellFor plan={plan({ panel: true })} />
      </Window>
    ),
    anchors: [
      { key: "sentence", selector: ".r2-prose p", text: SENTENCE },
      { key: "excerpt", selector: ".r2-rnote-excerpt", text: SENTENCE },
      { key: "excerptBox", selector: ".r2-rnote-excerpt", mode: "box" as const },
    ],
  },
];

// ── Geometry under a widening panel ────────────────────────────────────────

const panelWidth = (t: number) => PANEL_W * span(t, T.panel, 0.3, EASE_FRAME);

/** The slip cut around the source line: the run, a little paper either side. */
const slipBox = (m: Measured) => ({ x: m.text.x - 8, y: m.text.cy - m.style.fontSize * 0.78, w: m.text.w + 16, h: m.style.fontSize * 1.56 });

/** Measured, shifted horizontally. */
const shifted = (m: Measured, dx: number): Measured => ({ ...m, box: { ...m.box, x: m.box.x + dx }, text: { ...m.text, x: m.text.x + dx } });

/**
 * The prose line as the panel opens: the writing column holds its centred edge
 * until it no longer fits beside the panel, then gives way to the left
 * (rune2.css --r2-doc-offset: clamp(0, centred, 100cqw − doc width)) — so its
 * x is min(closed, open + (320 − w)), exactly.
 */
function sentenceAt(m: Probes, w: number): Measured {
  const closed = m.closed.sentence;
  const open = m.open.sentence;
  return shifted(closed, Math.min(0, open.text.x + (PANEL_W - w) - closed.text.x));
}
/** The panel's content is left-aligned in a sheet anchored to the right: it slides in with the sheet's edge. */
const excerptAt = (m: Probes, w: number) => shifted(m.open.excerpt, PANEL_W - w);

// ── Camera ─────────────────────────────────────────────────────────────────

/** A camera re-expressed as pinning world point P (same picture, different pin) — so two framings interpolate about one point. */
function repin(c: CameraState, P: Point): CameraState {
  return { x: P.x, y: P.y, s: c.s, ax: c.ax + (P.x - c.x) * c.s, ay: c.ay + (P.y - c.y) * c.s };
}

function camera(t: number, m: Probes): CameraState {
  const P = { x: m.closed.sentence.text.x + m.closed.sentence.text.w / 2, y: m.closed.sentence.text.cy };
  const a = repin(base.camera, P);
  const b = repin(PLANS["revision-notes"].camera, P);
  // Attention narrowing: a lean of 1.5% on each tick, about the sentence (caused by the tick, like the ink).
  const lean = 1 + 0.015 * span(t, T.tick1, 0.45, SETTLE) + 0.015 * span(t, T.tick2, 0.45, SETTLE);
  // The camera follows the quotation: it leaves a few frames after it and arrives a few after it lands.
  const p = span(t, T.lift + 0.08, T.carry + 0.05, CAMERA);
  return { x: P.x, y: P.y, s: logLerp(a.s * lean, b.s, p), ax: lerp(a.ax, b.ax, p), ay: lerp(a.ay, b.ay, p) };
}

/** The slip is lifted, so it may pass over the (dimmed) prose: a hand's arc. */
const PATH: Path = { kind: "arc", lift: 0.12 };

const toScreen = (c: CameraState, q: Point) => ({ x: c.ax + (q.x - c.x) * c.s, y: c.ay + (q.y - c.y) * c.s });

// ── The pointer ────────────────────────────────────────────────────────────

function pointer(t: number, m: Probes): { x: number; y: number; pressed: boolean } {
  const rest = { x: base.cursor!.x, y: base.cursor!.y };
  const notes = m.closed.notesAction.box;
  const insp = m.closed.inspectorAction.box;
  const onNotes = { x: notes.x + notes.w * 0.42, y: notes.y + notes.h * 0.55 };
  const onInsp = { x: insp.x + insp.w * 0.45, y: insp.y + insp.h * 0.55 };
  const p1 = span(t, T.reach, T.click - T.reach - 0.04, EASE);
  const p2 = span(t, T.onward, 0.5, EASE);
  const x = lerp(lerp(rest.x, onNotes.x, p1), onInsp.x, p2);
  const y = lerp(lerp(rest.y, onNotes.y, p1), onInsp.y, p2);
  return { x, y, pressed: t >= T.click && t < T.click + 0.1 };
}

// ── The frame ──────────────────────────────────────────────────────────────

function frame(t: number, m: Probes) {
  const scope = frameScope(t);
  const w = panelWidth(t);
  const open = w > 0.5;
  // The thinking motif, made visible: the caret blinks on each tick; the click takes focus to the panel.
  const caretKeys = [0, 0.32, T.tick1, T.tick1 + 0.28, T.tick2, T.tick2 + 0.3, 1.8];
  let caret = 0;
  for (let i = 0; i < caretKeys.length; i++) if (t >= caretKeys[i]) caret = i % 2 === 0 ? 1 : 0;
  if (t >= T.click) caret = 0;
  // Ink: two steps down on the ticks, back up once the quotation has landed (frame 06 is full ink).
  const ink =
    t < T.reink
      ? 1 - 0.42 * span(t, T.tick1, 0.3, SETTLE) - 0.3 * span(t, T.tick2, 0.3, SETTLE)
      : lerp(0.28, 1, span(t, T.reink, 0.6, SETTLE));

  const cam = camera(t, m);
  const p = span(t, T.lift, T.carry, CARRY);
  const carrying = t >= T.pickup && t < T.handoff;
  // Picked up: the slip's shadow rises and it grows 2.5% toward the viewer; set down: both settle into the panel.
  const picked = span(t, T.pickup, 0.16, SETTLE);
  const landed = span(p, 0.72, 0.28, SETTLE);
  const raise = 1 + 0.025 * picked * (1 - landed);
  const from = sentenceAt(m, w);
  const to = excerptAt(m, w);
  const quotes = span(t, T.quotes, 0.22, SETTLE);
  const rule = span(t, T.quotes + 0.04, 0.2, SETTLE);
  const box = m.open.excerptBox.box;

  // Motion blur on the carrier only: along its screen path, in proportion to its screen speed.
  const at = (u: number) => toScreen(camera(u, m), carrierAt(sentenceAt(m, panelWidth(u)), excerptAt(m, panelWidth(u)), span(u, T.lift, T.carry, CARRY), PATH).at);
  const a0 = at(t - 0.5 / 30);
  const a1 = at(t + 0.5 / 30);
  const speed = Math.hypot(a1.x - a0.x, a1.y - a0.y);
  // σ ≈ 4% of the per-frame travel, at most 3px on screen: it reads as speed and the words stay words (principle 11).
  const sigma = speed > 10 ? Math.min(3, 0.04 * speed) / cam.s : 0;
  const c = carrierAt(from, to, p, PATH);
  const region = { x: c.at.x - 60, y: c.at.y - 80, w: 320, h: 160 };

  const css = `
    [data-pf="${scope}-a"] .r2-panel[data-open] { width: ${w}px !important; }
    [data-pf="${scope}-a"] .r2-panel[data-open] .r2-panel-inner { opacity: ${span(t, T.panel + 0.04, 0.3, EASE_FRAME)} !important; }
    ${t < T.handoff ? `[data-pf="${scope}-a"] .r2-rnote:first-child .r2-rnote-excerpt { visibility: hidden; }` : ""}
    ${t >= T.reach + 0.4 && t < T.click ? `[data-pf="${scope}-a"] .r2-contextbar-panel > .r2-action:first-child { background: var(--r2-hover); }` : ""}
    ${t >= T.onward + 0.42 ? `[data-pf="${scope}-a"] .r2-contextbar-panel > .r2-action--icon { background: var(--r2-hover); }` : ""}
  `;
  const ptr = pointer(t, m);

  return (
    <Field>
      <Camera state={cam}>
        <Window>
          <div data-pf={`${scope}-a`}>
            <style>{css}</style>
            <ShellFor plan={plan({ panel: open, ink, caret })} />
            {/* FILM-ONLY: the excerpt's own 2px rule, drawn down as the quotation lands (its real border is hidden until the hand-off). */}
            {carrying && rule > 0 && (
              <div style={{ position: "absolute", left: box.x + (PANEL_W - w), top: box.y, width: 2, height: box.h * rule, background: "var(--r2-border-strong)", borderRadius: "0 1px 1px 0" }} />
            )}
            {/* FILM-ONLY: the quotation — a copy of the line lifted as a slip of the page; the original never leaves the Scene. */}
            {carrying && (
              <DirectionalBlur id={`pf-a-blur-${Math.round(t * 1000)}`} angle={Math.atan2(a1.y - a0.y, a1.x - a0.x)} amount={sigma} region={region}>
                <Slip from={from} to={to} fromBox={slipBox(from)} toBox={shifted(m.open.excerptBox, PANEL_W - w).box} at={c.at} size={c.size * raise} opacity={picked * (1 - landed)} />
                <TextCarrier text={SENTENCE} from={from} to={to} p={p} swap={clamp01((p - 0.3) / 0.4)} path={PATH} scale={raise} />
                {quotes > 0 && <Quotes at={c.at} size={c.size} style={to.style} opacity={quotes} words={to.text.w * (c.size / to.style.fontSize)} />}
              </DirectionalBlur>
            )}
          </div>
        </Window>
        <Cursor x={ptr.x} y={ptr.y} opacity={1} pressed={ptr.pressed} size={CURSOR / cam.s} />
      </Camera>
    </Field>
  );
}

/** The quotation marks closing around the words as they land (the real excerpt: “…”). */
function Quotes({ at, size, style, opacity, words }: { at: Point; size: number; style: Measured["style"]; opacity: number; words: number }) {
  const k = size / style.fontSize;
  const type: CSSProperties = {
    position: "absolute",
    top: -style.lineHeight / 2,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    lineHeight: `${style.lineHeight}px`,
    color: style.color,
    whiteSpace: "pre",
  };
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${at.x}px, ${at.y}px) scale(${k})`, transformOrigin: "0 0", opacity }}>
      <span style={{ ...type, right: 0 }}>“</span>
      <span style={{ ...type, left: words / k }}>”</span>
    </div>
  );
}

// ── Sound and phases ───────────────────────────────────────────────────────

const cues: Cue[] = [
  { at: T.tick1, src: pulseA, volume: 0.55, seconds: 0.16, note: "tick — the caret blinks, the Scene steps down" },
  { at: T.tick2, src: pulseB, volume: 0.5, seconds: 0.16, note: "tick — one line left at full ink" },
  { at: T.click - 0.03, src: clickSound, volume: 0.5, seconds: 0.15, note: "the click on Revision Notes (covers the panel's open)" },
  { at: T.tick3, src: pulseA, volume: 0.42, seconds: 0.16, note: "the motif resumes once the note is read" },
  { at: T.tick4, src: pulseB, volume: 0.38, seconds: 0.16, note: "tick" },
];

const phases: Phase[] = [
  { from: 0, to: T.tick1, kind: "authentic", label: "Frame 05 · the pause" },
  { from: T.tick1, to: T.reach, kind: "film-only", label: "the motif: caret blink + ink steps" },
  { from: T.reach, to: T.lift, kind: "authentic", label: "Revision Notes opens (product speed)" },
  { from: T.lift, to: T.handoff, kind: "film-only", label: "a copy of the line carries into the anchor" },
  { from: T.handoff, to: T.end + 1, kind: "authentic", label: "Frame 06 · Revision Notes" },
];

export const STUDY_A: StudyDef = { id: "A", duration: T.end, probes, phases, cues, frame };
export const STUDY_A_STRIP = [0, 0.7, 1.3, 1.98, 2.2, 2.4, 2.6, 2.8, 3.0, 3.16, 3.5, 5.8];
