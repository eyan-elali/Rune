import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE } from "../../../foundation/time";
import { endpoints } from "@/components/rune2/CanvasConnections";
import { ELIAS, ELIAS_BODY, NIGHT_CARDS, NIGHT_LINES, WORKSPACE } from "../../../data/salt-house";
import { SHELL, on } from "../Keyframes";
import { HeldSurface, Surrogate, TextCarrier, carrierAt, type Path } from "../studies/Carrier";
import { CAMERA, CARRY, SETTLE, cameraAbout, clamp01, lerp, lerpRect, span, type Point, type Rect } from "../studies/motion";
import type { Measured, Probes } from "../studies/probe";
import { Document, Environment, Whole, resolveAt, scoped } from "../studies/layers";
import { Field, LightRoot, frameScope } from "../studies/Study";
import { CURSOR, blendCam, mid } from "./common";
import { EntryDoc } from "../../../ui/Page";
import type { PropertySpec } from "../../../ui/Panel";
import { BOARD, CARD_OF, CARD_RADIUS, ENTRY, RELATED, canvasPlan, cardChild, trailCss } from "./states";
import { cam3 } from "./seq3";
import { T } from "./timeline";

// 4 · THE WORKSPACE BECOMES THE THINKING SPACE. Research → the Characters
// Board (wide; the camera glides to Missing, to Elias) → OBJECT EXPANSION
// (Study D): the card becomes his Entry → a short read: structured
// properties beside freeform notes → REPRESENTATION TRANSFORMATION (Study C
// V2, re-phased to be calmer): the Entry holds as the anchor; his three
// relationships lift off one at a time, each settling before the next leaves;
// the page itself becomes Elias's card; the Canvas resolves where it was;
// only then do its connections draw; the network breathes; the camera
// follows the thread at an even pace to the Scene card.

const D = T.elias;
const K = T.canvas;

// ── Board → Entry (Study D) ────────────────────────────────────────────────
const OB = {
  recede: D,
  recedeDur: 0.22,
  carry: D + 0.08,
  carryDur: 1.05,
  values: 0.06,
  pull: D + 0.12,
  pullDur: 1.45,
  chrome: D + 0.3,
  labels: D + 0.15, // the Entry forms around him almost at once: the card is never alone in white space
  values2: D + 0.85, // the values he does not carry, once his have passed through their rows
  body: D + 0.26,
  done: D + 1.42,
};

// ── The Entry, read: the clue that makes the writer need to map the night ──
export const RD = {
  toPhrase: D + 1.05, // the hand goes to "The night of the fire"…
  drag: D + 1.45, // …and selects "Dad gave him the key" (a real text selection)
  dragDur: 0.38,
  toThomas: D + 2.0, // a beat; then onto Thomas Vale — Dad; T.V.
  think: D + 2.28, // it rests there: the connection made
  toNav: D + 2.46, // then deliberately to the navigator: The Night of the Fire
};
const CARRIED = [
  { key: "name", text: ELIAS.title, delay: 0 },
  { key: "role", text: "Brother", delay: OB.values },
  { key: "seen", text: "Greyhaven ferry, 3 March", delay: OB.values + 0.05 },
] as const;
const D_PATH: Path = { kind: "arc", lift: 0.06 };

// ── Entry → Canvas (Study C V2, phased) ────────────────────────────────────
// ── Entry → Canvas: structured information becomes spatial reasoning ──────
//
// The meaning: the writer has just understood Thomas = Dad = T.V. and opens the
// Canvas to see how it fits — a relationship opening into space. So the
// relationship lifts first (Thomas Vale, the anchor, and the ledger beside him
// gather card surfaces where they stand); the page lets go of everything else,
// in one short breath (no ghosted page, no wipe, no shape to
// watch); the Canvas's surface comes up evenly beneath. Three objects
// survive — Thomas Vale, the 1998 Guest Ledger, Elias Vale — and, at a MEDIUM
// framing, each gathers a card around itself and lands in its real place in
// the "14 November 1998" Section. The destination forms locally around them
// (the Canvas's title, the Section, the 23:40 note, the rest of the row), the
// row's relationships draw, and only then does the camera open to the whole
// night: WIDE = architecture, after MEDIUM = meaning.
//
// Roles: objects move first; the camera reframes after they leave (a pan to
// the Section, no zoom-out yet); the environment resolves behind them; then the
// camera opens and the rest of the Canvas resolves as it comes into frame.
export const RT = {
  chrome: K + 0.06, // 1 · INTENTION — the click's own response, in place (tab, breadcrumb)
  lift: { thomas: K + 0.12, ledger: K + 0.2, elias: K + 0.62 } as Record<"thomas" | "ledger" | "elias", number>, // 2 · the relationship lifts first: Thomas (the anchor), the ledger beside him
  clear: K + 0.26, // the page lets go of everything else at once: each block removed wholly (no fade, no translucent page, no shape)
  clearSpread: 0, // all at once, in a single frame
  ground: K + 0.38, // the Canvas's surface comes up beneath, evenly: a texture, never a moving edge
  go: { thomas: K + 0.52, ledger: K + 0.7, elias: K + 0.8 } as Record<"thomas" | "ledger" | "elias", number>, // 3 · three objects, staggered
  dur: { thomas: 1.0, ledger: 1.0, elias: 1.2 } as Record<"thomas" | "ledger" | "elias", number>,
  frame: K + 0.7, // the camera answers: a pan to the Section, at the same medium scale
  frameDur: 1.9,
  ui: K + 0.55, // 4 · where we are, as soon as the ground has passed: the Canvas's title, and the Section the objects are going to
  section: K + 0.5,
  row: K + 1.45, // the rest of the row: 23:40 first — and with it the rest of the night, beyond and at the edge of the frame
  lines: K + 2.1, // 5 · the relationships, once the cards are down (the whole world's, before the camera opens)
  linesDur: 0.5,
  wide: K + 2.35, // 6 · WIDE — taking over from the pan without a pause, the camera reveals the night that already exists…
  wideDur: 2.15,
  rest: K + 1.7, // …which has resolved already, beyond the frame and at its edge, while the relationship formed
  restLines: K + 2.2,
};
/** The Section's other cards, in the order they arrive (23:40 first: it is the fact that matters). */
const ROW_CARDS = ["key", "vacant", "guest", "clara"];
const ROW_LINES = new Set([0, 1, 2, 3, 4, 5]);
const NOW_CARDS = ["letter", "mara", "june", "scene", "plant"];
const HOTEL_CARDS = ["constance", "insurance"];
export const ENTRY_CANVAS = { from: RD.toPhrase - 0.3, to: T.open + 0.1 };
const CHIP_PATH: Path = { kind: "arc", lift: 0.1 };
const ELIAS_PATH: Path = { kind: "arc", lift: 0.06 };
const LINE_LENGTH = NIGHT_LINES.map((l) => {
  const e = endpoints(NIGHT_CARDS.find((c) => c.id === l.from)!, NIGHT_CARDS.find((c) => c.id === l.to)!);
  return Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y);
});
const CARD_SURFACE = { background: "var(--r2-surface-raised)", shadow: "var(--r2-ring), var(--r2-shadow-sm)" };

// ── The camera ─────────────────────────────────────────────────────────────

const ENTRY_CAM = on(870, 404, 1.72);
const ENTRY_NAV = on(680, 400, 1.45); // the Entry with the navigator in frame (frame 11′)
const ENTRY_READ = on(880, 432, 1.78);

// ── The Canvas: four compositions, one camera path ─────────────────────────
//
// A · WIDE — the whole window and the whole night: three Sections, every
//     card, every relationship. Architecture. It holds.
// B · THE 1998 ROW — Thomas Vale, 23:40 / key 17, the 1998 Guest Ledger (and
//     the contradiction under it) fill the frame: the relationship that matters.
// C · THE CONCLUSION — "Plant it" in the foreground, the trail it came down
//     (the ledger, the line) still legible behind it, the Scene card beside it.
// D · THE SCENE CARD — a small drift as the hand goes to The Key Cabinet.
//
// One decision (A → B: a push, mostly scale), one trail (B → C: right along
// the row, then one bend down to the conclusion). A centripetal Catmull-Rom
// spline through the compositions in (x, y, ln s), re-parameterised by how
// far the picture moves; its pace is one inertial profile with a soft dip at
// B (never a stop) and a long arrival at C.

/** MEDIUM — the "14 November 1998" Section, where the three objects land: large enough to read every card. */
const medium1998 = (m: Probes): CameraState => {
  const b = m.canvas.sec1998.box;
  return on(b.x + b.w / 2 + 72, b.y + b.h / 2 - 6, 1.62);
};
/** A — the whole Canvas, in the whole window. */
export const CANVAS_WIDE = on(SHELL.width / 2 + 8, 396, 1.22);
type Station = [number, number, number]; // x, y, ln(scale)
const Z = 700; // how much a change of scale counts against a change of place, in the path's metric

function comps(m: Probes) {
  const c = m.canvas;
  const key = mid(c.keyCard.box);
  const ledger = mid(c.ledgerCard.box);
  const plant = mid(c.plantCard.box);
  const A: Station = [CANVAS_WIDE.x, CANVAS_WIDE.y, Math.log(CANVAS_WIDE.s)];
  // B: the row centred between 23:40 and the ledger — Thomas at the left of frame, the contradiction's line below.
  const th = c.thomasCard.box;
  const lg = c.ledgerCard.box;
  const B: Station = [(th.x + lg.x + lg.w) / 2, key.y + 40, Math.log(2.98)];
  // Along the trail: past the ledger, beginning to fall toward the conclusion.
  const L: Station = [ledger.x + 64, ledger.y + 128, Math.log(2.86)];
  // C: "Plant it" low-left of centre, the ledger at the top edge, the Scene card at the right.
  const C: Station = [plant.x + 58, plant.y - 34, Math.log(2.86)];
  // D: toward the Scene card, a little.
  const D: Station = [plant.x + 104, plant.y - 50, Math.log(2.9)];
  return { A, B, L, C, D };
}

let pathCache: { at: (v: number) => Station; arcB: number } | null = null;
function divePath(m: Probes) {
  if (pathCache) return pathCache;
  const { A, B, L, C } = comps(m);
  const pts = [A, B, L, C];
  const metric = (p: Station) => [p[0], p[1], p[2] * Z];
  const P = pts.map(metric);
  // Phantom ends, continuing the first and last chords.
  const ext = [P[0].map((v, d) => 2 * v - P[1][d]), ...P, P[3].map((v, d) => 2 * P[3][d] - P[2][d])];
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const seg = (i: number, u: number) => {
    // Centripetal Catmull-Rom (α = 0.5) between ext[i+1] and ext[i+2].
    const [p0, p1, p2, p3] = [ext[i], ext[i + 1], ext[i + 2], ext[i + 3]];
    const t1 = Math.sqrt(dist(p0, p1)) || 1e-3;
    const t2 = t1 + (Math.sqrt(dist(p1, p2)) || 1e-3);
    const t3 = t2 + (Math.sqrt(dist(p2, p3)) || 1e-3);
    const tt = t1 + (t2 - t1) * u;
    const L = (a: number[], b: number[], ta: number, tb: number) => a.map((v, d) => ((tb - tt) / (tb - ta)) * v + ((tt - ta) / (tb - ta)) * b[d]);
    const A1 = L(p0, p1, 0, t1);
    const A2 = L(p1, p2, t1, t2);
    const A3 = L(p2, p3, t2, t3);
    const B1 = L(A1, A2, 0, t2);
    const B2 = L(A2, A3, t1, t3);
    return L(B1, B2, t1, t2);
  };
  const N = 240;
  const samples: number[][] = [];
  for (let i = 0; i < 3; i++) for (let k = 0; k < N; k++) samples.push(seg(i, k / N));
  samples.push(P[3]);
  // Arc length as the picture experiences it: a move counts by its size on screen.
  const cum = [0];
  for (let i = 1; i < samples.length; i++) {
    const [x0, y0, z0] = samples[i - 1];
    const [x1, y1, z1] = samples[i];
    const sc = Math.exp((z0 + z1) / 2 / Z);
    cum.push(cum[i - 1] + Math.hypot((x1 - x0) * sc, (y1 - y0) * sc) + Math.abs(z1 - z0) * 1.3);
  }
  const total = cum[cum.length - 1];
  const at = (v: number): Station => {
    const target = clamp01(v) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const f = (target - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9);
    const q = samples[i - 1].map((a, d) => lerp(a, samples[i][d], f));
    return [q[0], q[1], q[2] / Z];
  };
  pathCache = { at, arcB: cum[N] / total };
  return pathCache;
}

/**
 * The dive's pace: one profile in two Hermite pieces — gathering from rest,
 * easing to a third of its speed as B's composition forms (the row read, not
 * stopped at), then on along the trail and a long arrival at C.
 */
const DIP = 0.34;
const B_AT = 0.4; // of the dive's duration
function pace(u: number, arcB: number) {
  const k = clamp01(u);
  const h1 = (x: number, m1: number) => -2 * x ** 3 + 3 * x ** 2 + m1 * (x ** 3 - x ** 2);
  const h2 = (x: number, m0: number) => m0 * (x ** 3 - 2 * x ** 2 + x) - 2 * x ** 3 + 3 * x ** 2;
  // Matching speeds at B: arcB·m1/B_AT = (1 − arcB)·m2/(1 − B_AT).
  const vB = DIP; // speed at B, relative to the whole move's average
  const m1 = (vB * B_AT) / arcB;
  const m2 = (vB * (1 - B_AT)) / (1 - arcB);
  return k < B_AT ? arcB * h1(k / B_AT, m1) : arcB + (1 - arcB) * h2((k - B_AT) / (1 - B_AT), m2);
}

/** When the dive is at B (the 1998 row composed). */
export const AT_B = T.dive + B_AT * T.diveDur;
/** The trail's emphasis: as the push commits to the row, everything off the trail falls back. */
export const trailAt = (t: number) => span(t, T.dive + 0.35, 1.1, SETTLE);

export function cam4(t: number, m: Probes): CameraState {
  const card = m.board.card.box;
  const C = mid(card);
  const lane = mid(m.board.lane.box);
  const MEDIUM = on(lane.x, card.y + 150, 1.72);
  const CLOSE = on(C.x, C.y + 24, 2.15);
  let cam = cam3(T.characters, m); // the wide shot the Board opens in
  cam = cameraAbout(cam, MEDIUM, lane, span(t, T.toMissing, T.toMissingDur, CAMERA));
  cam = cameraAbout(cam, CLOSE, C, span(t, T.closeIn, T.elias - T.closeIn + 0.04, CAMERA));
  cam = cameraAbout(cam, ENTRY_CAM, C, span(t, OB.pull, OB.pullDur, CAMERA));
  cam = blendCam(cam, ENTRY_READ, span(t, RD.toPhrase, 1.1, CAMERA)); // a slow lean toward the night of the fire
  cam = blendCam(cam, ENTRY_NAV, span(t, RD.toNav - 0.1, K - RD.toNav + 0.1, CAMERA));
  cam = blendCam(cam, medium1998(m), span(t, RT.frame, RT.frameDur, CAMERA));
  cam = blendCam(cam, CANVAS_WIDE, span(t, RT.wide, RT.wideDur, CAMERA));
  if (t < T.dive) return cam;
  const { at, arcB } = divePath(m);
  const [x, y, ls] = at(pace((t - T.dive) / T.diveDur, arcB));
  let out: CameraState = { x, y, s: Math.exp(ls), ax: 960, ay: 540 };
  // D: as the hand goes from the conclusion to the Scene card, the frame leans after it a little.
  const d = comps(m).D;
  out = blendCam(out, { x: d[0], y: d[1], s: Math.exp(d[2]), ax: 960, ay: 540 }, span(t, T.toScene - 0.05, T.open - T.toScene + 0.35, CAMERA));
  return out;
}

// ── The frame ──────────────────────────────────────────────────────────────

export function frame4(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cam4(t, m);
  return (
    <Field>
      <Camera state={cam}>
        {t < OB.done ? boardToEntry(t, m, scope) : t < K + 0.02 ? entryRead(t, m, scope) : entryToCanvas(t, m, scope)}
        {pointer(t, m, cam)}
      </Camera>
    </Field>
  );
}

function pointer(t: number, m: Probes, cam: CameraState) {
  const rowL = m.ledger.charactersRow.box;
  const fromRow = { x: rowL.x + 64, y: rowL.y + rowL.h * 0.55 };
  const card = m.board.card.box;
  const onCard = { x: card.x + card.w * 0.72, y: card.y + card.h * 0.58 };
  const dad = m.entry.dad;
  const phraseStart = { x: dad.text.x - 1, y: dad.text.cy + 3 };
  const phraseEnd = { x: dad.text.x + dad.text.w + 1, y: dad.text.cy + 3 };
  const th = m.entry.thomasBox.box;
  const onThomas = { x: th.x + th.w * 0.55, y: th.y + th.h * 0.62 };
  const canvasRow = m.entry.canvasRow.box;
  const onCanvasRow = { x: canvasRow.x + 80, y: canvasRow.y + canvasRow.h * 0.55 };
  const legs: [number, number, Point, Point][] = [
    [T.reachCard, T.hoverCard, fromRow, onCard],
    [RD.toPhrase, RD.drag - 0.04, onCard, phraseStart],
    [RD.drag, RD.drag + RD.dragDur, phraseStart, phraseEnd],
    [RD.toThomas, RD.think, phraseEnd, onThomas],
    [RD.toNav, K - 0.04, onThomas, onCanvasRow],
  ];
  let ptr = fromRow;
  for (const [a, b, from, to] of legs) if (t >= a) ptr = { x: lerp(from.x, to.x, span(t, a, b - a, EASE)), y: lerp(from.y, to.y, span(t, a, b - a, EASE)) };
  const o = 1 - span(t, K + 0.5, 0.4, EASE);
  if (o <= 0.001) return null;
  const pressed = (t >= T.elias && t < T.elias + 0.1) || (t >= RD.drag - 0.02 && t < RD.drag + RD.dragDur + 0.02) || (t >= K && t < K + 0.1);
  return <Cursor x={ptr.x} y={ptr.y} opacity={o} pressed={pressed} size={CURSOR / cam.s} />;
}

/** OBJECT EXPANSION: the Board steps back; the card carries its name and values into the Entry and becomes its head. */
function boardToEntry(t: number, m: Probes, scope: string) {
  const pCard = span(t, OB.carry, OB.carryDur, CARRY);
  const moving = t >= OB.carry && pCard < 1;
  const landed = (delay: number) => span(t, OB.carry + delay, OB.carryDur, CARRY) >= 1;
  const board = 1 - span(t, OB.recede, OB.recedeDur, EASE);
  const away = t >= T.elias + 0.02;
  const chrome = span(t, OB.chrome, 0.34, EASE);
  const oldText = 1 - span(t, OB.chrome, 0.12, EASE);
  const newText = span(t, OB.chrome + 0.14, 0.2, EASE);
  const SWAPPED = ".r2-contextbar nav, .r2-contextbar-actions > .r2-action:first-child";
  const hover = t >= T.hoverCard && !away;

  const srcCss = scoped(`${scope}-board`, {
    ".r2-board .r2-lane, .r2-collection-bar, .r2-collection-context, .r2-doc-eyebrow": `opacity: ${board};`,
    [SWAPPED]: `opacity: ${oldText};`,
    ...(away ? { ".r2-lane:nth-child(2) .r2-lane-cards > li:first-child .r2-card": "visibility: hidden;", ".r2-page-title": "visibility: hidden;" } : {}),
  });
  const envCss = scoped(`${scope}-env`, { [SWAPPED]: `opacity: ${chrome > 0 ? Math.min(1, newText / chrome) : 0};` });

  const carriedRow: Record<string, number> = { Role: OB.values, "Last seen": OB.values + 0.05 };
  let order = 0;
  const rules: Record<string, string> = {
    ".r2-page-title": `visibility: ${landed(0) ? "visible" : "hidden"} !important;`,
    ".r2-entry-collection, .r2-entry-collection *": `visibility: ${span(t, OB.carry, 0.8, CARRY) >= 1 ? "visible" : "hidden"} !important;`,
    // The fold's header waits for the title to pass over it.
    ".r2-props-head": `opacity: ${span(t, OB.values2 - 0.05, 0.3, SETTLE)};`,
  };
  ELIAS.properties.forEach((p, i) => {
    // The labels arrive early, in their own column — the Entry forming around him while he is still arriving.
    const label = resolveAt(t, OB.labels, order++, 0.05, 0.3, SETTLE);
    const sel = `.r2-props-list > .r2-prop:nth-child(${i + 1})`;
    rules[`${sel} .r2-prop-label`] = `opacity: ${label};`;
    const delay = carriedRow[p.name];
    // The other values wait until the carried words have passed through their rows (Whereabouts first).
    if (delay === undefined) rules[`${sel} .r2-prop-value`] = `opacity: ${resolveAt(t, OB.values2, i, 0.05, 0.3, SETTLE)};`;
    else rules[`${sel} .r2-prop-value, ${sel} .r2-prop-value *`] = `visibility: ${landed(delay) ? "visible" : "hidden"} !important;`;
  });
  ELIAS_BODY.forEach((_, i) => {
    rules[`.r2-page-body .ProseMirror > *:nth-child(${i + 1})`] = `opacity: ${resolveAt(t, OB.body, i, 0.06, 0.34, SETTLE)};`;
  });
  if (t < OB.labels + 0.2) rules[".r2-props--entry"] = "border-bottom-color: transparent;";
  const docCss = scoped(`${scope}-doc`, rules);

  // The card's surface becomes the Entry's head: it holds what it carries until they are nearly home, then settles into the page.
  const name = m.entry.name;
  const props = m.entry.props.box;
  const top = name.text.cy - name.style.lineHeight / 2 - 14;
  const region: Rect = { x: props.x - 16, y: top, w: props.w + 32, h: props.y + props.h + 8 - top };
  const pColl = span(t, OB.carry, 0.8, CARRY);

  return (
    <>
      {chrome < 1 && <Whole scope={`${scope}-board`} plan={{ ...BOARD, hoverCard: hover ? ELIAS.title : undefined }} css={srcCss} />}
      <Environment scope={`${scope}-env`} plan={ENTRY} css={envCss} opacity={chrome} />
      {moving && (
        <LightRoot>
          <Surrogate
            from={{ rect: m.board.card.box, radius: 6, background: "var(--r2-surface-raised)", shadow: "0 0 0 1px var(--r2-border-strong), 0 2px 6px -2px rgba(var(--r2-palette-shadow) / 0.14)" }}
            to={{ rect: region, radius: 10, background: "var(--r2-bg)" }}
            p={pCard}
            fill={span(pCard, 0.5, 0.45, SETTLE)}
          />
        </LightRoot>
      )}
      {t >= OB.carry && <Document scope={`${scope}-doc`} plan={ENTRY} css={docCss} />}
      {/* FILM-ONLY: the card's name and values, into their places in the Entry. */}
      {t >= OB.carry &&
        CARRIED.map((c) => {
          const p = span(t, OB.carry + c.delay, OB.carryDur, CARRY);
          if (p >= 1) return null;
          return <TextCarrier key={c.key} text={c.text} from={m.board[c.key]} to={m.entry[c.key]} p={p} swap={clamp01((p - 0.3) / 0.2)} path={D_PATH} />;
        })}
      {t >= OB.carry && pColl < 1 && (
        <TextCarrier text={WORKSPACE.characters.title} from={m.board.collection} to={m.entry.collection} p={pColl} swap={clamp01((pColl - 0.4) / 0.08)} path={{ kind: "level", out: 0.3, into: 0.3 }} />
      )}
    </>
  );
}

/**
 * The Entry, read for a reason: the writer selects "Dad gave him the key"
 * (a real selection, in the editor's own colour), rests on Thomas Vale — Dad,
 * T.V., who signed for key 17 — and then goes, deliberately, to the
 * navigator's Canvas: the night needs mapping.
 */
function entryRead(t: number, m: Probes, scope: string) {
  const dad = m.entry.dad.box;
  const sel = span(t, RD.drag, RD.dragDur, EASE);
  const hover = t >= RD.think - 0.12 && t < RD.toNav + 0.08;
  const props = (ELIAS.properties as PropertySpec[]).map((p) => (p.name === "Connected to" && hover ? { ...p, hover: "Thomas Vale" } : p));
  const plan = { ...ENTRY, mainNode: <EntryDoc collection={WORKSPACE.characters.title} title={ELIAS.title} properties={props} blocks={ELIAS_BODY} />, hoverRow: t >= K - 0.22 ? WORKSPACE.canvas.id : undefined };
  return (
    <Whole scope={`${scope}-entry`} plan={plan}>
      {/* The writer's own selection (::selection, --r2-selection), drawn under the ink. */}
      {sel > 0 && <div style={{ position: "absolute", left: dad.x - 1, top: dad.y, width: (dad.w + 2) * sel, height: dad.h, background: "var(--r2-selection)", mixBlendMode: "multiply", pointerEvents: "none" }} />}
    </Whole>
  );
}

/**
 * One identity, one text: the words travel as a single run. Its colour leaves
 * the link's accent and its underline goes while it is still in link type; then,
 * mid-flight and at matched size and place, it takes the card's type in one
 * frame. Two copies of the name never coexist.
 */
export const IDENTITY_SWAP = 0.5;
function OneIdentity({ text, from, to, p, path }: { text: string; from: Measured; to: Measured; p: number; path: Path }) {
  const c = span(p, 0.06, 0.34, SETTLE);
  const before = p < IDENTITY_SWAP;
  return (
    <TextCarrier
      text={text}
      from={from}
      to={to}
      p={p}
      swap={before ? 0 : 1}
      path={path}
      fromExtra={{ color: `color-mix(in srgb, ${to.style.color} ${(c * 100).toFixed(1)}%, ${from.style.color})`, textDecorationColor: `color-mix(in srgb, transparent ${(c * 100).toFixed(1)}%, ${from.style.textDecorationColor})` }}
    />
  );
}

/** REPRESENTATION TRANSFORMATION: the Canvas opens from the understanding; three objects become its cards; then the night, wide. */
function entryToCanvas(t: number, m: Probes, scope: string) {
  const chrome = span(t, RT.chrome, 0.4, EASE);
  const oldText = 1 - span(t, RT.chrome, 0.12, EASE);
  const newText = span(t, RT.chrome + 0.14, 0.2, EASE);
  const SWAPPED = ".r2-contextbar nav, .r2-contextbar-actions > .r2-action:first-child";
  const main = m.entry.main.box;

  // The Canvas's surface: up evenly beneath the relationship once the page has let go — no boundary to watch.
  const groundIn = span(t, RT.ground, 0.6, SETTLE);
  const opened = t >= RT.clear + RT.clearSpread + 0.2;

  // Carriers: each object, once lifted, rides from its place in the Entry to its card (and becomes the card on landing).
  const prog = (k: "thomas" | "ledger" | "elias") => span(t, RT.go[k], RT.dur[k], CARRY);
  const docked = (k: "thomas" | "ledger" | "elias") => span(t, RT.go[k] + RT.dur[k] - 0.02, 0.22, SETTLE);
  const lifted = t >= RT.lift.thomas;

  const show: Record<string, number> = {};
  ROW_CARDS.forEach((id, i) => (show[id] = span(t, RT.row + i * 0.11, 0.38, SETTLE)));
  NOW_CARDS.forEach((id, i) => (show[id] = span(t, RT.rest + i * 0.05, 0.4, SETTLE)));
  HOTEL_CARDS.forEach((id, i) => (show[id] = span(t, RT.rest + 0.1 + i * 0.05, 0.4, SETTLE)));
  show.thomas = docked("thomas");
  show.ledger = docked("ledger");
  show.elias = docked("elias");
  // One world: every Section exists from the moment the 1998 one does.
  const sections = [0, 1, 2].map(() => span(t, RT.section, 0.55, SETTLE));
  const lineAt = (i: number) => (ROW_LINES.has(i) ? span(t, RT.lines + (i % 3) * 0.06, RT.linesDur, SETTLE) : span(t, RT.restLines + (i % 3) * 0.06, 0.5, SETTLE));
  const canvasCss =
    trailCss(`${scope}-canvas`, trailAt(t)) +
    scoped(`${scope}-canvas`, {
      ".r2-canvas-ui": `opacity: ${span(t, RT.ui, 0.45, SETTLE)};`,
      ...Object.fromEntries(sections.map((o, i) => [`.r2-canvas-world > .r2-canvas-section:nth-child(${i + 1})`, `opacity: ${o};`])),
      ...Object.fromEntries(NIGHT_CARDS.map((c, i) => [`.r2-canvas-world > .r2-canvas-card:nth-child(${cardChild(i)})`, `opacity: ${show[c.id] ?? 0};`])),
      ...Object.fromEntries(
        NIGHT_LINES.flatMap((_, i) => {
          const L = LINE_LENGTH[i];
          const p = lineAt(i);
          return [
            [`.r2-canvas-line:nth-of-type(${i + 1}) .r2-canvas-line-stroke`, `stroke-dasharray: ${L + 2} ${L + 2}; stroke-dashoffset: ${(L + 2) * (1 - p)}; ${p < 1 ? "marker-end: none;" : ""}`],
            [`.r2-canvas-line:nth-of-type(${i + 1}) .r2-canvas-line-label`, `opacity: ${span(p, 0.75, 0.25)};`],
          ];
        })
      ),
    });
  const entryEnvCss = scoped(`${scope}-entryenv`, { [SWAPPED]: `opacity: ${oldText};` });
  const canvasEnvCss = scoped(`${scope}-canvasenv`, { [SWAPPED]: `opacity: ${chrome > 0 ? Math.min(1, newText / chrome) : 0};` });
  // The Entry at full ink; then — the relationship already lifted — every other block leaves where it stands, in one short breath.
  const blockList: [string, Rect][] = [
    [".r2-entry-collection", m.entry.blkCollection.box],
    [".r2-props-head", m.entry.blkPropsHead.box],
    ...ELIAS.properties.map((_, i): [string, Rect] => [`.r2-props-list > .r2-prop:nth-child(${i + 1})`, m.entry[`blkProp${i}`].box]),
    ...ELIAS_BODY.map((_, i): [string, Rect] => [`.r2-page-body .ProseMirror > *:nth-child(${i + 1})`, m.entry[`blkBody${i}`].box]),
  ];
  const tops = blockList.map(([, b]) => b.y);
  const top0 = Math.min(...tops);
  const span0 = Math.max(...tops) - top0 || 1;
  // Removed, not faded: once it no longer matters, each block is simply gone (one frame) — no pale text, ever.
  const gone = (b: Rect) => (t >= RT.clear + RT.clearSpread * ((b.y - top0) / span0) ? 1 : 0);
  const blocks: Record<string, Rect> = Object.fromEntries(blockList);
  const entryDocCss = scoped(`${scope}-entry`, {
    ...Object.fromEntries(Object.entries(blocks).map(([sel, b]) => [sel, `opacity: ${1 - gone(b)};`])),
    ".r2-props--entry": `border-bottom-color: color-mix(in srgb, var(--r2-border) ${(100 * (1 - gone(m.entry.props.box))).toFixed(0)}%, transparent);`,
    ...(lifted
      ? {
          ".r2-page-title": "visibility: hidden !important;",
          [`.r2-prop-link:nth-child(${["mara", "thomas", "ledger"].indexOf("thomas") + 1}), .r2-prop-link:nth-child(${["mara", "thomas", "ledger"].indexOf("ledger") + 1})`]: "visibility: hidden !important;",
        }
      : {}),
  });
  const selection = 1 - gone(m.entry[`blkBody${ELIAS_BODY.findIndex((b) => JSON.stringify(b).includes("Dad gave him the key"))}`].box);
  const dad = m.entry.dad.box;

  const surface = (k: "thomas" | "ledger") => {
    const p = prog(k);
    const d = docked(k);
    if (!lifted || d >= 1) return null;
    const link = m.entry[`${k}Box`].box;
    const chip = { x: link.x - 4, y: link.y - 2, w: link.w + 8, h: link.h + 4 };
    const c = carrierAt(m.entry[k], m.canvas[k], p, CHIP_PATH);
    return (
      <div key={k} style={{ position: "absolute", left: 0, top: 0, opacity: 1 - d }}>
        <LightRoot>
          <HeldSurface from={m.entry[k]} to={m.canvas[k]} fromBox={chip} toBox={m.canvas[`${k}Card`].box} at={c.at} size={c.size} p={p} radius={[5, CARD_RADIUS]} background={CARD_SURFACE.background} shadow={CARD_SURFACE.shadow} opacity={span(t, RT.lift[k], 0.3, SETTLE)} />
        </LightRoot>
        <OneIdentity text={k === "thomas" ? "Thomas Vale" : WORKSPACE.ledger.title} from={m.entry[k]} to={m.canvas[k]} p={p} path={CHIP_PATH} />
      </div>
    );
  };
  const elias = () => {
    const p = prog("elias");
    const d = docked("elias");
    if (!lifted || d >= 1) return null;
    const title = m.entry.name;
    const c = carrierAt(title, m.canvas.elias, p, ELIAS_PATH);
    const box = { x: title.text.x - 0.5 * title.style.fontSize, y: title.text.cy - 0.75 * title.style.fontSize, w: title.text.w + title.style.fontSize, h: 1.5 * title.style.fontSize };
    return (
      <div style={{ position: "absolute", left: 0, top: 0, opacity: 1 - d }}>
        <LightRoot>
          {/* The card gathers around his name only once it is card-sized: the title never becomes a big empty box. */}
          <HeldSurface from={title} to={m.canvas.elias} fromBox={box} toBox={m.canvas.eliasCard.box} at={c.at} size={c.size} p={p} radius={[6, CARD_RADIUS]} background={CARD_SURFACE.background} shadow={CARD_SURFACE.shadow} opacity={span(p, 0.35, 0.35, SETTLE)} />
        </LightRoot>
        <OneIdentity text={ELIAS.title} from={title} to={m.canvas.elias} p={p} path={ELIAS_PATH} />
      </div>
    );
  };

  return (
    <>
      {/* The environment changes in place: the Entry's chrome, then the Canvas's (only what differs changes). */}
      {chrome < 1 && <Environment scope={`${scope}-entryenv`} plan={ENTRY} css={entryEnvCss} />}
      <Environment scope={`${scope}-canvasenv`} plan={canvasPlan()} hide=".r2-main > *" css={canvasEnvCss} opacity={chrome} />
      {/* FILM-ONLY: the Canvas's own surface, up evenly beneath the relationship (its dots are faint by nature: a texture arriving, not an edge). */}
      {groundIn > 0 && <Document scope={`${scope}-ground`} plan={canvasPlan()} region=".r2-main > *" opacity={groundIn} css={scoped(`${scope}-ground`, { ".r2-canvas-world, .r2-canvas-world *, .r2-canvas-ui, .r2-canvas-ui *": "visibility: hidden !important;" })} />}
      {/* The Entry at full ink, letting go of everything but the relationship. */}
      {!opened && (
        <>
          <Document scope={`${scope}-entry`} plan={ENTRY} css={entryDocCss} />
          <div style={{ position: "absolute", left: dad.x - 1, top: dad.y, width: dad.w + 2, height: dad.h, background: "var(--r2-selection)", mixBlendMode: "multiply", opacity: selection, pointerEvents: "none" }} />
        </>
      )}
      {/* …then its title, Section and cards, resolving as the objects land and the camera opens (the ground itself is beneath). */}
      {t >= RT.ui && <Document scope={`${scope}-canvas`} plan={canvasPlan()} region=".r2-main > *" css={canvasCss + scoped(`${scope}-canvas`, { ".r2-canvas": "background: none !important;" })} />}
      {/* FILM-ONLY: the three objects, each becoming its card. Elias last: the page's subject arrives as the row forms. */}
      {surface("ledger")}
      {surface("thomas")}
      {elias()}
    </>
  );
}
