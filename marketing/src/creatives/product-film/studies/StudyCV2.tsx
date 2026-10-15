import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE, typedCount, typingSchedule } from "../../../foundation/time";
import { endpoints } from "@/components/rune2/CanvasConnections";
import { ELIAS, NIGHT_CARDS, NIGHT_LINES, NIGHT_SECTIONS, SCENE, SCENE_OPEN_LINE, SCENE_OPEN_TYPED, SCENE_PROSE, SCENE_RETURN_TYPED, WORKSPACE } from "../../../data/salt-house";
import type { CanvasViewport } from "../../../ui/Canvas";
import { ManuscriptDoc } from "../../../ui/Manuscript";
import { PLANS, SHELL, ShellFor, Window, on, type Plan } from "../Keyframes";
import { HeldSurface, Surrogate, TextCarrier, carrierAt, type Path } from "./Carrier";
import { CAMERA, CARRY, SETTLE, center, clamp01, lerp, lerpRect, logLerp, repin, span, toScreen, type Rect } from "./motion";
import type { Probes } from "./probe";
import { Document, Environment, scoped } from "./layers";
import { Field, LightRoot, frameScope, type Cue, type Phase, type StudyDef } from "./Study";
import clickSound from "../../../audio/click.wav";
import settleSound from "../../../audio/settle.wav";
import keyA from "../../../audio/key-1.wav";
import keyB from "../../../audio/key-2.wav";
import keyC from "../../../audio/key-3.wav";
import keyD from "../../../audio/key-4.wav";
import keySpace from "../../../audio/key-space.wav";
import keyEnd from "../../../audio/key-end.wav";

// STUDY C V2 — Entry → Canvas → back to the Scene.
// REPRESENTATION TRANSFORMATION, then RETURN TO MANUSCRIPT.
//
// Authentic states: frame 11 (Elias Vale's Entry); the Canvas "The Night of
// the Fire", wide (a real zoom, 62%); the Scene card about to be clicked;
// frame 13 (back in The Key Cabinet).
//
// What changed from V1 (whose first half read as "the Entry fades, the
// Canvas appears"): the Entry never fades under its objects. On the click the
// three things Elias is Connected to lift off the page where they stand —
// each link gathering a card's surface around itself — and travel to their
// cards. The Entry itself is Elias: the whole page contracts into his card,
// his title riding it, its notes folding into the card as it closes. The
// Canvas resolves in place where the page leaves it (its Sections first, the
// other cards only once these four have landed); only then do its own
// connections draw. The second half is V1's, retimed: the camera travels the
// thread (now at an even pace — arc-length, not Catmull–Rom's uniform
// parameter), the Scene card opens into the Scene, and the writer is back:
// a still caret for 0.3s, Return, and the typing — never carried.

const CURSOR = 30 / 20;
const VP: CanvasViewport = { tx: 40, ty: 104, scale: 0.62 };

// ── The event grid (seconds) ───────────────────────────────────────────────
const T = {
  reach: 0.42, // the pointer leaves for the navigator's Canvas row
  click: 1.1,
  lift: 1.16, // the three links lift off the page as chips; the rest of the Entry steps back
  chrome: 1.22, // tab, trail, selection and the Canvas's ground: in place, under the page
  go: 1.38, // the chips leave (staggered)
  stagger: 0.1,
  carryDur: 1.1,
  collapse: 1.44, // the page contracts into Elias's card
  collapseDur: 1.16,
  sections: 1.72, // the Canvas's Sections resolve where the page has left
  others: 2.56, // the rest of the Canvas, once the four have landed
  lines: 2.86, // then its own connections
  linesDur: 0.62,
  travel: 3.66, // the camera travels the thread to the Scene card
  travelDur: 1.5,
  pointer: 5.02,
  open: 5.58, // click on the Scene card
  morph: 5.64,
  morphDur: 1.12,
  still: 6.76, // the writer is back: the caret, still
  newline: 7.06, // Return
  type: 7.24,
  end: 8.7,
};

// ── Authentic states ───────────────────────────────────────────────────────

const PROSE = [...SCENE_PROSE, SCENE_OPEN_LINE + SCENE_OPEN_TYPED];
const ENTRY: Plan = { ...PLANS.entry, cursor: undefined };
const canvasPlan = (hover?: string): Plan => ({ ...PLANS.canvas, cursor: undefined, canvas: VP, hoverCard: hover });
/** The Scene, as it opens (caret 0), back (caret at the end of its last line) and being written (a new paragraph). */
const returnPlan = (state: { typed?: string; caret?: number } = {}): Plan => ({
  ...PLANS.return,
  mainNode:
    state.typed === undefined ? (
      <ManuscriptDoc eyebrow="The East Stair" title={SCENE.title} paragraphs={PROSE.slice(0, -1)} openLine={PROSE[PROSE.length - 1]} typed="" caret={state.caret ?? 0} />
    ) : (
      <ManuscriptDoc eyebrow="The East Stair" title={SCENE.title} paragraphs={PROSE} openLine="" typed={state.typed} caret={state.caret ?? 1} />
    ),
});

/** In the order they leave: each away from the ones still waiting (Thomas goes left, the ledger up, Mara right — last, so she crosses nothing). */
const RELATED = [
  { key: "thomas", text: "Thomas Vale" },
  { key: "ledger", text: WORKSPACE.ledger.title },
  { key: "mara", text: "Mara Vale" },
] as const;
const CARD_OF = (id: string) => NIGHT_CARDS.findIndex((c) => c.id === id);
const CARRIED_CARDS = [CARD_OF("elias"), ...RELATED.map((r) => CARD_OF(r.key))];
const SCENE_CARD = CARD_OF("scene");
/** A card's element in the Canvas world: after the Sections and the connections' one SVG. */
const cardChild = (i: number) => NIGHT_SECTIONS.length + 1 + i + 1;
const CARD_RADIUS = 7 * VP.scale;

const probes = [
  {
    id: "entry",
    node: (
      <Window>
        <ShellFor plan={ENTRY} />
      </Window>
    ),
    anchors: [
      { key: "elias", selector: ".r2-page-title", mode: "field" as const, text: ELIAS.title },
      ...RELATED.map((r) => ({ key: r.key, selector: ".r2-prop-link", text: r.text })),
      ...RELATED.map((r) => ({ key: `${r.key}Box`, selector: ".r2-prop-link", mode: "box" as const, text: r.text })),
      { key: "canvasRow", selector: ".r2-nav .r2-row", mode: "box" as const, text: WORKSPACE.canvas.title },
      { key: "main", selector: ".r2-main", mode: "box" as const },
    ],
  },
  {
    id: "canvas",
    node: (
      <Window>
        <ShellFor plan={canvasPlan()} />
      </Window>
    ),
    anchors: [
      { key: "elias", selector: ".r2-canvas-card-title", text: ELIAS.title },
      ...RELATED.map((r) => ({ key: r.key, selector: ".r2-canvas-card-title", text: r.text })),
      { key: "eliasCard", selector: ".r2-canvas-card", mode: "box" as const, text: ELIAS.title },
      ...RELATED.map((r) => ({ key: `${r.key}Card`, selector: ".r2-canvas-card", mode: "box" as const, text: r.text })),
      { key: "plantCard", selector: ".r2-canvas-card", mode: "box" as const, text: "Plant it" },
      { key: "sceneCard", selector: ".r2-canvas-card--scene", mode: "box" as const },
      { key: "scenePreview", selector: ".r2-canvas-card--scene .r2-canvas-card-preview", text: "Seventeen was empty." },
    ],
  },
  {
    id: "scene",
    node: (
      <Window>
        <ShellFor plan={returnPlan()} />
      </Window>
    ),
    anchors: [
      { key: "sentence", selector: ".r2-prose p", text: "Seventeen was empty." },
      { key: "main", selector: ".r2-main", mode: "box" as const },
    ],
  },
];

// ── The camera ─────────────────────────────────────────────────────────────

const START = on(680, 400, 1.45); // the Entry, with the navigator in frame
const WIDE = on(900, 404, 1.55); // the whole story map, the window's edges just out of frame
const SCENE_S = 2.7;

type Station = [number, number, number]; // x, y, ln(scale)

function catmull(pts: Station[], u: number): Station {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-9, Math.max(0, u * n));
  const i = Math.floor(f);
  const s = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  return p1.map((_, d) => {
    const a = p0[d], b = p1[d], c = p2[d], e = p3[d];
    return 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - e) * s * s + (-a + 3 * b - 3 * c + e) * s * s * s);
  }) as Station;
}

/**
 * The thread's path at an even pace: the spline re-parameterised by how far
 * the picture moves (world distance × scale, plus a term for the zoom), so the
 * camera neither slows at a station nor hurries between them — the ease is
 * the whole move's, applied once.
 */
function evenPath(pts: Station[]): (v: number) => Station {
  const N = 240;
  const at = Array.from({ length: N + 1 }, (_, i) => catmull(pts, i / N));
  const cum = [0];
  for (let i = 1; i <= N; i++) {
    const [x0, y0, l0] = at[i - 1];
    const [x1, y1, l1] = at[i];
    const s = Math.exp((l0 + l1) / 2);
    cum.push(cum[i - 1] + Math.hypot((x1 - x0) * s, (y1 - y0) * s) + 900 * Math.abs(l1 - l0));
  }
  const total = cum[N];
  return (v) => {
    const target = clamp01(v) * total;
    let i = 1;
    while (i < N && cum[i] < target) i++;
    const f = (target - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9);
    return at[i - 1].map((a, d) => lerp(a, at[i][d], f)) as Station;
  };
}

let threadCache: ((v: number) => Station) | null = null;
function thread(m: Probes) {
  if (threadCache) return threadCache;
  const c = m.canvas;
  threadCache = evenPath([
    [WIDE.x, WIDE.y, Math.log(WIDE.s)],
    [center(c.ledgerCard.box).x, center(c.ledgerCard.box).y + 20, Math.log(2.0)],
    [center(c.plantCard.box).x, center(c.plantCard.box).y - 10, Math.log(2.35)],
    [center(c.sceneCard.box).x - 6, center(c.sceneCard.box).y + 4, Math.log(SCENE_S)],
  ]);
  return threadCache;
}

function cameraAt(t: number, m: Probes): CameraState {
  if (t < T.travel) {
    const q = span(t, T.lift + 0.12, 1.4, CAMERA);
    return { x: lerp(START.x, WIDE.x, q), y: lerp(START.y, WIDE.y, q), s: logLerp(START.s, WIDE.s, q), ax: START.ax, ay: START.ay };
  }
  if (t < T.morph) {
    const [x, y, ls] = thread(m)(span(t, T.travel, T.travelDur, CAMERA));
    return { x, y, s: Math.exp(ls), ax: WIDE.ax, ay: WIDE.ay };
  }
  // The card opens into the Scene: the camera rides the line it carries.
  const close = cameraAt(T.morph - 1e-6, m);
  const { at } = sentence(t, m);
  const p = span(t, T.morph + 0.05, T.morphDur + 0.1, CARRY);
  const from = toScreen(close, { x: m.canvas.scenePreview.text.x, y: m.canvas.scenePreview.text.cy });
  const end = repin(PLANS.return.camera, { x: m.scene.sentence.text.x, y: m.scene.sentence.text.cy });
  return { x: at.x, y: at.y, s: logLerp(close.s, end.s, p), ax: lerp(from.x, end.ax, p), ay: lerp(from.y, end.ay, p) };
}

/** The preview line → the prose line: its carrier, and the Scene pinned to it (V1). */
function sentence(t: number, m: Probes) {
  const p = span(t, T.morph, T.morphDur, CARRY);
  const c = carrierAt(m.canvas.scenePreview, m.scene.sentence, p, { kind: "arc", lift: 0.04 });
  const k = c.size / m.scene.sentence.style.fontSize;
  const pin = { k, x: c.at.x - m.scene.sentence.text.x * k, y: c.at.y - m.scene.sentence.text.cy * k };
  return { p, at: c.at, pin };
}

// ── The page contracting into Elias's card ─────────────────────────────────

const ELIAS_PATH: Path = { kind: "arc", lift: 0.05 };
const CHIP_PATH: Path = { kind: "arc", lift: 0.1 };

/** The Entry's page, pinned to its travelling title: transform, clip (in the page's own px) and its surface on screen. */
function collapse(t: number, m: Probes) {
  const p = span(t, T.collapse, T.collapseDur, CARRY);
  const title = m.entry.elias;
  const pinAt = (q: number) => {
    const c = carrierAt(title, m.canvas.elias, q, ELIAS_PATH);
    const k = c.size / title.style.fontSize;
    return { k, x: c.at.x - title.text.x * k, y: c.at.y - title.text.cy * k };
  };
  const pin = pinAt(p);
  const end = pinAt(1);
  const card = m.canvas.eliasCard.box;
  const main = m.entry.main.box;
  const page: Rect = { x: main.x, y: main.y, w: main.w, h: SHELL.height - main.y };
  const cardLocal: Rect = { x: (card.x - end.x) / end.k, y: (card.y - end.y) / end.k, w: card.w / end.k, h: card.h / end.k };
  const local = lerpRect(page, cardLocal, p);
  const world: Rect = { x: pin.x + local.x * pin.k, y: pin.y + local.y * pin.k, w: local.w * pin.k, h: local.h * pin.k };
  return { p, pin, local, world, radius: lerp(0, CARD_RADIUS, p) };
}

// ── The frame ──────────────────────────────────────────────────────────────

const LINE_LENGTH = NIGHT_LINES.map((l) => {
  const a = NIGHT_CARDS.find((c) => c.id === l.from)!;
  const b = NIGHT_CARDS.find((c) => c.id === l.to)!;
  const e = endpoints(a, b);
  return Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y);
});

const RETURN_TIMES = typingSchedule(SCENE_RETURN_TYPED, T.type, 17, 1);
const CARD_SURFACE = { background: "var(--r2-surface-raised)", shadow: "var(--r2-ring), var(--r2-shadow-sm)" };

function frame(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cameraAt(t, m);
  const lifted = t >= T.lift;
  const chrome = span(t, T.chrome, 0.45, EASE);
  const sections = span(t, T.sections, 0.5, SETTLE);
  const others = span(t, T.others, 0.4, SETTLE);
  const lines = span(t, T.lines, T.linesDur, SETTLE);
  const labels = span(t, T.lines + T.linesDur - 0.1, 0.3, SETTLE);
  const col = collapse(t, m);
  const chipP = (i: number) => span(t, T.go + i * T.stagger, T.carryDur, CARRY);
  // A card is the Canvas's own once its carrier has landed (the real card takes over: its eyebrow and preview resolve).
  const docked = (k: number) => span(t, (k === 0 ? T.collapse + T.collapseDur : T.go + (k - 1) * T.stagger + T.carryDur) - 0.02, 0.22, SETTLE);
  const morphing = t >= T.morph;
  const s = sentence(t, m);
  const opened = morphing && s.p >= 1;

  // ── The Canvas's own staging (film-only: the order in which its real parts arrive).
  // Text that differs in place (the trail) never overlaps itself: the old leaves, then the new arrives.
  const SWAPPED = ".r2-contextbar nav, .r2-contextbar-actions > .r2-action:first-child";
  const oldText = 1 - span(t, T.chrome, 0.12, EASE);
  const newText = span(t, T.chrome + 0.14, 0.2, EASE);
  const canvasCss = scoped(`${scope}-canvas`, {
    [SWAPPED]: `opacity: ${chrome > 0 ? Math.min(1, newText / chrome) : 0};`,
    ".r2-canvas-section": `opacity: ${sections};`,
    ".r2-canvas-world > .r2-canvas-card": `opacity: ${others};`,
    ...Object.fromEntries(CARRIED_CARDS.map((c, k) => [`.r2-canvas-world > .r2-canvas-card:nth-child(${cardChild(c)})`, `opacity: ${docked(k)};`])),
    ...Object.fromEntries(
      NIGHT_LINES.flatMap((_, i) => {
        const L = LINE_LENGTH[i];
        return [
          [`.r2-canvas-line:nth-of-type(${i + 1}) .r2-canvas-line-stroke`, `stroke-dasharray: ${L + 2} ${L + 2}; stroke-dashoffset: ${(L + 2) * (1 - lines)}; ${lines < 1 ? "marker-end: none;" : ""}`],
          [`.r2-canvas-line:nth-of-type(${i + 1}) .r2-canvas-line-label`, `opacity: ${labels};`],
        ];
      })
    ),
    ...(morphing
      ? {
          [`.r2-canvas-world > .r2-canvas-card:nth-child(${cardChild(SCENE_CARD)})`]: `opacity: ${1 - span(s.p, 0, 0.22, SETTLE)};`,
          [`.r2-canvas-world > .r2-canvas-card:nth-child(${cardChild(SCENE_CARD)}) .r2-canvas-card-preview`]: "visibility: hidden;",
        }
      : {}),
  });

  // ── The Entry, once its objects have lifted: what is left steps back to a trace, then folds into the card.
  const ink = lerp(1, 0.32, span(t, T.lift, 0.36, EASE)) * (1 - span(col.p, 0.3, 0.45, SETTLE));
  const entryDocCss = scoped(`${scope}-entry`, {
    ".r2-main .r2-writing": `opacity: ${ink};`,
    ".r2-page-title": "visibility: hidden !important;",
    ".r2-prop-link": "visibility: hidden !important;",
  });

  // ── The pointer: to the Canvas row, click; later, onto the Scene card, click.
  const row = center(m.entry.canvasRow.box);
  const cardAt = { x: m.canvas.sceneCard.box.x + m.canvas.sceneCard.box.w * 0.62, y: m.canvas.sceneCard.box.y + m.canvas.sceneCard.box.h * 0.58 };
  const startPtr = { x: 560, y: 470 };
  const p1 = span(t, T.reach, T.click - T.reach - 0.04, EASE);
  const p2 = span(t, T.pointer, T.open - T.pointer - 0.04, EASE);
  const enter = { x: cardAt.x - 90, y: cardAt.y + 70 };
  const ptr =
    t < T.pointer
      ? { x: lerp(startPtr.x, row.x - 40, p1), y: lerp(startPtr.y, row.y + 2, p1), o: 1 - span(t, T.travel, 0.3, EASE) }
      : { x: lerp(enter.x, cardAt.x, p2), y: lerp(enter.y, cardAt.y, p2), o: span(t, T.pointer, 0.2, EASE) * (1 - span(t, T.morph + 0.1, 0.25, EASE)) };
  const pressed = (t >= T.click && t < T.click + 0.1) || (t >= T.open && t < T.open + 0.1);
  const hover = t >= T.open - 0.24 && !morphing ? "scene" : undefined;

  // ── The Scene card opening (V1): its surface grows, the Scene pinned to the carried line resolves in it.
  const card = m.canvas.sceneCard.box;
  const pin0 = sentence(T.morph, m).pin;
  const sceneCardLocal: Rect = { x: (card.x - pin0.x) / pin0.k, y: (card.y - pin0.y) / pin0.k, w: card.w / pin0.k, h: card.h / pin0.k };
  const main = m.scene.main.box;
  const column: Rect = { x: main.x, y: main.y, w: SHELL.width - main.x, h: SHELL.height - main.y };
  const mask = { rect: lerpRect(sceneCardLocal, column, s.p), radius: lerp(CARD_RADIUS / pin0.k, 0, s.p) };
  const prose = span(s.p, 0.12, 0.42, SETTLE);
  const surface = 1 - span(s.p, 0.55, 0.45, SETTLE);

  // ── Back: the caret still for a breath, then Return and the typing (the writer's; never carried).
  const back = t >= T.still;
  const typing = t >= T.newline;
  const typed = typing ? SCENE_RETURN_TYPED.slice(0, typedCount(Math.round(t * 30), RETURN_TIMES)) : undefined;
  const scenePlan = returnPlan(typing ? { typed, caret: 1 } : { caret: back ? 1 : 0 });
  const hideCarried = scoped(`${scope}-scene`, { ".r2-prose p:nth-child(4)": `visibility: ${opened ? "visible" : "hidden"};` });

  return (
    <Field>
      <Camera state={cam}>
        {!opened && (
          <>
            {/* Before the lift: the whole Entry. After: its environment (the page itself is drawn below, contracting). */}
            {chrome < 1 && (
              <Environment
                scope={`${scope}-entryenv`}
                plan={ENTRY}
                css={scoped(`${scope}-entryenv`, { [SWAPPED]: `opacity: ${oldText};`, ...(lifted ? {} : { ".r2-main .r2-writing": "visibility: visible;" }) })}
              />
            )}
            {/* The Canvas, resolving in place: its environment over the Entry's (same geometry: only what differs changes). */}
            {chrome > 0 && (
              <div style={{ position: "absolute", left: 0, top: 0, opacity: chrome }}>
                <Window bare>
                  <div data-pf={`${scope}-canvas`}>
                    <style>{canvasCss}</style>
                    <ShellFor plan={canvasPlan(hover)} />
                  </div>
                </Window>
              </div>
            )}
            {/* FILM-ONLY: the Entry's page — Elias — contracting into his card, its notes folding in as it closes. */}
            {lifted && col.p < 1 && (
              <>
                <LightRoot>
                  <Surrogate
                    from={{ rect: col.world, radius: col.radius, background: "var(--r2-bg)" }}
                    to={{ rect: col.world, radius: col.radius, ...CARD_SURFACE }}
                    p={0}
                    fill={span(col.p, 0.35, 0.55, SETTLE)}
                  />
                </LightRoot>
                <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${col.pin.x}px, ${col.pin.y}px) scale(${col.pin.k})`, transformOrigin: "0 0" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, width: SHELL.width, height: SHELL.height, clipPath: `inset(${col.local.y}px ${SHELL.width - col.local.x - col.local.w}px ${SHELL.height - col.local.y - col.local.h}px ${col.local.x}px round ${col.radius / col.pin.k}px)` }}>
                    <Document scope={`${scope}-entry`} plan={ENTRY} css={entryDocCss} />
                  </div>
                </div>
              </>
            )}
            {/* FILM-ONLY: the three relationships — chips lifted off the page, each growing into its card. */}
            {/* (Drawn last-to-leave first: a chip already moving passes over the ones still waiting.) */}
            {lifted &&
              [...RELATED.entries()].reverse().map(([i, r]) => {
                const p = chipP(i);
                if (docked(i + 1) >= 1) return null;
                const lift = span(t, T.lift, 0.22, SETTLE);
                const link = m.entry[`${r.key}Box`].box;
                const chipBox = { x: link.x - 3, y: link.y - 1, w: link.w + 6, h: link.h + 2 };
                const c = carrierAt(m.entry[r.key], m.canvas[r.key], p, CHIP_PATH);
                return (
                  <div key={r.key} style={{ position: "absolute", left: 0, top: 0 }}>
                    <LightRoot>
                      <HeldSurface from={m.entry[r.key]} to={m.canvas[r.key]} fromBox={chipBox} toBox={m.canvas[`${r.key}Card`].box} at={c.at} size={c.size} p={p} radius={[4, CARD_RADIUS]} background={CARD_SURFACE.background} shadow={CARD_SURFACE.shadow} opacity={lift} />
                    </LightRoot>
                    <TextCarrier text={r.text} from={m.entry[r.key]} to={m.canvas[r.key]} p={p} swap={clamp01((p - 0.25) / 0.3)} path={CHIP_PATH} />
                  </div>
                );
              })}
            {lifted && docked(0) < 1 && (
              <TextCarrier text={ELIAS.title} from={m.entry.elias} to={m.canvas.elias} p={col.p} swap={clamp01((col.p - 0.3) / 0.25)} path={ELIAS_PATH} />
            )}
          </>
        )}
        {morphing && (
          <LightRoot>
            <div style={{ position: "absolute", left: 0, top: 0, transform: opened ? undefined : `translate(${s.pin.x}px, ${s.pin.y}px) scale(${s.pin.k})`, transformOrigin: "0 0" }}>
              {!opened && (
                <div style={{ position: "absolute", left: mask.rect.x, top: mask.rect.y, width: mask.rect.w, height: mask.rect.h, borderRadius: mask.radius, background: "var(--r2-surface-raised)", boxShadow: "0 0 0 1px rgba(20 22 28 / 0.07), 0 18px 48px -12px rgba(20 22 28 / 0.22)", opacity: surface }} />
              )}
              <div style={{ position: "absolute", left: 0, top: 0, width: SHELL.width, height: SHELL.height, opacity: opened ? 1 : prose, clipPath: opened ? undefined : `inset(${mask.rect.y}px ${SHELL.width - mask.rect.x - mask.rect.w}px ${SHELL.height - mask.rect.y - mask.rect.h}px ${mask.rect.x}px round ${mask.radius}px)` }}>
                <Window>
                  <div data-pf={`${scope}-scene`}>
                    <style>{hideCarried}</style>
                    <ShellFor plan={scenePlan} />
                  </div>
                </Window>
              </div>
            </div>
          </LightRoot>
        )}
        {/* FILM-ONLY: the Scene card's preview line, carried into its line in the prose. */}
        {morphing && !opened && (
          <TextCarrier text="Seventeen was empty." from={m.canvas.scenePreview} to={m.scene.sentence} p={s.p} swap={clamp01((s.p - 0.2) / 0.5)} path={{ kind: "arc", lift: 0.04 }} />
        )}
        {ptr.o > 0.001 && <Cursor x={ptr.x} y={ptr.y} opacity={ptr.o} pressed={pressed} size={CURSOR / cam.s} />}
      </Camera>
    </Field>
  );
}

// ── Sound and phases ───────────────────────────────────────────────────────

const KEYS = [keyA, keyB, keyC, keyD];
const cues: Cue[] = [
  { at: T.click - 0.03, src: clickSound, volume: 0.45, seconds: 0.15, note: "the click on The Night of the Fire" },
  { at: T.collapse + T.collapseDur - 0.05, src: settleSound, volume: 0.22, seconds: 0.5, note: "the four have landed: one quiet settle (no connection sounds)" },
  { at: T.open - 0.03, src: clickSound, volume: 0.45, seconds: 0.15, note: "the click on the Scene card" },
  { at: T.morph + T.morphDur - 0.04, src: settleSound, volume: 0.16, seconds: 0.5, note: "quiet settle: back in the Scene" },
  { at: T.newline - 0.01, src: keyEnd, volume: 0.42, seconds: 0.12, note: "Return — after 0.3s of stillness" },
  ...[...SCENE_RETURN_TYPED].map((ch, i) => ({ at: RETURN_TIMES[i] - 0.012, src: ch === " " ? keySpace : ch === "." ? keyEnd : KEYS[(i * 7 + 3) % 4], volume: 0.4, seconds: 0.12, note: "typing" })).filter((c) => c.at < T.end),
];

const phases: Phase[] = [
  { from: 0, to: T.lift, kind: "authentic", label: "Frame 11 · Elias Vale → The Night of the Fire" },
  { from: T.lift, to: T.others, kind: "film-only", label: "the Entry's objects become its cards; the page becomes Elias's" },
  { from: T.others, to: T.lines + T.linesDur + 0.2, kind: "film-only", label: "the Canvas resolves; its own connections draw" },
  { from: T.lines + T.linesDur + 0.2, to: T.morph, kind: "authentic", label: "the Canvas (62%) · the camera travels the thread" },
  { from: T.morph, to: T.morph + T.morphDur, kind: "film-only", label: "the Scene card opens into the Scene" },
  { from: T.morph + T.morphDur, to: T.end + 1, kind: "authentic", label: "Frame 13 · the caret, then the writer types" },
];

export const STUDY_CV2: StudyDef = { id: "CV2", duration: T.end, probes, phases, cues, frame };
export const STUDY_CV2_STRIP = [0.9, 1.3, 1.5, 1.7, 1.9, 2.1, 2.35, 2.7, 3.2, 4.4, 6.0, 7.05];
