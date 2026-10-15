import type { CSSProperties } from "react";
import { Easing } from "remotion";
import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE } from "../../../foundation/time";
import { LEDGER_BODY, WORKSPACE } from "../../../data/salt-house";
import { PLANS, on } from "../Keyframes";
import { TextCarrier, carrierAt, type Path } from "../studies/Carrier";
import { CAMERA, CARRY, SETTLE, clamp01, lerp, logLerp, repin, span, type Point, type Rect } from "../studies/motion";
import type { Measured, Probes } from "../studies/probe";
import { Document, Environment, Whole, resolveAt, scoped } from "../studies/layers";
import { Field, LightRoot, frameScope } from "../studies/Study";
import { CURSOR, Glow, blendCam } from "./common";
import { LEDGER, scenePlan } from "./states";
import { T } from "./timeline";
import { cam2, linkPoint } from "./seq2";

// 3 · THE WORLD OPENS. The signature: Study B V2's identity expansion. On the
// ⌘-click only the words "1998 Guest Ledger" travel (with the link's hover
// pill for their first steps); the Scene's prose steps back to a trace; the
// words land as the Page's title and its body resolves beneath them in
// reading order; tab, trail, navigator and Inspector change in place; the
// camera pivots on the click point back to the one wide shot — the whole
// window on the ink stage — and the motif resolves. Then back in for a close
// read of the Page, and out again to the navigator: Characters.
//
// AUTHENTIC: the Scene + Inspector, the ledger Page in its tab, the reading.
// FILM-ONLY: the carried title, the column's clearing and resolving, the
// Scene lit in its three places.

const TITLE = WORKSPACE.ledger.title;
export const WIDE: CameraState = PLANS.reveal.camera;
const PATH: Path = { kind: "arc", lift: 0.07 };
/** The pull-back: leaves with the words (the room appears while they travel), long soft arrival. */
const PULL = Easing.bezier(0.3, 0, 0.2, 1);

const B = {
  carry: T.ledger + 0.06,
  carryDur: 1.2, // peak ≈ 120 px/frame on screen
  recede: T.ledger + 0.08,
  clear: T.ledger + 0.36,
  panel: T.ledger + 0.08,
  chrome: T.ledger + 0.28,
  eyebrow: T.ledger + 0.44, // the Page begins resolving under the title while it is still travelling: no empty white beat
  body: T.ledger + 0.4,
  pull: T.ledger + 0.02,
  pullDur: 2.1,
};
export const ARRIVE_WIDE = B.pull + B.pullDur;

/** The ledger Page, read close: its facts beside the Inspector. */
const readCam = (m: Probes): CameraState => on(m.ledger.title.text.x + 410, m.ledger.title.text.cy + 226, 1.74);

export function cam3(t: number, m: Probes): CameraState {
  const L = linkPoint(m);
  const c0 = repin(cam2(T.ledger, m), L);
  const w = repin(WIDE, L);
  const q = span(t, B.pull, B.pullDur, PULL);
  const opened: CameraState = { x: L.x, y: L.y, s: logLerp(c0.s, w.s, q), ax: lerp(c0.ax, w.ax, q), ay: lerp(c0.ay, w.ay, q) };
  if (t < T.intoPage) return opened;
  const into = blendCam(WIDE, readCam(m), span(t, T.intoPage, T.intoPageDur, CAMERA));
  return blendCam(into, WIDE, span(t, T.outToWide, T.outDur, CAMERA));
}

/** The link's own hover pill, under the words for their first steps: padding held in ems of the words. */
function Pill({ link, pill, title, at, size, swap, opacity }: { link: Measured; pill: Rect; title: Measured; at: Point; size: number; swap: number; opacity: number }) {
  if (opacity <= 0.001) return null;
  const fs = link.style.fontSize;
  const padL = (link.text.x - pill.x) / fs;
  const padR = (pill.x + pill.w - link.text.x - link.text.w) / fs;
  const padT = (link.text.cy - pill.y) / fs;
  const padB = (pill.y + pill.h - link.text.cy) / fs;
  const words = lerp(link.text.w / fs, title.text.w / title.style.fontSize, swap) * size;
  const style: CSSProperties = { position: "absolute", left: at.x - padL * size, top: at.y - padT * size, width: words + (padL + padR) * size, height: (padT + padB) * size, borderRadius: (5 / fs) * size, background: "var(--r2-hover)", opacity, pointerEvents: "none" };
  return <div style={style} />;
}

export function frame3(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cam3(t, m);
  const SRC = scenePlan({ panel: "inspector-scene", panelScroll: 160, hoverLink: TITLE });
  const p = span(t, B.carry, B.carryDur, CARRY);
  const carrying = t >= B.carry && p < 1;
  const c = carrierAt(m.insp.link, m.ledger.title, p, PATH);
  const swap = clamp01((p - 0.15) / 0.45);

  // The world responds: the Scene's prose steps back to a trace, then clears as the Page's body arrives.
  const prose = lerp(1, 0.28, span(t, B.recede, 0.45, EASE)) * (1 - span(t, B.clear, 0.3, EASE));
  const sceneTitle = 1 - span(t, B.recede, 0.4, EASE);
  const chrome = span(t, B.chrome, 0.34, EASE);
  const oldPanel = 1 - span(t, B.panel, 0.18, EASE);
  const newPanel = span(t, B.panel + 0.3, 0.26, EASE);
  const oldText = 1 - span(t, B.chrome, 0.12, EASE);
  const newText = span(t, B.chrome + 0.14, 0.2, EASE);
  const SWAPPED = ".r2-contextbar nav, .r2-status";
  const done = t >= B.carry + B.carryDur + 1.2; // everything has resolved: the authentic Page alone

  const srcCss = scoped(`${scope}-src`, {
    ".r2-main .r2-writing": `opacity: ${prose};`,
    ".r2-main .r2-doc-head": `opacity: ${prose > 0 ? Math.min(1, sceneTitle / prose) : 0};`,
    ".r2-prop:nth-child(5) .r2-prop-link": t >= B.carry ? "color: transparent !important; text-decoration-color: transparent !important; background: none !important;" : "",
    ".r2-panel[data-open] .r2-panel-body": `opacity: ${oldPanel} !important;`,
    [SWAPPED]: `opacity: ${oldText};`,
  });
  const envCss = scoped(`${scope}-env`, {
    ".r2-panel[data-open] .r2-panel-body": `opacity: ${chrome > 0 ? Math.min(1, newPanel / chrome) : 0} !important;`,
    [SWAPPED]: `opacity: ${chrome > 0 ? Math.min(1, newText / chrome) : 0};`,
  });
  const docCss = scoped(`${scope}-doc`, {
    ".r2-page-title": `visibility: ${carrying ? "hidden" : "visible"} !important;`,
    ".r2-doc-eyebrow": `opacity: ${span(t, B.eyebrow, 0.3, SETTLE)};`,
    ...Object.fromEntries(LEDGER_BODY.map((_, i) => [`.r2-page-body .ProseMirror > *:nth-child(${i + 1})`, `opacity: ${resolveAt(t, B.body, i, 0.06, 0.34, SETTLE)};`])),
  });

  // One Scene, lit in its three places as the camera arrives: its row, its tab, its backlink.
  const glow = span(t, ARRIVE_WIDE + 0.06, 0.35, SETTLE) * (1 - span(t, ARRIVE_WIDE + 1.0, 0.5, SETTLE));

  // The pointer: held where it clicked (the pivot), to rest by the backlink; then it reads; then out to Characters.
  const L = linkPoint(m);
  const press = { x: L.x + 18, y: L.y + 4 };
  const rest = PLANS.reveal.cursor!;
  const k = m.ledger.keyLine;
  const s17 = m.ledger.seventeen;
  const read1 = { x: k.text.x + k.text.w + 16, y: k.text.cy + 6 };
  const read2 = { x: s17.text.x + s17.text.w + 14, y: s17.text.cy + 6 };
  const a = m.ledger.aside;
  const aside = { x: a.text.x + a.text.w + 16, y: a.text.cy + 6 };
  const row = m.ledger.charactersRow.box;
  const chars = { x: row.x + 64, y: row.y + row.h * 0.55 };
  const legs: [number, number, Point, Point][] = [
    [ARRIVE_WIDE + 0.25, ARRIVE_WIDE + 0.75, press, rest],
    [T.read1 - 0.45, T.read1 + 0.1, rest, read1],
    [T.readAside - 0.25, T.readAside + 0.15, read1, aside],
    [T.read2 - 0.25, T.read2 + 0.2, aside, read2],
    [T.outToWide + 0.15, T.characters - 0.04, read2, chars],
  ];
  let ptr = press;
  for (const [a, b, from, to] of legs) if (t >= a) ptr = { x: lerp(from.x, to.x, span(t, a, b - a, EASE)), y: lerp(from.y, to.y, span(t, a, b - a, EASE)) };
  const pressed = (t >= T.ledger && t < T.ledger + 0.1) || (t >= T.characters && t < T.characters + 0.1);
  const hoverRow = t >= T.characters - 0.2 ? { ...LEDGER, hoverRow: WORKSPACE.characters.id } : LEDGER;

  return (
    <Field>
      <Camera state={cam}>
        {done ? (
          <Whole scope={`${scope}-page`} plan={hoverRow}>
            <Glow boxes={[m.ledger.row.box, m.ledger.tab.box, m.ledger.backlink.box]} amount={glow} />
          </Whole>
        ) : (
          <>
            {chrome < 1 && <Whole scope={`${scope}-src`} plan={SRC} css={srcCss} />}
            <Environment scope={`${scope}-env`} plan={LEDGER} css={envCss} opacity={chrome}>
              <Glow boxes={[m.ledger.row.box, m.ledger.tab.box, m.ledger.backlink.box]} amount={glow} />
            </Environment>
            {t >= B.carry && <Document scope={`${scope}-doc`} plan={LEDGER} css={docCss} />}
          </>
        )}
        {/* FILM-ONLY: the words — link → title — and the link's pill; nothing else travels. */}
        {carrying && (
          <>
            <LightRoot>
              <Pill link={m.insp.link} pill={m.insp.pill.box} title={m.ledger.title} at={c.at} size={c.size} swap={swap} opacity={1 - span(p, 0.05, 0.4, SETTLE)} />
            </LightRoot>
            <TextCarrier text={TITLE} from={m.insp.link} to={m.ledger.title} p={p} swap={swap} path={PATH} />
          </>
        )}
        <Cursor x={ptr.x} y={ptr.y} opacity={1} pressed={pressed} size={CURSOR / cam.s} />
      </Camera>
    </Field>
  );
}
