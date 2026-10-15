import type { CSSProperties } from "react";
import { Easing } from "remotion";
import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE } from "../../../foundation/time";
import { LEDGER_BODY, WORKSPACE } from "../../../data/salt-house";
import { PLANS, ShellFor, Window, type Plan } from "../Keyframes";
import { TextCarrier, carrierAt, type Path } from "./Carrier";
import { CAMERA, CARRY, SETTLE, clamp01, lerp, logLerp, repin, span, type Point, type Rect } from "./motion";
import type { Measured, Probes } from "./probe";
import { Document, Environment, Whole, resolveAt, scoped } from "./layers";
import { Field, LightRoot, frameScope, type Cue, type Phase, type StudyDef } from "./Study";
import clickSound from "../../../audio/click.wav";
import whooshSoft from "../../../audio/whoosh-soft.wav";
import resolveTone from "../../../audio/resolve.wav";

// STUDY B V2 — Inspector → Research Page → the whole window. The signature shot, polished.
//
// Authentic source: frame 07 (the Scene's Inspector, Research → 1998 Guest
// Ledger under the pointer). Authentic destination: frame 08 (the ledger Page
// in its own tab, its Inspector beside it, the whole window on the stage).
// The semantic object is the title "1998 Guest Ledger".
//
// What changed from V1: no sheet. V1 pinned the whole destination Page to the
// travelling words and revealed it through a growing mask — mid-move it read
// as a white panel opening over the old UI. Here ONLY the words travel. The
// content column the words travel into clears in place (the Scene's prose
// recedes into its own paper), the words land as the Page's title, and the
// Page's body resolves beneath them in reading order — eyebrow, then block by
// block — as if written out from the title. Everything else changes where it
// stands: the navigator's selection, the new tab, the trail, the Inspector's
// subject. The camera pivots on the click point throughout, as in V1.
//
// Hierarchy: the words leave first (0.06s after the click); the world
// responds (the prose recedes, the camera starts back); the environment
// settles last (chrome, Inspector, then the body).

const TITLE = WORKSPACE.ledger.title;
const CURSOR = 30 / 20;

// ── The event grid (seconds) ───────────────────────────────────────────────
const T = {
  push: 0.0, // the lean toward the link
  click: 0.72, // ⌘-click
  carry: 0.78, // the words leave the margin
  carryDur: 1.2, // peak ≈ 120 px/frame on screen (V1: 143) — followable at full size
  recede: 0.84, // the Scene's prose steps back (to a trace) as the words leave…
  recedeDur: 0.45,
  clear: 1.24, // …and clears as the Page's body arrives beneath its title
  pull: 0.74, // the pull-back begins with the words: the room appears while they travel
  pullDur: 2.1,
  chrome: 1.0, // tab, trail, selection: the Page's, in place (with the Inspector: the open)
  panel: 0.8, // the Inspector re-subjects with the open (old out as the words leave its row, then the Page's in)
  eyebrow: 1.36, // "Page", as the title nears its place
  body: 1.32, // the body, block by block, written out beneath the arriving title
  bodyGap: 0.06,
  bodyDur: 0.34,
  resolve: 2.86, // the camera arrives: the motif resolves
  pointer: 3.75,
  end: 5.2,
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
      { key: "row", selector: ".r2-nav .r2-row", mode: "box" as const, text: "The Key Cabinet" },
      { key: "tab", selector: ".r2-tab", mode: "box" as const, text: "The Key Cabinet" },
      { key: "backlink", selector: ".r2-link", mode: "box" as const, text: "The East Stair · The Key Cabinet" },
    ],
  },
];

// ── The camera: one move about the click point (V1's rig, tighter) ──────────

const PUSH_S = 1.9;
/** The pull-back: leaves sooner than V1's DOLLY (so the room appears while the words travel), long soft arrival. */
const PULL = Easing.bezier(0.3, 0, 0.2, 1);
const PATH: Path = { kind: "arc", lift: 0.07 };

function rig(t: number, m: Probes): { cam: CameraState; L: Point } {
  const link = m.src.link;
  const L = { x: link.text.x + link.text.w / 2, y: link.text.cy };
  const f07 = repin(SRC.camera, L);
  const wide = repin(DST.camera, L);
  const lean = span(t, T.push, T.click - T.push, CAMERA);
  const q = span(t, T.pull, T.pullDur, PULL);
  const s = logLerp(logLerp(f07.s, PUSH_S, lean), wide.s, q);
  return { cam: { x: L.x, y: L.y, s, ax: lerp(f07.ax, wide.ax, q), ay: lerp(f07.ay, wide.ay, q) }, L };
}

// ── The frame ──────────────────────────────────────────────────────────────

/**
 * The link's own hover pill, travelling under the words for their first steps
 * and dissolving into the page: its padding held in ems of the words, its
 * width the words' own as their face changes (link → title).
 */
function Pill({ link, pill, title, at, size, swap, opacity }: { link: Measured; pill: Rect; title: Measured; at: Point; size: number; swap: number; opacity: number }) {
  if (opacity <= 0.001) return null;
  const fs = link.style.fontSize;
  const padL = (link.text.x - pill.x) / fs;
  const padR = (pill.x + pill.w - link.text.x - link.text.w) / fs;
  const padT = (link.text.cy - pill.y) / fs;
  const padB = (pill.y + pill.h - link.text.cy) / fs;
  const words = lerp(link.text.w / fs, title.text.w / title.style.fontSize, swap) * size;
  const style: CSSProperties = {
    position: "absolute",
    left: at.x - padL * size,
    top: at.y - padT * size,
    width: words + (padL + padR) * size,
    height: (padT + padB) * size,
    borderRadius: (5 / fs) * size,
    background: "var(--r2-hover)",
    opacity,
    pointerEvents: "none",
  };
  return <div style={style} />;
}

function frame(t: number, m: Probes) {
  const scope = frameScope(t);
  const { cam } = rig(t, m);
  const p = span(t, T.carry, T.carryDur, CARRY);
  const carrying = t >= T.carry && p < 1;
  const c = carrierAt(m.src.link, m.dst.title, p, PATH);
  const swap = clamp01((p - 0.15) / 0.45);

  // The world responds: the Scene's prose recedes into its paper (in place, nothing moves).
  const prose = lerp(1, 0.28, span(t, T.recede, T.recedeDur, EASE)) * (1 - span(t, T.clear, 0.3, EASE));
  // The Scene's own title clears first: the carried title lands where it stood.
  const sceneTitle = 1 - span(t, T.recede, 0.4, EASE);
  // The environment settles: one environment over the other — same geometry, so only what differs changes.
  const chrome = span(t, T.chrome, 0.34, EASE);
  const oldPanel = 1 - span(t, T.panel, 0.18, EASE);
  const newPanel = span(t, T.panel + 0.3, 0.26, EASE);

  // Text that differs in place (the trail, the word count) never overlaps itself: the old leaves, then the new arrives.
  const oldText = 1 - span(t, T.chrome, 0.12, EASE);
  const newText = span(t, T.chrome + 0.14, 0.2, EASE);
  const SWAPPED = ".r2-contextbar nav, .r2-status";
  const srcCss = scoped(`${scope}-src`, {
    ".r2-main .r2-writing": `opacity: ${prose};`,
    ".r2-main .r2-doc-head": `opacity: ${prose > 0 ? Math.min(1, sceneTitle / prose) : 0};`,
    // The link's words have left: the relationship's place stays, empty, until the Inspector re-subjects.
    ".r2-prop:nth-child(5) .r2-prop-link": t >= T.carry ? "color: transparent !important; text-decoration-color: transparent !important; background: none !important;" : "",
    ".r2-panel[data-open] .r2-panel-body": `opacity: ${oldPanel} !important;`,
    [SWAPPED]: `opacity: ${oldText};`,
  });
  const envCss = scoped(`${scope}-env`, {
    // Its panel's body is drawn at newPanel overall (the layer itself is at `chrome`).
    ".r2-panel[data-open] .r2-panel-body": `opacity: ${chrome > 0 ? Math.min(1, newPanel / chrome) : 0} !important;`,
    [SWAPPED]: `opacity: ${chrome > 0 ? Math.min(1, newText / chrome) : 0};`,
  });
  // The Page's document, resolving in reading order beneath its title.
  const blocks = LEDGER_BODY.map((_, i) => `.r2-page-body .ProseMirror > *:nth-child(${i + 1})`);
  const docCss = scoped(`${scope}-doc`, {
    ".r2-page-title": `visibility: ${t >= T.carry && p < 1 ? "hidden" : "visible"} !important;`,
    ".r2-doc-eyebrow": `opacity: ${span(t, T.eyebrow, 0.3, SETTLE)};`,
    ...Object.fromEntries(blocks.map((sel, i) => [sel, `opacity: ${resolveAt(t, T.body, i, T.bodyGap, T.bodyDur, SETTLE)};`])),
  });

  // The pointer stays where it clicked (the pivot holds it on screen), then comes to rest by the backlink.
  const press = PLANS.inspector.cursor!;
  const rest = PLANS.reveal.cursor!;
  const go = span(t, T.pointer, 0.55, EASE);
  const ptr = { x: lerp(press.x, rest.x, go), y: lerp(press.y, rest.y, go) };
  const glow = span(t, T.resolve + 0.04, 0.35, SETTLE) * (1 - span(t, T.resolve + 1.3, 0.6, SETTLE));

  return (
    <Field>
      <Camera state={cam}>
        {chrome < 1 && <Whole scope={`${scope}-src`} plan={SRC} css={srcCss} />}
        <Environment scope={`${scope}-env`} plan={DST} css={envCss} opacity={chrome}>
          <Glow boxes={[m.dst.row.box, m.dst.tab.box, m.dst.backlink.box]} amount={glow} />
        </Environment>
        {t >= T.carry && <Document scope={`${scope}-doc`} plan={DST} css={docCss} />}
        {/* FILM-ONLY: the words — link → title — and the link's pill, carried; nothing else travels. */}
        {carrying && (
          <>
            <LightRoot>
              <Pill link={m.src.link} pill={m.src.pill.box} title={m.dst.title} at={c.at} size={c.size} swap={swap} opacity={1 - span(p, 0.05, 0.4, SETTLE)} />
            </LightRoot>
            <TextCarrier text={TITLE} from={m.src.link} to={m.dst.title} p={p} swap={swap} path={PATH} />
          </>
        )}
        <Cursor x={ptr.x} y={ptr.y} opacity={1} pressed={t >= T.click && t < T.click + 0.1} size={CURSOR / cam.s} />
      </Camera>
    </Field>
  );
}

/** One Scene, lit everywhere it appears: its row, its tab, its backlink — the app's own soft accent, together, once. */
function Glow({ boxes, amount }: { boxes: Rect[]; amount: number }) {
  if (amount <= 0.001) return null;
  return (
    <>
      {boxes.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: 5, background: "var(--r2-accent-soft-hover)", mixBlendMode: "multiply", opacity: amount, pointerEvents: "none" }} />
      ))}
    </>
  );
}

// ── Sound and phases ───────────────────────────────────────────────────────

const cues: Cue[] = [
  { at: T.click - 0.03, src: clickSound, volume: 0.5, seconds: 0.15, note: "⌘-click on Research → 1998 Guest Ledger" },
  { at: T.pull + 0.35, src: whooshSoft, volume: 0.08, seconds: 0.8, note: "one restrained spatial movement under the pull-back (no riser)" },
  { at: T.resolve, src: resolveTone, volume: 0.32, seconds: 2.2, note: "resolving tone: the whole window settles" },
];

const phases: Phase[] = [
  { from: 0, to: T.click + 0.06, kind: "authentic", label: "Frame 07 · Inspector → Research (lean in)" },
  { from: T.click + 0.06, to: T.carry + T.carryDur, kind: "film-only", label: "the title travels; the column clears and resolves in place" },
  { from: T.carry + T.carryDur, to: T.resolve, kind: "authentic", label: "Frame 08's state · the camera arrives" },
  { from: T.resolve, to: T.resolve + 1.9, kind: "film-only", label: "one Scene, lit in its three places" },
  { from: T.resolve + 1.9, to: T.end + 1, kind: "authentic", label: "Frame 08 · the whole window" },
];

export const STUDY_BV2: StudyDef = { id: "BV2", duration: T.end, probes, phases, cues, frame };
export const STUDY_BV2_STRIP = [0.5, 0.72, 0.95, 1.1, 1.25, 1.4, 1.55, 1.7, 1.85, 2.1, 3.1, 5.1];
