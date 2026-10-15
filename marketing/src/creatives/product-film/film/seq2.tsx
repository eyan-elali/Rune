import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE, EASE_FRAME } from "../../../foundation/time";
import { WORKSPACE } from "../../../data/salt-house";
import { PLANS, ShellFor, Window } from "../Keyframes";
import { CAMERA, SETTLE, cameraAbout, lerp, span, toScreen, type Point } from "../studies/motion";
import type { Probes } from "../studies/probe";
import { scoped } from "../studies/layers";
import { Field, frameScope } from "../studies/Study";
import { AnchorTone, CURSOR, mid } from "./common";
import { scenePlan } from "./states";
import { T } from "./timeline";

// 2 · THE WRITER THINKS. Study A V2's grammar, and nothing travels: the caret
// holds; each tick is a blink that takes the rest of the Scene one step
// quieter while "Seventeen was empty." stays at full ink; Revision Notes opens
// at the product's speed; the line and its quotation share the anchor tone
// once. Then an ordinary click: the Inspector. The writer scrolls it to
// Research; attention narrows on 1998 Guest Ledger.
//
// AUTHENTIC: the Scene, Revision Notes (300ms on --r2-ease-frame), the
// Inspector and its scroll. FILM-ONLY: the ink steps, the shared anchor tone,
// the 1.5% leans.

const PANEL_W = 320;
/** The lean onto the link: the Research link held where it is on screen while the frame narrows around it. */
const LEAN_S = 1.82;

export const linkPoint = (m: Probes): Point => ({ x: m.insp.link.text.x + m.insp.link.text.w / 2, y: m.insp.link.text.cy });

export function cam2(t: number, m: Probes): CameraState {
  const P = { x: m.pause.sentence.text.x + m.pause.sentence.text.w / 2, y: m.pause.sentence.text.cy };
  const base = PLANS["the-pause"].camera;
  const tick = 1 + 0.015 * span(t, T.tick1, 0.45, SETTLE) + 0.015 * span(t, T.tick2, 0.45, SETTLE);
  const pause = { ...base, s: base.s * tick };
  // Revision Notes: the frame makes room for the panel a beat behind it, about the line (frame 06: the whole Scene beside its notes).
  const notes = cameraAbout(pause, PLANS["revision-notes"].camera, P, span(t, T.notes + 0.08, 0.95, CAMERA));
  // The Inspector keeps that composition (no cropped prose); then the frame narrows onto the link, the link held where it is on screen.
  const L = linkPoint(m);
  const at = toScreen(notes, L);
  return cameraAbout(notes, { x: L.x, y: L.y, s: LEAN_S, ax: at.x, ay: at.y }, L, span(t, T.lean, T.ledger - T.lean + 0.02, CAMERA));
}

/** The caret: solid when the Scene opens; then a blink whose returns are the ticks; the click takes focus to the panel. */
export function caretAt(t: number) {
  if (t >= T.notes) return 0;
  const on = [
    [T.revise, T.tick1 - 0.42],
    [T.tick1, T.tick1 + 0.3],
    [T.tick2, T.tick2 + 0.3],
  ];
  return on.some(([a, b]) => t >= a && t < b) ? 1 : 0;
}

export function frame2(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cam2(t, m);
  const w = PANEL_W * span(t, T.notes + 0.02, 0.3, EASE_FRAME);
  const quiet = 1 - 0.3 * span(t, T.tick1, 0.3, SETTLE) - 0.2 * span(t, T.tick2, 0.3, SETTLE);
  const ink = lerp(quiet, 1, span(t, T.notes + 0.04, 0.45, SETTLE));
  const echo = span(t, T.echo, 0.18, SETTLE) * (1 - span(t, T.echo + 0.45, 0.42, SETTLE));

  // The panel: nothing → Revision Notes (opening at product speed) → the Inspector (its content changes, the sheet stays).
  const inInspector = t >= T.insp + 0.08;
  const panel = t < T.notes + 0.02 ? undefined : inInspector ? "inspector-scene" : "notes";
  const scroll = 160 * span(t, T.scroll, T.scrollDur, EASE);
  const plan = scenePlan({ panel, panelScroll: inInspector ? scroll : undefined, ink, caret: caretAt(t), hoverLink: t >= T.hoverLink ? WORKSPACE.ledger.title : undefined });
  const body = inInspector ? span(t, T.insp + 0.08, 0.16, EASE) : 1 - span(t, T.insp, 0.08, EASE);
  const css = scoped(`${scope}-s2`, {
    ".r2-panel[data-open]": `width: ${w}px !important;`,
    ".r2-panel[data-open] .r2-panel-inner": `opacity: ${span(t, T.notes + 0.06, 0.3, EASE_FRAME)} !important;`,
    ".r2-panel[data-open] .r2-panel-body": `opacity: ${body} !important;`,
    ...(t >= T.notes - 0.12 && t < T.notes ? { ".r2-contextbar-panel > .r2-action:first-child": "background: var(--r2-hover);" } : {}),
    ...(t >= T.insp - 0.12 && t < T.insp ? { ".r2-contextbar-panel > .r2-action--icon": "background: var(--r2-hover);" } : {}),
  });

  // The pointer: in from the right to Revision Notes; along to the Inspector; down into the panel to scroll; onto the link.
  const rest = PLANS["the-pause"].cursor!;
  const notesAt = { x: m.pause.notesAction.box.x + m.pause.notesAction.box.w * 0.42, y: mid(m.pause.notesAction.box).y + 1 };
  const inspAt = { x: mid(m.notes.inspAction.box).x, y: mid(m.notes.inspAction.box).y + 1 };
  const L = linkPoint(m);
  const scrollAt = { x: L.x + 10, y: L.y + 150 };
  const linkAt = { x: L.x + 18, y: L.y + 4 };
  const legs: [number, number, Point, Point][] = [
    [T.reachNotes, T.notes - 0.04, rest, notesAt],
    [T.reachInsp, T.insp - 0.04, notesAt, inspAt],
    [T.insp + 0.12, T.scroll + 0.05, inspAt, scrollAt],
    [T.reachLink, T.hoverLink, scrollAt, linkAt],
  ];
  let ptr = rest;
  for (const [a, b, from, to] of legs) if (t >= a) ptr = { x: lerp(from.x, to.x, span(t, a, b - a, EASE)), y: lerp(from.y, to.y, span(t, a, b - a, EASE)) };
  const ptrO = span(t, T.reachNotes - 0.05, 0.2, EASE);
  const pressed = (t >= T.notes && t < T.notes + 0.1) || (t >= T.insp && t < T.insp + 0.1);

  return (
    <Field>
      <Camera state={cam}>
        <Window>
          <div data-pf={`${scope}-s2`}>
            <style>{css}</style>
            <ShellFor plan={plan} />
            {/* FILM-ONLY: the line and its quotation, lit together once. */}
            {!inInspector && (
              <>
                <AnchorTone box={m.notes.sentence.box} amount={echo} />
                <AnchorTone box={m.notes.excerpt.box} amount={echo} />
              </>
            )}
          </div>
        </Window>
        {ptrO > 0.001 && <Cursor x={ptr.x} y={ptr.y} opacity={ptrO} pressed={pressed} size={CURSOR / cam.s} />}
      </Camera>
    </Field>
  );
}
