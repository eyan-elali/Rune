import type { CSSProperties } from "react";
import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE } from "../../../foundation/time";
import { WORKSPACE } from "../../../data/salt-house";
import { PLANS, SHELL, ShellFor, Window, type Plan } from "../Keyframes";
import { TextCarrier, carrierAt, type Path } from "./Carrier";
import { CAMERA, CARRY, DOLLY, SETTLE, clamp01, lerp, lerpRect, logLerp, span, type Point, type Rect } from "./motion";
import type { Measured, Probes } from "./probe";
import { Field, frameScope, type Cue, type Phase, type StudyDef } from "./Study";
import pulseA from "../../../audio/pulse-1.wav";
import pulseB from "../../../audio/pulse-2.wav";
import clickSound from "../../../audio/click.wav";
import whooshSoft from "../../../audio/whoosh-soft.wav";
import resolveTone from "../../../audio/resolve.wav";

// STUDY B — Inspector → Research Page → the whole window. The signature shot.
//
// Authentic source: frame 07 (the Scene's Inspector, Research → 1998 Guest
// Ledger under the pointer). Authentic destination: frame 08 (the ledger Page
// in its own tab, its Inspector beside it, the whole window on the stage).
// The semantic object is the title "1998 Guest Ledger".
//
// The idea: the Page grows OUT OF the relationship that points to it. On the
// ⌘-click the link's words lift and become the Page's title, and the Page is
// pinned to them — scaled with the words, revealed through a mask that starts
// as the link's own hover pill — so the whole Page unfolds from the word as it
// travels from the margin (the Inspector) to the centre of the work. The mask
// then opens to the whole window and the camera pulls back to the stage: the
// manuscript on the left, the Workspace around it, the ledger at the centre.
// On the motif's resolving note, the Scene the ledger came from is lit in all
// three places it appears — its row, its tab, the ledger's "Referenced by".

const TITLE = WORKSPACE.ledger.title;
const CURSOR = 30 / 20;

// ── The event grid (seconds) ───────────────────────────────────────────────
const T = {
  tick1: 0.24,
  tick2: 0.8,
  push: 0.0, // the lean toward the link, while the motif plays
  click: 1.12, // ⌘-click
  unfold: 1.2, // the words lift; the Page unfolds out of them
  carry: 1.3,
  chrome: 2.04, // the tab, trail and Inspector become the Page's, under the landing sheet
  pull: 1.26, // the pull-back begins a few frames after the words (principle 8)
  pullDur: 2.5,
  resolve: 3.62, // the motif resolves as the camera arrives
  pointer: 4.25,
  end: 6.0,
};

// ── Authentic states ───────────────────────────────────────────────────────

const SRC: Plan = { ...PLANS.inspector, cursor: undefined };
const DST: Plan = { ...PLANS.reveal, cursor: undefined };

const probes = [
  {
    id: "src",
    node: (
      <Window>
        <ShellFor plan={SRC} />
      </Window>
    ),
    anchors: [
      { key: "link", selector: ".r2-prop-link", text: TITLE },
      { key: "pill", selector: ".r2-prop-link", mode: "box" as const, text: TITLE },
    ],
  },
  {
    id: "dst",
    node: (
      <Window>
        <ShellFor plan={DST} />
      </Window>
    ),
    anchors: [
      { key: "title", selector: ".r2-page-title", mode: "field" as const, text: TITLE },
      { key: "main", selector: ".r2-main", mode: "box" as const },
      { key: "row", selector: ".r2-nav .r2-row", mode: "box" as const, text: "The Key Cabinet" },
      { key: "tab", selector: ".r2-tab", mode: "box" as const, text: "The Key Cabinet" },
      { key: "backlink", selector: ".r2-link", mode: "box" as const, text: "The East Stair · The Key Cabinet" },
    ],
  },
];

// ── The camera ─────────────────────────────────────────────────────────────

const repin = (c: CameraState, P: Point): CameraState => ({ x: P.x, y: P.y, s: c.s, ax: c.ax + (P.x - c.x) * c.s, ay: c.ay + (P.y - c.y) * c.s });

const PUSH_S = 2.1;
/** The words leave the margin on a shallow arc toward the centre of the work. */
const PATH: Path = { kind: "arc", lift: 0.07 };

type Rig = { cam: CameraState; carrier: { at: Point; size: number }; p: number };

/**
 * One continuous camera move about the click point. The link sits, by luck of
 * the layout, almost exactly where the wide framing would put it, so the
 * lean-in and the pull-back can both pivot on it: the world only ever
 * contracts toward the pointer (slowly), and the one thing that travels is the
 * title — with the Page unfolding out of it.
 */
function rig(t: number, m: Probes): Rig {
  const link = m.src.link;
  const L = { x: link.text.x + link.text.w / 2, y: link.text.cy };
  const f07 = repin(SRC.camera, L);
  const wide = repin(DST.camera, L);
  const lean = span(t, T.push, T.click - T.push, CAMERA);
  const q = span(t, T.pull, T.pullDur, DOLLY);
  const s = logLerp(logLerp(f07.s, PUSH_S, lean), wide.s, q);
  const cam: CameraState = { x: L.x, y: L.y, s, ax: lerp(f07.ax, wide.ax, q), ay: lerp(f07.ay, wide.ay, q) };
  const p = span(t, T.unfold, T.carry, CARRY);
  return { cam, carrier: carrierAt(link, m.dst.title, p, PATH), p };
}

// ── The unfold: the Page, pinned to its title ──────────────────────────────

/** The destination window's transform: scaled with the words, its title on them. */
function pinned(title: Measured, carrier: { at: Point; size: number }) {
  const k = carrier.size / title.style.fontSize;
  return { k, x: carrier.at.x - title.text.x * k, y: carrier.at.y - title.text.cy * k };
}

/**
 * The mask, in the Page's own coordinates: the link's hover pill (mapped onto
 * the Page as it starts), opening to the content column — the Page's own
 * territory — as the words land. It never opens past the column: the chrome
 * around it changes the way the product changes it, in place.
 */
function maskAt(m: Probes, p: number): { rect: Rect; radius: number } {
  const title = m.dst.title;
  const pill = m.src.pill.box;
  const k0 = m.src.link.style.fontSize / title.style.fontSize;
  const o0 = { x: m.src.link.text.x - title.text.x * k0, y: m.src.link.text.cy - title.text.cy * k0 };
  const pillLocal: Rect = { x: (pill.x - o0.x) / k0, y: (pill.y - o0.y) / k0, w: pill.w / k0, h: pill.h / k0 };
  const main = m.dst.main.box;
  const column: Rect = { x: main.x, y: main.y, w: main.w, h: main.h };
  return { rect: lerpRect(pillLocal, column, p), radius: lerp(5 / k0, 9, p) };
}

// ── The frame ──────────────────────────────────────────────────────────────

function picture(t: number, m: Probes) {
  const scope = frameScope(t);
  const { cam, carrier, p } = rig(t, m);
  const title = m.dst.title;
  const unfolding = t >= T.unfold;
  const pin = pinned(title, carrier);
  const mask = maskAt(m, p);
  // The link's own hover pill, still grey as the mask leaves it, clearing as it grows.
  const pillTone = 1 - span(p, 0, 0.3, SETTLE);
  // The sheet's edge: the product's lifted-surface shadow, settling away once the Page has landed in its column.
  const edge = 1 - span(t, T.unfold + T.carry - 0.12, 0.4, SETTLE);
  const sheet = unfolding && edge > 0.001;
  const carrying = unfolding && p < 1;
  // The chrome becomes the new tab's — the Inspector re-subjects to the Page, the tab and trail change — in place,
  // while the sheet covers the content column. (No object persists between a Scene's Inspector and a Page's: a dissolve.)
  const chrome = span(t, T.chrome, 0.3, EASE);
  // The panel's content leaves before the new arrives (the sheet and its header stay; only the body changes subject): never two at once.
  const oldPanel = 1 - span(t, T.chrome, 0.12, EASE);
  const newPanel = span(t, T.chrome + 0.1, 0.2, EASE);
  const panelCss = `
    [data-pf="${scope}-b-src"] .r2-panel[data-open] .r2-panel-body { opacity: ${oldPanel} !important; }
    [data-pf="${scope}-b-dst"] .r2-panel[data-open] .r2-panel-body { opacity: ${chrome > 0 ? Math.min(1, newPanel / chrome) : 0} !important; }
  `;
  const scene = keyCabinetGlow(t);

  // The pointer stays where it clicked (the pivot: it holds its place on screen), then comes to rest by the backlink.
  const press = PLANS.inspector.cursor!;
  const rest = PLANS.reveal.cursor!;
  const go = span(t, T.pointer, 0.6, EASE);
  const ptr = { x: lerp(press.x, rest.x, go), y: lerp(press.y, rest.y, go) };

  const hideTitle = `[data-pf="${scope}-b-sheet"] .r2-page-title { visibility: ${carrying ? "hidden" : "visible"}; }`;

  return (
    <Field>
      <Camera state={cam}>
        <style>{panelCss}</style>
        {chrome < 1 && (
          <Window>
            <div data-pf={`${scope}-b-src`}>
              <ShellFor plan={SRC} />
            </div>
          </Window>
        )}
        {chrome > 0 && (
          <div style={{ position: "absolute", left: 0, top: 0, opacity: chrome }}>
            <Window>
              <div data-pf={`${scope}-b-dst`}>
                <ShellFor plan={DST} />
              </div>
              <Glow boxes={[m.dst.row.box, m.dst.tab.box, m.dst.backlink.box]} amount={scene} />
            </Window>
          </div>
        )}
        {/* FILM-ONLY: the Page, pinned to its title, unfolding out of the link through a mask that starts as the link's pill. */}
        {sheet && (
          <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${pin.x}px, ${pin.y}px) scale(${pin.k})`, transformOrigin: "0 0" }}>
            <div style={{ position: "absolute", left: mask.rect.x, top: mask.rect.y, width: mask.rect.w, height: mask.rect.h, borderRadius: mask.radius, boxShadow: "0 0 0 1px rgba(20 22 28 / 0.06), 0 1px 2px rgba(20 22 28 / 0.06), 0 18px 48px -12px rgba(20 22 28 / 0.28)", opacity: edge }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: SHELL.width, height: SHELL.height, clipPath: `inset(${mask.rect.y}px ${SHELL.width - mask.rect.x - mask.rect.w}px ${SHELL.height - mask.rect.y - mask.rect.h}px ${mask.rect.x}px round ${mask.radius * edge}px)` }}>
              <Window>
                <div data-pf={`${scope}-b-sheet`}>
                  <style>{hideTitle}</style>
                  <ShellFor plan={DST} />
                  {pillTone > 0.001 && (
                    <div style={{ position: "absolute", left: mask.rect.x, top: mask.rect.y, width: mask.rect.w, height: mask.rect.h, borderRadius: mask.radius, background: "var(--r2-hover)", opacity: pillTone }} />
                  )}
                </div>
              </Window>
            </div>
          </div>
        )}
        {/* FILM-ONLY: the words — link → title — carried over the unfolding Page. */}
        {carrying && <TextCarrier text={TITLE} from={m.src.link} to={title} p={p} swap={clamp01((p - 0.2) / 0.45)} path={PATH} />}
        <Cursor x={ptr.x} y={ptr.y} opacity={1} pressed={t >= T.click && t < T.click + 0.1} size={CURSOR / cam.s} />
      </Camera>
    </Field>
  );
}

/** One Scene, lit everywhere it appears: its row, its tab, its backlink — the app's own soft accent, together, once. */
function keyCabinetGlow(t: number) {
  return span(t, T.resolve + 0.05, 0.35, SETTLE) * (1 - span(t, T.resolve + 1.35, 0.7, SETTLE));
}
function Glow({ boxes, amount }: { boxes: Rect[]; amount: number }) {
  if (amount <= 0.001) return null;
  const style = (b: Rect): CSSProperties => ({
    position: "absolute",
    left: b.x,
    top: b.y,
    width: b.w,
    height: b.h,
    borderRadius: 5,
    background: "var(--r2-accent-soft-hover)",
    mixBlendMode: "multiply",
    opacity: amount,
    pointerEvents: "none",
  });
  return (
    <>
      {boxes.map((b, i) => (
        <div key={i} style={style(b)} />
      ))}
    </>
  );
}

function frame(t: number, m: Probes) {
  return picture(t, m);
}

// ── Sound and phases ───────────────────────────────────────────────────────

const cues: Cue[] = [
  { at: T.tick1, src: pulseA, volume: 0.45, seconds: 0.16, note: "tick — the motif continues under the hover" },
  { at: T.tick2, src: pulseB, volume: 0.42, seconds: 0.16, note: "tick" },
  { at: T.click - 0.03, src: clickSound, volume: 0.5, seconds: 0.15, note: "⌘-click on Research → 1998 Guest Ledger" },
  { at: T.pull + 0.5, src: whooshSoft, volume: 0.1, seconds: 0.8, note: "one quiet spatial movement under the pull-back (no riser)" },
  { at: T.resolve, src: resolveTone, volume: 0.32, seconds: 2.6, note: "the motif resolves: one tonal step, as the camera arrives" },
];

const phases: Phase[] = [
  { from: 0, to: T.click + 0.08, kind: "authentic", label: "Frame 07 · Inspector → Research (lean in)" },
  { from: T.click + 0.08, to: T.unfold + T.carry + 0.3, kind: "film-only", label: "the Page unfolds out of its link" },
  { from: T.unfold + T.carry + 0.3, to: T.resolve, kind: "authentic", label: "Frame 08's state · the camera arrives" },
  { from: T.resolve, to: T.resolve + 2.1, kind: "film-only", label: "one Scene, lit in its three places" },
  { from: T.resolve + 2.1, to: T.end + 1, kind: "authentic", label: "Frame 08 · the whole window" },
];

export const STUDY_B: StudyDef = { id: "B", duration: T.end, probes, phases, cues, frame };
export const STUDY_B_STRIP = [0.6, 1.12, 1.35, 1.55, 1.75, 1.95, 2.2, 2.5, 2.9, 3.4, 4.0, 5.9];
