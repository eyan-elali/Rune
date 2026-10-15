import type { CSSProperties } from "react";
import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE, EASE_FRAME } from "../../../foundation/time";
import { SCENE, SCENE_OPEN_LINE, SCENE_OPEN_TYPED, SCENE_PROSE } from "../../../data/salt-house";
import { PLANS, ShellFor, Window, type Plan } from "../Keyframes";
import { CAMERA, SETTLE, cameraAbout, lerp, span, type Rect } from "./motion";
import type { Probes } from "./probe";
import { scoped } from "./layers";
import { Field, frameScope, type Cue, type Phase, type StudyDef } from "./Study";
import keyA from "../../../audio/key-1.wav";
import keyC from "../../../audio/key-3.wav";
import keyEnd from "../../../audio/key-end.wav";
import pulseA from "../../../audio/pulse-1.wav";
import pulseB from "../../../audio/pulse-2.wav";
import clickSound from "../../../audio/click.wav";
import sheetSound from "../../../audio/sheet.wav";

// STUDY A V2 — the pause → Revision Notes. QUIET PRODUCT INTERACTION.
//
// Authentic source: frame 05 (the Scene; the caret after "Seventeen was
// empty."). Authentic destination: frame 06 (Revision Notes; the first note
// anchored to that sentence).
//
// What changed from V1: nothing travels. V1 lifted a copy of the sentence and
// carried it across the window into the note — it read as duplicate text
// moving through UI. Here the connection is made by recognition: the viewer
// has just watched the sentence being finished and thought about; the panel
// opens at the product's own speed; the note's excerpt is that sentence. The
// one echo is a shared anchor tone (the product's own, --r2-accent-soft-hover)
// on the line and on its quotation together, once, for under a second.
//
// The thinking: the last keystrokes land; the caret holds, then blinks — and
// each tick is a blink, taking the rest of the Scene one step quieter while
// the line stays at full ink. The click returns the page to full ink: the
// thought has become a note.

const LINE = "Seventeen was empty.";
const PANEL_W = 320; // rune2.css --r2-panel-width
const CURSOR = 30 / 20;

// ── The event grid (seconds) ───────────────────────────────────────────────
const T = {
  keys: [0.1, 0.19, 0.33] as const, // "ty." — the line finished
  tick1: 1.12, // the caret returns on each tick
  tick2: 1.68,
  reach: 1.86, // the pointer goes to Revision Notes
  click: 2.34,
  panel: 2.36, // the panel opens: 300ms on --r2-ease-frame (product speed)
  echo: 2.74, // the shared anchor tone, once the note is there
  end: 4.2,
};

// ── Authentic states ───────────────────────────────────────────────────────

const PROSE = [...SCENE_PROSE.slice(0, 3), LINE, SCENE_OPEN_LINE + SCENE_OPEN_TYPED];

/** The Scene's writing surface (Keyframes' settled SceneDoc markup): the line being finished, the film's ink steps. */
function SceneProse({ typed, ink, caret }: { typed: number; ink: number; caret: number }) {
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
                    {i === 3 ? p.slice(0, p.length - 3 + typed) : p}
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
const plan = (opts: { panel: boolean; typed?: number; ink?: number; caret?: number }): Plan => ({
  ...base,
  cursor: undefined,
  panel: opts.panel ? "notes" : undefined,
  mainNode: <SceneProse typed={opts.typed ?? 3} ink={opts.ink ?? 1} caret={opts.caret ?? 1} />,
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
      { key: "sentence", selector: ".r2-prose p", text: LINE },
      { key: "notesAction", selector: ".r2-contextbar-panel .r2-action", mode: "box" as const },
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
      { key: "sentence", selector: ".r2-prose p", text: LINE },
      { key: "excerpt", selector: ".r2-rnote-excerpt", text: LINE },
    ],
  },
];

// ── The camera ─────────────────────────────────────────────────────────────

/** Frame 05 → frame 06 about the line; a lean of 1.5% on each tick (attention narrowing, caused by the tick). */
function camera(t: number, m: Probes): CameraState {
  const P = { x: m.closed.sentence.text.x + m.closed.sentence.text.w / 2, y: m.closed.sentence.text.cy };
  const lean = 1 + 0.015 * span(t, T.tick1, 0.45, SETTLE) + 0.015 * span(t, T.tick2, 0.45, SETTLE);
  const f05 = { ...base.camera, s: base.camera.s * lean };
  // The reframe follows the panel, a beat behind it (the world responds), and lands softly.
  return cameraAbout(f05, PLANS["revision-notes"].camera, P, span(t, T.panel + 0.06, 0.95, CAMERA));
}

// ── The frame ──────────────────────────────────────────────────────────────

/** The caret: solid while typing and for a moment after; then a blink whose returns are the ticks; the click takes focus. */
function caretAt(t: number) {
  if (t >= T.click) return 0;
  const on = [
    [0, 0.82],
    [T.tick1, T.tick1 + 0.3],
    [T.tick2, T.tick2 + 0.3],
  ];
  return on.some(([a, b]) => t >= a && t < b) ? 1 : 0;
}

/** The product's anchor tone (::highlight(r2-anchor)), laid over a run of text. */
function Anchor({ box, amount }: { box: Rect; amount: number }) {
  if (amount <= 0.001) return null;
  return <div style={{ position: "absolute", left: box.x - 2, top: box.y, width: box.w + 4, height: box.h, borderRadius: 2, background: "var(--r2-accent-soft-hover)", mixBlendMode: "multiply", opacity: amount, pointerEvents: "none" }} />;
}

function frame(t: number, m: Probes) {
  const scope = frameScope(t);
  const typed = T.keys.filter((k) => t >= k).length;
  const w = PANEL_W * span(t, T.panel, 0.3, EASE_FRAME);
  const open = w > 0.5;
  // Ink: two steps down on the ticks; back to full as the panel opens (frame 06 is full ink).
  const quiet = 1 - 0.3 * span(t, T.tick1, 0.3, SETTLE) - 0.2 * span(t, T.tick2, 0.3, SETTLE);
  const ink = lerp(quiet, 1, span(t, T.panel + 0.02, 0.45, SETTLE));
  const cam = camera(t, m);
  const echo = span(t, T.echo, 0.18, SETTLE) * (1 - span(t, T.echo + 0.5, 0.45, SETTLE));

  const css = scoped(`${scope}-a`, {
    ".r2-panel[data-open]": `width: ${w}px !important;`,
    ".r2-panel[data-open] .r2-panel-inner": `opacity: ${span(t, T.panel + 0.04, 0.3, EASE_FRAME)} !important;`,
    ...(t >= T.reach + 0.38 && t < T.click ? { ".r2-contextbar-panel > .r2-action:first-child": "background: var(--r2-hover);" } : {}),
  });

  // The pointer: from rest to Revision Notes, click; it stays there.
  const notes = m.closed.notesAction.box;
  const onNotes = { x: notes.x + notes.w * 0.42, y: notes.y + notes.h * 0.55 };
  const p = span(t, T.reach, T.click - T.reach - 0.04, EASE);
  const ptr = { x: lerp(base.cursor!.x, onNotes.x, p), y: lerp(base.cursor!.y, onNotes.y, p) };

  return (
    <Field>
      <Camera state={cam}>
        <Window>
          <div data-pf={`${scope}-a`}>
            <style>{css}</style>
            <ShellFor plan={plan({ panel: open, typed, ink, caret: caretAt(t) })} />
            {/* FILM-ONLY: one shared anchor tone, on the line and on its quotation, together, once. */}
            <Anchor box={m.open.sentence.box} amount={echo} />
            <Anchor box={m.open.excerpt.box} amount={echo} />
          </div>
        </Window>
        <Cursor x={ptr.x} y={ptr.y} opacity={1} pressed={t >= T.click && t < T.click + 0.1} size={CURSOR / cam.s} />
      </Camera>
    </Field>
  );
}

// ── Sound and phases ───────────────────────────────────────────────────────

const cues: Cue[] = [
  { at: T.keys[0] - 0.012, src: keyA, volume: 0.4, seconds: 0.12, note: "t" },
  { at: T.keys[1] - 0.012, src: keyC, volume: 0.4, seconds: 0.12, note: "y" },
  { at: T.keys[2] - 0.012, src: keyEnd, volume: 0.42, seconds: 0.12, note: ". — typing stops; then silence" },
  { at: T.tick1, src: pulseA, volume: 0.55, seconds: 0.16, note: "tick — the caret returns; the Scene steps down" },
  { at: T.tick2, src: pulseB, volume: 0.5, seconds: 0.16, note: "tick — one line left at full ink" },
  { at: T.click - 0.03, src: clickSound, volume: 0.48, seconds: 0.15, note: "the click on Revision Notes" },
  { at: T.panel + 0.02, src: sheetSound, volume: 0.22, seconds: 0.24, note: "a subtle panel-open: a soft brush of paper" },
];

const phases: Phase[] = [
  { from: 0, to: T.tick1, kind: "authentic", label: "Frame 05 · the line finished; the caret holds" },
  { from: T.tick1, to: T.reach, kind: "film-only", label: "the motif: caret blink + the Scene steps down" },
  { from: T.reach, to: T.echo, kind: "authentic", label: "Revision Notes opens (product speed)" },
  { from: T.echo, to: T.echo + 0.95, kind: "film-only", label: "one shared anchor tone: line and quotation" },
  { from: T.echo + 0.95, to: T.end + 1, kind: "authentic", label: "Frame 06 · Revision Notes" },
];

export const STUDY_AV2: StudyDef = { id: "AV2", duration: T.end, probes, phases, cues, frame };
export const STUDY_AV2_STRIP = [0.05, 0.4, 1.0, 1.2, 1.75, 2.2, 2.42, 2.55, 2.75, 2.95, 3.4, 4.1];
