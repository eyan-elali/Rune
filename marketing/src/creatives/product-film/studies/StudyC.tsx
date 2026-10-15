import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE, typedCount, typingSchedule } from "../../../foundation/time";
import { endpoints } from "@/components/rune2/CanvasConnections";
import { ELIAS, NIGHT_CARDS, NIGHT_LINES, NIGHT_SECTIONS, SCENE, SCENE_OPEN_LINE, SCENE_OPEN_TYPED, SCENE_PROSE, SCENE_RETURN_TYPED, WORKSPACE } from "../../../data/salt-house";
import type { CanvasViewport } from "../../../ui/Canvas";
import { ManuscriptDoc } from "../../../ui/Manuscript";
import { PLANS, SHELL, ShellFor, Window, on, type Plan } from "../Keyframes";
import { Surrogate, TextCarrier, carrierAt, type Path, type Surface } from "./Carrier";
import { CAMERA, CARRY, SETTLE, clamp01, lerp, lerpRect, logLerp, span, type Point, type Rect } from "./motion";
import type { Probes } from "./probe";
import { Field, LightRoot, frameScope, type Cue, type Phase, type StudyDef } from "./Study";
import clickSound from "../../../audio/click.wav";
import airSound from "../../../audio/air.wav";
import keyA from "../../../audio/key-1.wav";
import keyB from "../../../audio/key-2.wav";
import keyC from "../../../audio/key-3.wav";
import keyD from "../../../audio/key-4.wav";
import keySpace from "../../../audio/key-space.wav";
import keyEnd from "../../../audio/key-end.wav";

// STUDY C — Entry → Canvas → back to the Scene.
//
// Authentic states: frame 11 (Elias Vale's Entry); the Canvas "The Night of
// the Fire", wide (a real zoom, 62%); frame 12 (the Scene card, about to be
// clicked); frame 13 (back in The Key Cabinet, the new paragraph begun).
//
// The idea: structured information → freeform thinking → back to the story,
// without a cut. When the writer opens the Canvas, the objects the Entry is
// about keep their identity: Elias (the Entry's own title) leads, and the
// three things he is Connected to follow, each growing from its place in the
// Entry into its card on the Canvas (a Canvas card is a representation of
// that same object — architecture §21). The relationships stay in the Entry,
// which dissolves; the Canvas's OWN connections then draw between the cards —
// the one stroke-drawn moment in the film. The camera travels the thread to
// the Scene card; the card opens into the Scene, its preview line ("Seventeen
// was empty." — already set in the manuscript's face) becoming the line in
// the prose, and the writer types the answer beneath it.

const CURSOR = 30 / 20;
const VP: CanvasViewport = { tx: 40, ty: 104, scale: 0.62 };

// ── The event grid (seconds) ───────────────────────────────────────────────
const T = {
  reach: 0.12, // the pointer leaves for the navigator's Canvas row
  click: 0.68,
  chrome: 0.74, // the tab, trail and selection become the Canvas's; the Entry dissolves
  elias: 0.74, // the Entry's subject leads
  related: 0.86, // its relationships follow, as a group
  carry: 1.1,
  sections: 0.92,
  others: 1.6, // the rest of the Canvas inks in once the four have nearly landed
  lines: 2.02, // the Canvas's own connections draw
  linesDur: 0.62,
  travel: 2.86, // the camera travels the thread to the Scene card
  travelDur: 1.5,
  pointer: 3.92,
  open: 4.46, // click on the Scene card
  morph: 4.52,
  morphDur: 1.12,
  newline: 5.78, // Return: a new paragraph
  type: 5.98,
  end: 7.4,
};

// ── Authentic states ───────────────────────────────────────────────────────

const PROSE = [...SCENE_PROSE, SCENE_OPEN_LINE + SCENE_OPEN_TYPED];
const ENTRY: Plan = { ...PLANS.entry, cursor: undefined };
const canvasPlan = (hover?: string): Plan => ({ ...PLANS.canvas, cursor: undefined, canvas: VP, hoverCard: hover });
const returnPlan = (typed?: string, caret = 0): Plan => ({
  ...PLANS.return,
  mainNode: <ManuscriptDoc eyebrow="The East Stair" title={SCENE.title} paragraphs={PROSE} openLine={typed === undefined ? undefined : ""} typed={typed} caret={caret} />,
});

/** The four objects that keep their identity: [key, the Entry's representation, the Canvas card's index in NIGHT_CARDS]. */
const CARRIED = [
  { key: "elias", text: ELIAS.title, card: NIGHT_CARDS.findIndex((c) => c.id === "elias") },
  { key: "mara", text: "Mara Vale", card: NIGHT_CARDS.findIndex((c) => c.id === "mara") },
  { key: "thomas", text: "Thomas Vale", card: NIGHT_CARDS.findIndex((c) => c.id === "thomas") },
  { key: "ledger", text: WORKSPACE.ledger.title, card: NIGHT_CARDS.findIndex((c) => c.id === "ledger") },
] as const;
const SCENE_CARD = NIGHT_CARDS.findIndex((c) => c.id === "scene");
/** A card's element in the Canvas world: after the Sections and the connections' one SVG. */
const cardChild = (i: number) => NIGHT_SECTIONS.length + 1 + i + 1;

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
      { key: "mara", selector: ".r2-prop-link", text: "Mara Vale" },
      { key: "thomas", selector: ".r2-prop-link", text: "Thomas Vale" },
      { key: "ledger", selector: ".r2-prop-link", text: WORKSPACE.ledger.title },
      { key: "maraBox", selector: ".r2-prop-link", mode: "box" as const, text: "Mara Vale" },
      { key: "thomasBox", selector: ".r2-prop-link", mode: "box" as const, text: "Thomas Vale" },
      { key: "ledgerBox", selector: ".r2-prop-link", mode: "box" as const, text: WORKSPACE.ledger.title },
      { key: "canvasRow", selector: ".r2-nav .r2-row", mode: "box" as const, text: WORKSPACE.canvas.title },
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
      ...CARRIED.map((c) => ({ key: c.key, selector: ".r2-canvas-card-title", text: c.text })),
      ...CARRIED.map((c) => ({ key: `${c.key}Card`, selector: ".r2-canvas-card", mode: "box" as const, text: c.text })),
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

// ── Helpers ────────────────────────────────────────────────────────────────

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const repin = (c: CameraState, P: Point): CameraState => ({ x: P.x, y: P.y, s: c.s, ax: c.ax + (P.x - c.x) * c.s, ay: c.ay + (P.y - c.y) * c.s });
const toScreen = (c: CameraState, q: Point): Point => ({ x: c.ax + (q.x - c.x) * c.s, y: c.ay + (q.y - c.y) * c.s });

/** Catmull–Rom through points, at u in [0, 1] (uniform): one continuous path through the thread's stations. */
function through4<T extends number[]>(pts: T[], u: number): T {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-9, Math.max(0, u * n));
  const i = Math.floor(f);
  const s = f - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n, i + 2)];
  return p1.map((_, d) => {
    const a = p0[d], b = p1[d], c = p2[d], e = p3[d];
    return 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - e) * s * s + (-a + 3 * b - 3 * c + e) * s * s * s);
  }) as T;
}

// ── The camera ─────────────────────────────────────────────────────────────

const START = on(680, 400, 1.45); // the Entry, with the navigator in frame
const WIDE = on(900, 404, 1.55); // the whole story map, the window's edges just out of frame
const SCENE_S = 2.7;
const PATH: Path = { kind: "arc", lift: 0.1 };

function cameraAt(t: number, m: Probes): CameraState {
  if (t < T.travel) {
    const q = span(t, T.chrome + 0.08, 1.2, CAMERA);
    return { x: lerp(START.x, WIDE.x, q), y: lerp(START.y, WIDE.y, q), s: logLerp(START.s, WIDE.s, q), ax: START.ax, ay: START.ay };
  }
  if (t < T.morph) {
    // Down the thread: the ledger, the "plant it" note, the Scene card — one continuous path, scale in log space.
    const c = m.canvas;
    const stations: [number, number, number][] = [
      [WIDE.x, WIDE.y, Math.log(WIDE.s)],
      [center(c.ledgerCard.box).x, center(c.ledgerCard.box).y + 20, Math.log(2.0)],
      [center(c.plantCard.box).x, center(c.plantCard.box).y - 10, Math.log(2.35)],
      [center(c.sceneCard.box).x - 6, center(c.sceneCard.box).y + 4, Math.log(SCENE_S)],
    ];
    const u = span(t, T.travel, T.travelDur, CAMERA);
    const [x, y, ls] = through4(stations, u);
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

/** The preview line → the prose line: its carrier, and the Scene pinned to it. */
function sentence(t: number, m: Probes) {
  const p = span(t, T.morph, T.morphDur, CARRY);
  const c = carrierAt(m.canvas.scenePreview, m.scene.sentence, p, { kind: "arc", lift: 0.04 });
  const k = c.size / m.scene.sentence.style.fontSize;
  const pin = { k, x: c.at.x - m.scene.sentence.text.x * k, y: c.at.y - m.scene.sentence.text.cy * k };
  return { p, at: c.at, pin };
}

// ── The frame ──────────────────────────────────────────────────────────────

const LINE_LENGTH = NIGHT_LINES.map((l) => {
  const a = NIGHT_CARDS.find((c) => c.id === l.from)!;
  const b = NIGHT_CARDS.find((c) => c.id === l.to)!;
  const e = endpoints(a, b);
  return Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y);
});

const RETURN_TIMES = typingSchedule(SCENE_RETURN_TYPED, T.type, 17, 1);

function frame(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cameraAt(t, m);
  const chrome = span(t, T.chrome, 0.4, EASE);
  const sections = span(t, T.sections, 0.5, SETTLE);
  const others = span(t, T.others, 0.4, SETTLE);
  const pe = span(t, T.elias, T.carry, CARRY);
  const pr = span(t, T.related, T.carry, CARRY);
  const docked = (k: string) => span(t, (k === "elias" ? T.elias : T.related) + T.carry - 0.02, 0.2, SETTLE);
  const lines = span(t, T.lines, T.linesDur, SETTLE);
  const labels = span(t, T.lines + T.linesDur - 0.1, 0.3, SETTLE);
  const morphing = t >= T.morph;
  const s = sentence(t, m);
  const opened = morphing && s.p >= 1;

  // ── The Canvas's own staging (film-only: the order in which its real parts arrive).
  const canvasCss = `
    [data-pf="${scope}-c-canvas"] .r2-canvas-section { opacity: ${sections}; }
    [data-pf="${scope}-c-canvas"] .r2-canvas-world > .r2-canvas-card { opacity: ${others}; }
    ${CARRIED.map((c) => `[data-pf="${scope}-c-canvas"] .r2-canvas-world > .r2-canvas-card:nth-child(${cardChild(c.card)}) { opacity: ${docked(c.key)}; }`).join("\n")}
    ${NIGHT_LINES.map((_, i) => {
      const L = LINE_LENGTH[i];
      return `[data-pf="${scope}-c-canvas"] .r2-canvas-line:nth-of-type(${i + 1}) .r2-canvas-line-stroke { stroke-dasharray: ${L + 2} ${L + 2}; stroke-dashoffset: ${(L + 2) * (1 - lines)}; ${lines < 1 ? "marker-end: none;" : ""} }
      [data-pf="${scope}-c-canvas"] .r2-canvas-line:nth-of-type(${i + 1}) .r2-canvas-line-label { opacity: ${labels}; }`;
    }).join("\n")}
    ${morphing ? `[data-pf="${scope}-c-canvas"] .r2-canvas-world > .r2-canvas-card:nth-child(${cardChild(SCENE_CARD)}) { opacity: ${1 - span(s.p, 0, 0.22, SETTLE)}; } [data-pf="${scope}-c-canvas"] .r2-canvas-world > .r2-canvas-card:nth-child(${cardChild(SCENE_CARD)}) .r2-canvas-card-preview { visibility: hidden; }` : ""}
    [data-pf="${scope}-c-entry"] .r2-page-title { visibility: ${t >= T.elias ? "hidden" : "visible"}; }
  `;

  // ── The pointer: to the Canvas row, click; later, onto the Scene card, click.
  const row = center(m.entry.canvasRow.box);
  const cardAt = { x: m.canvas.sceneCard.box.x + m.canvas.sceneCard.box.w * 0.62, y: m.canvas.sceneCard.box.y + m.canvas.sceneCard.box.h * 0.58 };
  const startPtr = { x: 560, y: 470 };
  const p1 = span(t, T.reach, T.click - T.reach - 0.04, EASE);
  const p2 = span(t, T.pointer, T.open - T.pointer - 0.04, EASE);
  const enter = { x: cardAt.x - 90, y: cardAt.y + 70 };
  const ptr = t < T.pointer ? { x: lerp(startPtr.x, row.x - 40, p1), y: lerp(startPtr.y, row.y + 2, p1), o: 1 - span(t, T.travel, 0.3, EASE) } : { x: lerp(enter.x, cardAt.x, p2), y: lerp(enter.y, cardAt.y, p2), o: span(t, T.pointer, 0.2, EASE) * (1 - span(t, T.morph + 0.1, 0.25, EASE)) };
  const pressed = (t >= T.click && t < T.click + 0.1) || (t >= T.open && t < T.open + 0.1);
  const hover = t >= T.open - 0.24 && !morphing ? "scene" : undefined;

  // ── The Scene card opening: its surface grows (film-only) and the Scene, pinned to the carried line, resolves in it.
  const card = m.canvas.sceneCard.box;
  const pin0 = sentence(T.morph, m).pin;
  const cardLocal: Rect = { x: (card.x - pin0.x) / pin0.k, y: (card.y - pin0.y) / pin0.k, w: card.w / pin0.k, h: card.h / pin0.k };
  // The content column to the window's own edges (the main region and the status zone beneath it).
  const main = m.scene.main.box;
  const column: Rect = { x: main.x, y: main.y, w: SHELL.width - main.x, h: SHELL.height - main.y };
  const mask = { rect: lerpRect(cardLocal, column, s.p), radius: lerp(7 * VP.scale / pin0.k, 0, s.p) };
  const prose = span(s.p, 0.12, 0.42, SETTLE);
  const surface = 1 - span(s.p, 0.55, 0.45, SETTLE);

  // ── Typing, once back.
  const typed = t >= T.newline ? SCENE_RETURN_TYPED.slice(0, typedCount(Math.round(t * 30), RETURN_TIMES)) : undefined;
  const caret = t >= T.newline ? 1 : 0;
  const hideCarried = `[data-pf="${scope}-c-scene"] .r2-prose p:nth-child(4) { visibility: ${opened ? "visible" : "hidden"}; }`;

  return (
    <Field>
      <Camera state={cam}>
        <style>{canvasCss}</style>
        {!opened && (
          <>
            {/* The Entry stays opaque beneath while the Canvas comes up over it: a true dissolve, never the stage showing through. */}
            {chrome < 1 && (
              <div style={{ position: "absolute", left: 0, top: 0 }}>
                <Window>
                  <div data-pf={`${scope}-c-entry`}>
                    <ShellFor plan={ENTRY} />
                  </div>
                </Window>
              </div>
            )}
            {chrome > 0 && (
              <div style={{ position: "absolute", left: 0, top: 0, opacity: chrome }}>
                <Window>
                  <div data-pf={`${scope}-c-canvas`}>
                    <ShellFor plan={canvasPlan(hover)} />
                    {/* FILM-ONLY: the four objects growing from their places in the Entry into their cards. */}
                    {CARRIED.map((c) => {
                      const p = c.key === "elias" ? pe : pr;
                      if (t < (c.key === "elias" ? T.elias : T.related) || docked(c.key) >= 1) return null;
                      const from = m.entry[c.key];
                      const to = m.canvas[c.key];
                      const fromBox = c.key === "elias" ? { x: from.text.x - 6, y: from.text.cy - from.style.lineHeight / 2, w: from.text.w + 12, h: from.style.lineHeight } : m.entry[`${c.key}Box`].box;
                      const src: Surface = { rect: fromBox, radius: 5, background: "transparent" };
                      const dst: Surface = { rect: m.canvas[`${c.key}Card`].box, radius: 7 * VP.scale, background: "var(--r2-surface-raised)", shadow: "var(--r2-ring), var(--r2-shadow-sm)" };
                      return (
                        <div key={c.key} style={{ position: "absolute", left: 0, top: 0 }}>
                          <Surrogate from={src} to={dst} p={p} fill={span(p, 0.15, 0.5, SETTLE)} />
                          <TextCarrier text={c.text} from={from} to={to} p={p} swap={clamp01((p - 0.25) / 0.45)} path={PATH} />
                        </div>
                      );
                    })}
                  </div>
                </Window>
              </div>
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
                <div data-pf={`${scope}-c-scene`}>
                  <style>{hideCarried}</style>
                  <ShellFor plan={returnPlan(typed, caret)} />
                </div>
              </Window>
            </div>
          </div>
          </LightRoot>
        )}
        {/* FILM-ONLY: the Scene card's preview line, carried into its line in the prose (the card's own title has
            no successor in frame — the Scene's title sits above it — so it leaves with the card). */}
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
  { at: T.sections, src: airSound, volume: 0.22, seconds: 2.2, note: "open air as the Canvas resolves — almost quiet" },
  { at: T.open - 0.03, src: clickSound, volume: 0.45, seconds: 0.15, note: "the click on the Scene card" },
  { at: T.newline - 0.01, src: keyEnd, volume: 0.42, seconds: 0.12, note: "Return — a new paragraph" },
  ...[...SCENE_RETURN_TYPED].map((ch, i) => ({ at: RETURN_TIMES[i] - 0.012, src: ch === " " ? keySpace : ch === "." ? keyEnd : KEYS[(i * 7 + 3) % 4], volume: 0.4, seconds: 0.12, note: "typing" })).filter((c) => c.at < T.end),
];

const phases: Phase[] = [
  { from: 0, to: T.chrome, kind: "authentic", label: "Frame 11 · Elias Vale → The Night of the Fire" },
  { from: T.chrome, to: T.lines, kind: "film-only", label: "the Entry's objects take their places as cards" },
  { from: T.lines, to: T.lines + T.linesDur + 0.2, kind: "film-only", label: "the Canvas's own connections draw" },
  { from: T.lines + T.linesDur + 0.2, to: T.morph, kind: "authentic", label: "the Canvas (62%) · the camera travels the thread" },
  { from: T.morph, to: T.morph + T.morphDur, kind: "film-only", label: "the Scene card opens into the Scene" },
  { from: T.morph + T.morphDur, to: T.end + 1, kind: "authentic", label: "Frame 13 · back in the Scene" },
];

export const STUDY_C: StudyDef = { id: "C", duration: T.end, probes, phases, cues, frame };
export const STUDY_C_STRIP = [0.5, 0.95, 1.2, 1.5, 1.85, 2.3, 2.9, 3.6, 4.3, 4.8, 5.2, 7.3];
