import { Easing } from "remotion";
import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE, EASE_FRAME, typedCount, typingSchedule } from "../../../foundation/time";
import { MANUSCRIPT_WORDS, PART_I, SCENE, SCENE_OPEN_LINE, SCENE_OPEN_TYPED, SCENE_PROSE, WORKSPACE } from "../../../data/salt-house";
import { ManuscriptDoc } from "../../../ui/Manuscript";
import type { NavSectionSpec } from "../../../ui/Navigator";
import { DocStatus } from "../../../ui/Shell";
import { PLANS, ShellFor, Window, navSections, on, type Plan } from "../Keyframes";
import { CAMERA, SETTLE, arc, clamp01, lerp, span } from "../studies/motion";
import type { Probes } from "../studies/probe";
import { scoped } from "../studies/layers";
import { Field, frameScope } from "../studies/Study";
import { CURSOR, FADE_IN, blendCam, mid, writingCss } from "./common";
import { LAST, REST, SEGMENTS, TemporalColumn, arrivalTimes, frontAt, geometry, segmentAt, written, type StreamGeometry } from "./growth";
import { scenePlan } from "./states";
import { T } from "./timeline";
import { caretAt } from "./seq2";

// 1 · THE BOOK GROWS. OUTSIDE → MANUSCRIPT → PROSE, then months in seconds.
//
// The first frame is medium-wide: a writing environment, its navigator and
// chrome, the manuscript at its centre. The writer is typing, and the camera
// is already entering the writing; by ~1s it is close on the prose, and the
// chrome has receded (the app's own data-writing), while the navigator falls
// back a little in priority (film-only). Then time compresses: the camera
// opens to the structure, which comes forward sharp and still; the editor
// becomes the temporal layer (growth.tsx) — the book written through it on
// one inertial curve, blurred only by its own speed; rows arrive, the count
// climbs. It slows, drifts a few pixels, rests. Stillness. Only then does a
// hand return — the chrome with it — and climb back to Part I: The Key
// Cabinet, to revise something earlier.
//
// AUTHENTIC: the writing Scene and chrome; the draft and finished navigator;
// the last Chapter at rest; the Scene. FILM-ONLY: the navigator's recession
// during the push; the time compression (stream, front, blur).

// ── The opening line ───────────────────────────────────────────────────────

const OPEN_FROM = 6; // " long " is already there at the first frame: the writer types the rest of the line at normal speed (~2s)
const OPEN_TIMES = typingSchedule(SCENE_OPEN_TYPED.slice(OPEN_FROM), T.type, 31, 1.05);
export const OPEN_KEYS = OPEN_TIMES;
const wordsIn = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// ── The navigator, growing ─────────────────────────────────────────────────

const DRAFT_NAV = navSections({ ...PLANS.writing });
const FULL_NAV = navSections({ ...PLANS["the-pause"] });
const DRAFT_IDS = new Set(DRAFT_NAV.flatMap((s) => s.rows.map((r) => r.id)));
const DRAFT_RESEARCH = DRAFT_NAV.find((s) => s.id === "workspace")!.rows.find((r) => r.id === WORKSPACE.research.id)!;
const DRAFT_COUNT = DRAFT_NAV.find((s) => s.id === "manuscript")!.count!;

function growthNav(t: number, g: StreamGeometry, selected: string, hover?: string): NavSectionSpec[] {
  const at = arrivalTimes(g);
  const reveal = (id: string) => {
    const a = at.get(id);
    return a === undefined ? 1 : SETTLE(clamp01((t - a) / 0.24));
  };
  const ledgerAt = at.get(WORKSPACE.ledger.id)!;
  return FULL_NAV.map((sec) => {
    if (sec.id === "unplaced") {
      const r = reveal("unplaced");
      return { ...sec, reveal: r < 1 ? r : undefined };
    }
    const rows = sec.rows.flatMap((row) => {
      const r = DRAFT_IDS.has(row.id) ? 1 : reveal(row.id);
      if (r <= 0) return [];
      // The Research folder opens when its first Page arrives.
      const base = row.id === WORKSPACE.research.id && t < ledgerAt ? DRAFT_RESEARCH : row;
      return [{ ...base, selected: row.id === selected, hover: row.id === hover, reveal: r < 1 ? r : undefined }];
    });
    // The count climbs with the writing itself: fastest at the peak of the lapse, easing as time returns.
    const count = sec.id === "manuscript" ? Math.round(lerp(DRAFT_COUNT, MANUSCRIPT_WORDS, written(t))) : sec.count;
    return { ...sec, rows, count };
  });
}

/** The lapse's plan: the temporal column in the editor, the structure growing beside it. */
function growthPlan(t: number, m: Probes, scope: string, hover?: string): Plan {
  const g = geometry(m);
  const i = segmentAt(t, g);
  const s = SEGMENTS[i];
  const f = clamp01((frontAt(t, g) - g.tops[i]) / Math.max(g.ends[i] - g.tops[i], 1));
  const resting = t >= REST;
  // At rest: the last Chapter of the draft, the caret at its end, blinking at the platform's rate.
  const caret = resting && Math.floor((t - REST) / 0.53) % 2 === 0 ? 1 : 0;
  const trail = i === 0 || i === 1 ? ["Manuscript", PART_I.title, s.eyebrow, s.title] : ["Manuscript", s.eyebrow, s.title];
  return {
    ...PLANS["the-pause"],
    cursor: undefined,
    nav: growthNav(t, g, s.id, hover),
    trail,
    tabs: [{ key: "lapse", label: s.title, active: true }],
    mainNode: <TemporalColumn t={t} g={g} scope={scope} caret={i === LAST ? caret : 0} />,
    status: <DocStatus words={i === 0 ? SCENE.words : Math.round(s.words * lerp(0.1, 1, f))} state={resting ? "Saved" : "Saving…"} />,
  };
}

// ── The camera ─────────────────────────────────────────────────────────────

/** The first frame: medium-wide — the navigator, the chrome, the manuscript at the centre. Not the whole window. */
const OPEN_WIDE = on(724, 390, 1.4);
/** Close on the prose (frame 01). */
const WRITE_CAM = PLANS.writing.camera;
/** The push: under way from the first frame, gathering, then a long arrival — following the writer's attention in. */
const PUSH = Easing.bezier(0.5, 0.0, 0.22, 1);
/** The lapse: the navigator whole and sharp at the left, the editor beside it… */
const GROW_A = on(646, 384, 1.5);
/** …opening a little as the structure extends downward… */
const GROW_B = on(690, 404, 1.4);
/** …and settling back toward the last Chapter as time slows. Still before the hand returns. */
const GROW_REST = on(658, 398, 1.47);

export function cam1(t: number, m: Probes): CameraState {
  const kcY = mid(m.pause.kcRow.box).y;
  let cam = blendCam(OPEN_WIDE, WRITE_CAM, span(t, T.push, T.pushDur, PUSH));
  cam = blendCam(cam, GROW_A, span(t, T.grow - 0.2, 1.1, CAMERA)); // as the line's last words land: the lapse inherits their momentum
  cam = blendCam(cam, GROW_B, span(t, T.grow + 0.55, 1.3, CAMERA));
  cam = blendCam(cam, GROW_REST, span(t, T.grow + 1.55, REST - (T.grow + 1.55) - 0.06, CAMERA));
  // The hand climbs back to Part I; the frame goes with it.
  const pc = span(t, T.climb, T.revise - T.climb + 0.1, CAMERA);
  cam = { ...cam, y: lerp(cam.y, Math.max(330, kcY + 110), pc) };
  return blendCam(cam, PLANS["the-pause"].camera, span(t, T.toPause, T.toPauseDur, CAMERA));
}

// ── The frame ──────────────────────────────────────────────────────────────

export function frame1(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cam1(t, m);
  // We arrive in a session already under way: the chrome is away from the first frame (the writer was writing before
  // we came), and it comes back only when the hand moves for the climb.
  const writing = 1 - span(t, T.climb + 0.05, FADE_IN, EASE_FRAME);
  // FILM-ONLY: as the camera follows attention into the prose, the navigator falls back a little; the lapse brings it forward, sharp.
  const navInk = 1 - 0.32 * span(t, 0.2, 0.9, SETTLE) * (1 - span(t, T.grow, 0.7, SETTLE));
  let plan: Plan;
  if (t < T.grow) {
    const n = OPEN_FROM + typedCount(Math.round(t * 30), OPEN_TIMES);
    const done = n >= SCENE_OPEN_TYPED.length;
    // The caret holds while typing; once the line is finished it blinks (530ms, the platform's rate).
    const caret = !done || Math.floor((t - OPEN_TIMES[OPEN_TIMES.length - 1]) / 0.53) % 2 === 0 ? 1 : 0;
    plan = {
      ...PLANS.writing,
      mainNode: <ManuscriptDoc eyebrow="The East Stair" title={SCENE.title} paragraphs={SCENE_PROSE} openLine={SCENE_OPEN_LINE} typed={SCENE_OPEN_TYPED.slice(0, n)} caret={caret} />,
      status: <DocStatus words={SCENE.words - wordsIn(SCENE_OPEN_TYPED) + wordsIn(SCENE_OPEN_TYPED.slice(0, n))} state={done ? "Saved" : "Saving…"} />,
    };
  } else if (t < T.revise) {
    plan = growthPlan(t, m, `${scope}-s1`, t >= T.revise - 0.22 ? SCENE.id : undefined);
  } else {
    // The Key Cabinet, chosen: the finished navigator, the Scene, the caret where the writer left it. Stillness.
    plan = scenePlan({ caret: caretAt(t) });
  }

  // The pointer: absent while the writer types and while time is compressed; it returns only once the page is still.
  const row = m.pause.kcRow.box;
  const target = { x: row.x + 74, y: row.y + row.h * 0.55 };
  const from = { x: target.x + 470, y: target.y + 290 };
  const pc = span(t, T.climb, T.revise - T.climb - 0.04, EASE);
  const ptr = arc(from, target, pc, 0.06);
  const ptrO = span(t, T.climb - 0.08, 0.2, EASE) * (1 - span(t, T.toPause + 0.1, 0.3, EASE));
  const css = writingCss(`${scope}-s1`, writing) + (navInk < 0.999 ? scoped(`${scope}-s1`, { ".r2-nav": `opacity: ${navInk.toFixed(3)};` }) : "");

  return (
    <Field>
      <Camera state={cam}>
        <Window>
          <div data-pf={`${scope}-s1`}>
            <style>{css}</style>
            <ShellFor plan={plan} />
          </div>
        </Window>
        {ptrO > 0.001 && <Cursor x={ptr.x} y={ptr.y} opacity={ptrO} pressed={t >= T.revise && t < T.revise + 0.1} size={CURSOR / cam.s} />}
      </Camera>
    </Field>
  );
}
