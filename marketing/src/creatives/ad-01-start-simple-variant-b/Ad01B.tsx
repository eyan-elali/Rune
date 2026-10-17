import type { CSSProperties, ReactNode } from "react";
import { Easing, Html5Audio, Img, Sequence, staticFile, useCurrentFrame } from "remotion";
import { FileText, File as PageIcon, FolderOpen, Layers } from "lucide-react";
import { WORDMARK } from "@/lib/brand";
import { Camera, type CameraState } from "../../foundation/Camera";
import { FORMATS, FPS } from "../../foundation/formats";
import { Stage } from "../../foundation/Stage";
import { EASE_FRAME, seeded, typedCount, typingSchedule } from "../../foundation/time";
import { ManuscriptDoc } from "../../ui/Manuscript";
import { Navigator, type NavRowSpec, type NavSectionSpec } from "../../ui/Navigator";
import { ContextBar, DocStatus, Shell, TabBand, type TabSpec } from "../../ui/Shell";
import { STAGE_INK } from "../product-film/ProductFilmStoryboard";
import { FADE_IN, FADE_OUT, WRITING_SETTLE, writingCss } from "../product-film/film/common";
import { CAMERA, CARRY, SETTLE, clamp01, lerp, logLerp, span, toScreen, type Rect } from "../product-film/studies/motion";
import { WithProbes, type Measured, type ProbeSpec, type Probes } from "../product-film/studies/probe";
import { TYPING_REAL } from "../../audio/typing-real";
import settleSound from "../../audio/settle.wav";
import resolveTone from "../../audio/resolve.wav";
import { CHAPTERS_ONE, CHAPTERS_TWO, FLAT_A, FLAT_A_PROSE, MANUSCRIPT_WORDS, OPEN, PART_ONE, PART_TWO, PEN_NAME, PROJECT, RETURN_TYPED, SEGMENTS, THOUGHTS, UNPLACED, WORKSPACE, type Thought } from "./content";
import { REST, STREAM_ANCHORS, Stream, TemporalColumn, arrivalTimes, frontAt, frontView, geometry, segmentAt, timeFrontReaches, written, writingRate } from "./stream";
import { T } from "./timeline";

// Ad01StartSimpleVariantB — Performance Ad #1, Variant B: "structure emerges
// from the writing" (ads/ad-01-start-simple-variant-b/CREATIVE_TREATMENT.md).
// The Control's opening, book-growth, return and close; in the middle, three
// thoughts loosen from the page while the book is written, rest beside it,
// and — once the page is still — are put away by the writer, one at a time,
// each becoming the Workspace row it is. Nothing is read, extracted or
// generated: the objects are film surrogates of what the writer made.

export const FRAME = { width: FORMATS.vertical.width, height: FORMATS.vertical.height } as const;
/** The window: a shade narrower than the Control's, so the stage keeps a margin beside the page for the thoughts. */
export const WIN = { width: 690, height: 1500, nav: 232 } as const;
const MARGIN = 88;

// ── Copy (Control's hook; no "Start simple."; the one middle line) ─────────

export const HOOK = ["You shouldn’t have to", "build a system", "before you write."] as const;
export const LINE_2 = ["Build outward when", "the book asks for it."] as const;
export const CTA = { action: "Start writing free", address: "writesutura.com", note: "Early Access · Free" } as const;

// ── The writer's words (identical schedules to Control) ───────────────────

const OPEN_TIMES = typingSchedule(OPEN.typed, T.type, 1101, 0.9);
export const OPEN_END = OPEN_TIMES[OPEN_TIMES.length - 1];
const RETURN_TIMES = typingSchedule(RETURN_TYPED, T.type2, 1207, 0.86);
export const RETURN_END = RETURN_TIMES[RETURN_TIMES.length - 1];
const wordsIn = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const CH1_BASE = wordsIn([...OPEN.paragraphs, OPEN.line].join(" "));

// ── The end ────────────────────────────────────────────────────────────────

export const AWAY = RETURN_END + T.holdAfter;
const RETREAT_CURVE = Easing.bezier(0.42, 0, 0.36, 1);
const CLOSE_S = 2.25;
const FAR_S = 0.42;
const FADE_WIDTH = 0.305;
const FADE_IN_RETREAT = (() => {
  const target = (FADE_WIDTH * FRAME.width) / WIN.width;
  for (let x = 0; x <= T.retreatDur; x += 1 / 240) if (logLerp(CLOSE_S, FAR_S, RETREAT_CURVE(x / T.retreatDur)) <= target) return x;
  return T.retreatDur;
})();
export const FADE_AT = AWAY + FADE_IN_RETREAT;
export const FADE_GO = Math.ceil((FADE_AT + 0.09) * FPS) / FPS;
const GO_FRAMES = 4;
export const BRAND = FADE_GO + GO_FRAMES / FPS + 0.26;
export const END = BRAND + T.brandHold;
export const DURATION_FRAMES = Math.round(END * FPS);

// ── The organisation moment ────────────────────────────────────────────────

/** When each thought leaves the page (after its passage) and when it is put away (after rest, in order). */
export const ORG_START = REST + T.organise;
export const dockAt = (i: number) => ORG_START + i * T.organiseGap;
export const ORG_END = dockAt(THOUGHTS.length - 1) + T.dockDur;

// ── Authentic states ───────────────────────────────────────────────────────

type ShellState = { nav: NavSectionSpec[]; tabs: TabSpec[]; trail: string[]; main: ReactNode; status: ReactNode };

function AdShell({ s, scope, css }: { s: ShellState; scope: string; css: string }) {
  return (
    <div data-pf={scope}>
      {css && <style>{css}</style>}
      <Shell
        width={WIN.width}
        height={WIN.height}
        navWidth={WIN.nav}
        manuscript
        nav={<Navigator project={PROJECT} sections={s.nav} penName={PEN_NAME} />}
        tabs={<TabBand tabs={s.tabs} />}
        contextBar={<ContextBar project={PROJECT} trail={s.trail} read add="Scene" />}
        main={s.main}
        status={s.status}
      />
    </div>
  );
}

function Window({ children }: { children: ReactNode }) {
  return (
    <div
      className="r2"
      data-theme="light"
      data-accent="blue"
      data-surface="theme"
      style={{ position: "relative", width: WIN.width, height: WIN.height, borderRadius: "14px 14px 0 0", overflow: "hidden", background: "var(--r2-shell-bg)", boxShadow: "0 0 0 1px rgba(255 255 255 / 0.06), 0 30px 90px rgba(0 0 0 / 0.5)" }}
    >
      {children}
    </div>
  );
}

/** A light Sutura root without a window's shape: the thoughts paint in the product's own tokens. */
function LightLayer({ children }: { children: ReactNode }) {
  return (
    <div className="r2" data-theme="light" data-accent="blue" data-surface="theme" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, overflow: "visible", background: "none" }}>
      {children}
    </div>
  );
}

const CH1_TAB: TabSpec[] = [{ key: "c1", label: OPEN.title, active: true }];
/** The working set at rest: the Scene, and the two Pages the writer has had open. */
const FLAT_TABS: TabSpec[] = [
  { key: "flat", label: FLAT_A.title, active: true },
  { key: "rui", label: THOUGHTS[0].title },
  { key: "pitch", label: WORKSPACE.pitch.title },
];
const CH1_TRAIL = ["Manuscript", OPEN.title];
const FLAT_TRAIL = ["Manuscript", PART_TWO.title, FLAT_A.chapter, FLAT_A.title];

function newProjectNav(words: number): NavSectionSpec[] {
  return [
    { id: "manuscript", label: "Manuscript", count: words, open: true, rows: [{ id: "c-call", title: OPEN.title, icon: FileText, depth: 1, selected: true }] },
    { id: "workspace", label: "Workspace", open: false, rows: [] },
  ];
}

/** How far each thought's row (and its folder) has arrived: 0 absent … 1 present. A folder arrives a breath before its first Page. */
function placed(t: number) {
  const row = (i: number) => SETTLE(clamp01((t - (dockAt(i) + T.dockDur * 0.62)) / 0.3));
  const folder = (i: number) => SETTLE(clamp01((t - (dockAt(i) + T.dockDur * 0.3)) / 0.3));
  return { row, folder };
}

/**
 * The navigator: the Manuscript grows from the Chapter 1 row with the
 * writing (Control's rule); the Workspace stays folded and empty until the
 * writer puts the first thought away, and then holds exactly what they made.
 */
function grownNav(t: number, at: Map<string, number>, selected: string, words: number, final = false): NavSectionSpec[] {
  const reveal = (id: string) => {
    const a = at.get(id);
    return a === undefined ? 1 : SETTLE(clamp01((t - a) / 0.26));
  };
  const indent = final ? 1 : SETTLE(clamp01((t - at.get(PART_ONE.id)!) / 0.32));
  const row = (id: string, title: string, depth: number, o: Partial<NavRowSpec> = {}): NavRowSpec[] => {
    const r = final ? 1 : reveal(id);
    if (r <= 0) return [];
    return [{ id, title, depth, selected: id === selected, ...o, reveal: r < 1 ? r : undefined }];
  };
  const chapter = (c: (typeof CHAPTERS_ONE)[number], open: boolean) => [
    ...row(c.id, c.title, 2, { icon: FileText, open: c.scenes ? open : undefined }),
    ...(open ? (c.scenes ?? []).flatMap((s) => row(s.id, s.title, 3)) : []),
  ];
  const manuscript: NavRowSpec[] = [
    ...row(PART_ONE.id, PART_ONE.title, 1, { icon: Layers, open: true, emphasis: true }),
    ...row(CHAPTERS_ONE[0].id, CHAPTERS_ONE[0].title, 1 + indent, { icon: FileText }),
    ...CHAPTERS_ONE.slice(1).flatMap((c) => chapter(c, false)),
    ...row(PART_TWO.id, PART_TWO.title, 1, { icon: Layers, open: true, emphasis: true }),
    ...CHAPTERS_TWO.flatMap((c) => chapter(c, c.id === "c-second")),
  ];
  const p = placed(t);
  const workspace: NavRowSpec[] = [];
  const folders = new Set<string>();
  THOUGHTS.forEach((th, i) => {
    const fr = final ? 1 : p.folder(i);
    const rr = final ? 1 : p.row(i);
    if (th.folder && !folders.has(th.folder.id) && fr > 0) {
      folders.add(th.folder.id);
      workspace.push({ id: th.folder.id, title: th.folder.title, icon: FolderOpen, depth: 1, open: true, reveal: fr < 1 ? fr : undefined });
    }
    if (rr > 0) workspace.push({ id: th.id, title: th.title, icon: PageIcon, depth: th.folder ? 2 : 1, reveal: rr < 1 ? rr : undefined });
  });
  const unplaced = final ? 1 : reveal("unplaced");
  return [
    { id: "manuscript", label: "Manuscript", count: words, open: true, rows: manuscript },
    { id: "unplaced", label: "Unplaced Scenes", count: UNPLACED.reduce((n, u) => n + u.words, 0), open: false, rows: [], reveal: unplaced < 1 ? unplaced : undefined },
    { id: "workspace", label: "Workspace", open: workspace.length > 0, rows: workspace },
  ];
}

const blink = (t: number, since: number) => (Math.floor((t - since) / 0.53) % 2 === 0 ? 1 : 0);

function stateAt(t: number, m: Probes, scope: string): ShellState {
  if (t < T.grow) {
    const n = typedCount(Math.round(t * FPS), OPEN_TIMES);
    const done = n >= OPEN.typed.length;
    const words = CH1_BASE + wordsIn(OPEN.typed.slice(0, n));
    return {
      nav: newProjectNav(words),
      tabs: CH1_TAB,
      trail: CH1_TRAIL,
      main: <ManuscriptDoc title={OPEN.title} paragraphs={OPEN.paragraphs} openLine={OPEN.line} typed={OPEN.typed.slice(0, n)} caret={!done || t < T.type ? 1 : blink(t, OPEN_END)} />,
      status: <DocStatus words={words} state={done ? "Saved" : "Saving…"} />,
    };
  }
  const g = geometry(m, "streamB");
  const at = arrivalTimes(g);
  if (t < REST) {
    const i = segmentAt(t, g);
    const s = SEGMENTS[i];
    const f = clamp01((frontAt(t, g) - g.tops[i]) / Math.max(g.ends[i] - g.tops[i], 1));
    const words = Math.round(lerp(CH1_BASE + wordsIn(OPEN.typed), MANUSCRIPT_WORDS, written(t)));
    return {
      nav: grownNav(t, at, s.id, words),
      tabs: CH1_TAB,
      trail: CH1_TRAIL,
      main: <TemporalColumn t={t} g={g} scope={scope} />,
      status: <DocStatus words={Math.round(s.words * lerp(0.1, 1, f))} state="Saving…" />,
    };
  }
  const n = t < T.type2 ? 0 : typedCount(Math.round(t * FPS), RETURN_TIMES);
  const typed = RETURN_TYPED.slice(0, n);
  const typing = t >= T.type2 && t < RETURN_END + 0.4;
  const caret = t < T.type2 ? blink(t, REST) : typing ? 1 : blink(t, RETURN_END + 0.4);
  return {
    nav: grownNav(t, at, FLAT_A.id, MANUSCRIPT_WORDS + wordsIn(typed)),
    // The working set appears as the writer puts things away: the tab band holds what they opened.
    tabs: t < dockAt(0) + T.dockDur ? [FLAT_TABS[0]] : t < dockAt(1) + T.dockDur ? FLAT_TABS.slice(0, 2) : FLAT_TABS,
    trail: FLAT_TRAIL,
    main: <ManuscriptDoc eyebrow={FLAT_A.chapter} title={FLAT_A.title} paragraphs={FLAT_A_PROSE} openLine="" typed={typed} caret={caret} />,
    status: <DocStatus words={FLAT_A.words + wordsIn(typed)} state={typing ? "Saving…" : "Saved"} />,
  };
}

function writingAt(t: number) {
  const first = span(t, T.type + WRITING_SETTLE, FADE_OUT, EASE_FRAME) * (1 - span(t, REST + T.chromeBack, FADE_IN, EASE_FRAME));
  const second = span(t, T.type2 + WRITING_SETTLE, FADE_OUT, EASE_FRAME);
  return Math.max(first, second);
}

// ── Probes ─────────────────────────────────────────────────────────────────

const probeShell = (s: ShellState) => (
  <Window>
    <AdShell s={s} scope="probe" css="" />
  </Window>
);
const OPEN_STATE: ShellState = {
  nav: newProjectNav(CH1_BASE + wordsIn(OPEN.typed)),
  tabs: CH1_TAB,
  trail: CH1_TRAIL,
  main: <ManuscriptDoc title={OPEN.title} paragraphs={OPEN.paragraphs} openLine={OPEN.line} typed={OPEN.typed} caret={1} />,
  status: null,
};
const STREAM_STATE: ShellState = { nav: newProjectNav(0), tabs: CH1_TAB, trail: CH1_TRAIL, main: <Stream />, status: null };
/** The finished navigator: every row present, so each thought's destination can be measured. */
const FINAL_STATE: ShellState = {
  nav: grownNav(1e9, new Map(), FLAT_A.id, MANUSCRIPT_WORDS, true),
  tabs: FLAT_TABS,
  trail: FLAT_TRAIL,
  main: <ManuscriptDoc eyebrow={FLAT_A.chapter} title={FLAT_A.title} paragraphs={FLAT_A_PROSE} openLine="" typed="" caret={1} />,
  status: null,
};
export const PROBES: ProbeSpec[] = [
  { id: "openB", node: probeShell(OPEN_STATE), anchors: [{ key: "line", selector: ".r2-prose p", text: "off a card." }] },
  { id: "streamB", node: probeShell(STREAM_STATE), anchors: STREAM_ANCHORS },
  {
    id: "finalB",
    node: probeShell(FINAL_STATE),
    anchors: [
      { key: "line", selector: ".r2-prose p:last-of-type", mode: "box" },
      ...THOUGHTS.map((th) => ({ key: `${th.id}Row`, selector: ".r2-nav .r2-row", mode: "box" as const, text: th.title })),
      ...THOUGHTS.map((th) => ({ key: `${th.id}Label`, selector: ".r2-nav .r2-row-label", text: th.title })),
    ],
  },
];

// ── The camera ─────────────────────────────────────────────────────────────

const CENTRE = { x: FRAME.width / 2, y: FRAME.height / 2 };
const win = (left: number, top: number, s: number): CameraState => ({ x: 0, y: 0, s, ax: left, ay: top });
const pin = (P: { x: number; y: number }, A: { x: number; y: number }, s: number): CameraState => ({ x: P.x, y: P.y, s, ax: A.x, ay: A.y });
function blend(a: CameraState, b: CameraState, p: number): CameraState {
  if (p <= 0) return a;
  if (p >= 1) return b;
  const centre = (c: CameraState) => ({ x: c.x + (CENTRE.x - c.ax) / c.s, y: c.y + (CENTRE.y - c.ay) / c.s });
  const A = centre(a);
  const B = centre(b);
  return { x: lerp(A.x, B.x, p), y: lerp(A.y, B.y, p), s: logLerp(a.s, b.s, p), ax: CENTRE.x, ay: CENTRE.y };
}
const PUSH = Easing.bezier(0.5, 0.0, 0.22, 1);

const CAM_A = win(MARGIN, 580, 1.45);
/** C/D: the product larger than Control's middle (1.22× not 1.15×) and higher, the one copy line's slot above it. */
const CAM_GROW = win(MARGIN, 470, 1.22);
const CAM_REST = win(MARGIN, 440, 1.22);
const CAM_FAR: CameraState = { x: WIN.width / 2, y: 740, s: FAR_S, ax: CENTRE.x, ay: CENTRE.y };
const closeOn = (lineY: number) => pin({ x: WIN.nav, y: lineY }, { x: 0, y: 990 }, CLOSE_S);

export function cameraAt(t: number, m: Probes): CameraState {
  const openLine = m.openB.line.box;
  const flatLine = m.finalB.line.box;
  let cam = CAM_A;
  cam = blend(cam, closeOn(openLine.y + openLine.h / 2), span(t, T.push, T.pushDur, PUSH));
  cam = blend(cam, CAM_GROW, span(t, T.open, T.openDur, CAMERA));
  cam = blend(cam, CAM_REST, span(t, T.open + T.openDur, REST - (T.open + T.openDur), CAMERA));
  cam = blend(cam, closeOn(flatLine.y + flatLine.h / 2), span(t, T.back, T.backDur, PUSH));
  cam = blend(cam, CAM_FAR, span(t, AWAY, T.retreatDur, RETREAT_CURVE));
  return cam;
}

// ── The thoughts (FILM-ONLY surrogates of real Workspace Pages) ────────────

const SANS = "var(--r2-font-ui)";
const SERIF = "var(--r2-prose-font)";
/** A thought at rest beside the page: compact, in the product's own surface and type. */
const CARD = { w: 350, padX: 22, padY: 18, eyebrow: 15, title: 30, titleLh: 1.18, radius: 8 } as const;
/** Where each thought rests while the book is written: beside the page, right of the spine, in the order it arrived — never a tidy stack. */
const REST_AT: { x: number; y: number }[] = [
  { x: 606, y: 310 },
  { x: 650, y: 742 },
  { x: 616, y: 1092 },
];
const cardHeight = (lines: number) => CARD.padY * 2 + CARD.eyebrow * 1.3 + 8 + CARD.title * CARD.titleLh * lines;
const linesOf = (th: Thought) => (th.title.length > 18 ? 2 : 1);

/** When a thought loosens from the page: as its passage is being written. */
function emergeAt(th: Thought, g: ReturnType<typeof geometry>) {
  const seg = th.segment;
  const len = (seg < SEGMENTS.length - 1 ? g.tops[seg + 1] : g.ends[seg]) - g.tops[seg];
  return timeFrontReaches(g.tops[seg] + 30 + th.at * len, g);
}

type ThoughtDraw = { th: Thought; i: number; box: Rect; /** The box before it is put away (the title's own starting place). */ restBox: Rect; o: number; k: number; dock: number; rowLabel?: Measured; rowBox?: Rect };

/** Each thought's box on screen at t: loosening from the writing front, resting, then going to its row. */
function thoughtsAt(t: number, m: Probes): ThoughtDraw[] {
  const g = geometry(m, "streamB");
  const out: ThoughtDraw[] = [];
  THOUGHTS.forEach((th, i) => {
    const t0 = emergeAt(th, g);
    const e = span(t, t0, T.emergeDur, CARRY);
    if (e <= 0) return;
    const rest = REST_AT[i];
    const h = cardHeight(linesOf(th));
    // RELEASE: it loosens from where the page is being written — over the column, at the front — a little smaller, and comes to rest beside the page.
    const cam0 = cameraAt(t0, m);
    const front = toScreen(cam0, { x: WIN.nav + 28, y: m.streamB.main.box.y + frontView(t0, g) });
    const from = { x: front.x + 40, y: front.y - h * 0.5 - 40 };
    let box: Rect = { x: lerp(from.x, rest.x, e), y: lerp(from.y, rest.y, e), w: CARD.w, h };
    const restBox = box;
    let k = lerp(0.9, 1, e);
    let o = span(e, 0, 0.5, SETTLE);
    // ORGANISATION: once the page is still, the writer puts it away — it travels to its row and becomes it.
    const d = span(t, dockAt(i), T.dockDur, CARRY);
    const label = m.finalB[`${th.id}Label`];
    const rowBox = m.finalB[`${th.id}Row`].box;
    if (d > 0) {
      const cam = cameraAt(t, m);
      const rowOnScreen = toScreen(cam, { x: rowBox.x, y: rowBox.y });
      const rowRect: Rect = { x: rowOnScreen.x, y: rowOnScreen.y, w: rowBox.w * cam.s, h: rowBox.h * cam.s };
      box = { x: lerp(box.x, rowRect.x, d), y: lerp(box.y, rowRect.y, d), w: lerp(box.w, rowRect.w, d), h: lerp(box.h, rowRect.h, d) };
      k = 1;
      // The surface lets go at the end; the row's own ink takes over (the row arrives under it).
      o = 1 - span(d, 0.78, 0.22, SETTLE);
    }
    out.push({ th, i, box, restBox, o, k, dock: d, rowLabel: label, rowBox });
  });
  return out;
}

function ThoughtCard({ d, cam }: { d: ThoughtDraw; cam: CameraState }) {
  if (d.o <= 0.001) return null;
  const { th, box, restBox, dock } = d;
  // The title carries: from the card's own type to the row label's type (size by transform, the face shared: Inter), its weight crossing in the middle of the move.
  const label = d.rowLabel!;
  const labelOnScreen = toScreen(cam, { x: label.text.x, y: label.text.cy });
  const srcSize = CARD.title;
  const dstSize = label.style.fontSize * cam.s;
  const size = logLerp(srcSize, dstSize, dock);
  // From where it sat on the resting card to the row label's own line (never from the moving box: that would carry it twice).
  const titleX = lerp(restBox.x + CARD.padX, labelOnScreen.x, dock);
  const titleY = lerp(restBox.y + CARD.padY + CARD.eyebrow * 1.3 + 8, labelOnScreen.y - (dstSize * 1.2) / 2, dock);
  const weight = dock < 0.5 ? 600 : 400;
  const wrap = dock < 0.5 ? "balance" : "nowrap";
  const eyebrowO = 1 - span(dock, 0, 0.3, SETTLE);
  const surfaceO = d.o * (1 - span(dock, 0.55, 0.45, SETTLE));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: d.o, transform: `scale(${d.k})`, transformOrigin: `${box.x + box.w / 2}px ${box.y + box.h / 2}px` }}>
      <div
        style={{
          position: "absolute",
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          borderRadius: lerp(CARD.radius, 4, dock),
          background: "var(--r2-surface-raised, var(--r2-bg))",
          boxShadow: "0 0 0 1px rgba(20 22 28 / 0.09), 0 10px 30px -10px rgba(20 22 28 / 0.25)",
          opacity: surfaceO,
        }}
      />
      {eyebrowO > 0.001 && (
        <p style={{ position: "absolute", left: box.x + CARD.padX, top: box.y + CARD.padY, fontFamily: SANS, fontSize: CARD.eyebrow, lineHeight: 1.3, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--r2-ink-3)", opacity: eyebrowO, whiteSpace: "nowrap" }}>
          {th.kind}
        </p>
      )}
      <p
        style={{
          position: "absolute",
          left: titleX,
          top: titleY,
          width: dock < 0.5 ? CARD.w - CARD.padX * 2 : undefined,
          fontFamily: SANS,
          fontSize: size,
          lineHeight: dock < 0.5 ? CARD.titleLh : 1.2,
          fontWeight: weight,
          letterSpacing: dock < 0.5 ? "-0.012em" : "0",
          color: "var(--r2-ink-1)",
          textWrap: wrap as CSSProperties["textWrap"],
          whiteSpace: wrap === "nowrap" ? "nowrap" : undefined,
        }}
      >
        {th.title}
      </p>
    </div>
  );
}

// ── Copy and brand ─────────────────────────────────────────────────────────

const COPY_W = FRAME.width - MARGIN - 100;
function Statement({ lines, o, size = 78 }: { lines: readonly string[]; o: number; size?: number }) {
  if (o <= 0.001) return null;
  return (
    <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: size, lineHeight: 1.06, letterSpacing: "-0.024em", color: "var(--r2-ink-1)", opacity: o, transform: `translateY(${(1 - o) * 10}px)` }}>
      {lines.map((l) => (
        <span key={l} style={{ display: "block" }}>
          {l}
        </span>
      ))}
    </p>
  );
}
function Answer({ lines, o, size = 62 }: { lines: readonly string[]; o: number; size?: number }) {
  if (o <= 0.001) return null;
  return (
    <p style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, fontSize: size, lineHeight: 1.14, letterSpacing: "-0.01em", color: "var(--r2-accent-ink)", opacity: o, transform: `translateY(${(1 - o) * 10}px)` }}>
      {lines.map((l) => (
        <span key={l} style={{ display: "block" }}>
          {l}
        </span>
      ))}
    </p>
  );
}
const OUT = Easing.bezier(0.4, 0, 1, 1);
function Copy({ t }: { t: number }) {
  const hook = 1 - span(t, T.hookOut - 0.32, 0.32, OUT);
  const out = 1 - span(t, T.copyOut - 0.3, 0.3, OUT);
  const l2 = span(t, T.line2, 0.55, SETTLE) * out;
  return (
    <div style={{ position: "absolute", left: MARGIN, top: 284, width: COPY_W }}>
      {hook > 0.001 && <Statement lines={HOOK} o={hook} />}
      {hook <= 0.001 && <Answer lines={LINE_2} o={l2} />}
    </div>
  );
}
function Brand({ t }: { t: number }) {
  const a = (d: number) => span(t, BRAND + d, 0.4, SETTLE);
  if (a(0) <= 0.001) return null;
  const rise = (o: number): CSSProperties => ({ opacity: o, transform: `translateY(${(1 - o) * 10}px)` });
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", transform: "translateY(-70px)" }}>
      <Img src={staticFile(WORDMARK.onDark.replace(/^\//, ""))} style={{ width: 310, height: "auto", ...rise(a(0)) }} alt="Sutura" />
      <p style={{ marginTop: 74, fontFamily: SERIF, fontWeight: 400, fontSize: 68, lineHeight: 1, letterSpacing: "-0.022em", color: "var(--r2-ink-1)", ...rise(a(0.12)) }}>{CTA.action}</p>
      <p style={{ marginTop: 34, fontFamily: SANS, fontWeight: 500, fontSize: 34, letterSpacing: "0.01em", color: "var(--r2-ink-2)", ...rise(a(0.22)) }}>{CTA.address}</p>
      <p style={{ marginTop: 22, fontFamily: SANS, fontWeight: 400, fontSize: 26, letterSpacing: "0.02em", color: "var(--r2-ink-3)", ...rise(a(0.3)) }}>{CTA.note}</p>
    </div>
  );
}

// ── The frame ──────────────────────────────────────────────────────────────

export const frameScope = (t: number) => `b${Math.round(t * 10000)}`;

export function frameAt(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cameraAt(t, m);
  const s = stateAt(t, m, scope);
  const css = writingCss(scope, writingAt(t));
  const u = clamp01((t - FADE_GO) / (GO_FRAMES / FPS));
  const windowO = 1 - u * u;
  const thoughts = t >= T.grow && t < ORG_END + 0.1 ? thoughtsAt(t, m) : [];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: STAGE_INK }}>
      {windowO > 0.001 && (
        <div style={{ position: "absolute", inset: 0, opacity: windowO }}>
          <Camera state={cam}>
            <Window>
              <AdShell s={s} scope={scope} css={css} />
            </Window>
          </Camera>
          {thoughts.length > 0 && (
            <LightLayer>
              {thoughts.map((d) => (
                <ThoughtCard key={d.th.id} d={d} cam={cam} />
              ))}
            </LightLayer>
          )}
        </div>
      )}
      <Copy t={t} />
      <Brand t={t} />
    </div>
  );
}

// ── Sound: the Control's system, untouched in kind ─────────────────────────

export type Cue = { at: number; src: string; volume: number; seconds: number; note: string };
function keyboard(seed: number) {
  const r = seeded(seed);
  const recent: string[] = [];
  return (ch: string) => {
    const pool = ch === " " ? TYPING_REAL.space : TYPING_REAL.keys;
    const avoid = recent.slice(-Math.floor(pool.length / 2));
    let src = pool[Math.floor(r() * pool.length)];
    while (pool.length > 1 && avoid.includes(src)) src = pool[Math.floor(r() * pool.length)];
    recent.push(src);
    const db = (r() * 2 - 1) * 0.75;
    return { src, gain: 10 ** (db / 20) };
  };
}
function typed(text: string, times: number[], volume: number, seed: number, note: string): Cue[] {
  const key = keyboard(seed);
  return [...text].map((ch, i) => {
    const k = key(ch);
    return { at: times[i] - 0.012, src: k.src, volume: volume * k.gain, seconds: TYPING_REAL.seconds, note };
  });
}
function lapseTexture(): Cue[] {
  const r = seeded(1301);
  const key = keyboard(1303);
  const out: Cue[] = [];
  for (let at = T.grow + 0.16; at < REST - 0.3; ) {
    const rate = writingRate(at);
    if (rate > 0.08) {
      const k = key(r() < 0.18 ? " " : "a");
      out.push({ at, src: k.src, volume: (0.1 + 0.14 * rate + r() * 0.04) * k.gain, seconds: TYPING_REAL.seconds, note: "the lapse: typing compressed" });
    }
    at += 0.042 / Math.max(rate, 0.12) + r() * 0.03;
  }
  return out;
}
export const CUES: Cue[] = [
  ...typed(OPEN.typed, OPEN_TIMES, 0.7, 1201, "the writer types the clause's last words"),
  ...lapseTexture(),
  { at: REST - 0.02, src: settleSound, volume: 0.22, seconds: 0.5, note: "one felt-soft settle: the page is still" },
  // The thoughts travel and dock in silence: no whoosh, no plink.
  ...typed(RETURN_TYPED, RETURN_TIMES, 0.5, 1209, "the writer types, back in The Flat A"),
  { at: BRAND + 0.05, src: resolveTone, volume: 0.09, seconds: 3.0, note: "one quiet tonal resolve under the wordmark (optional)" },
];
function Sound() {
  return (
    <>
      {CUES.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} durationInFrames={Math.ceil(c.seconds * FPS) + 1} layout="none">
          <Html5Audio src={c.src} volume={c.volume} />
        </Sequence>
      ))}
    </>
  );
}

const DARK = { theme: "dark", surface: "theme", accent: "blue" } as const;
export function Ad01StartSimpleVariantB({ sound = true }: { sound?: boolean }) {
  const t = useCurrentFrame() / FPS;
  return (
    <Stage appearance={DARK} background={STAGE_INK}>
      <WithProbes probes={PROBES}>{(m) => frameAt(t, m)}</WithProbes>
      {sound && <Sound />}
    </Stage>
  );
}

export const PHASES = [
  { from: 0, to: T.type + WRITING_SETTLE, kind: "authentic", label: "A · the new Project; the writer types" },
  { from: T.type + WRITING_SETTLE, to: T.grow, kind: "authentic", label: "A→B · the chrome leaves; the camera follows the writing in" },
  { from: T.grow, to: REST, kind: "film-only", label: "C · months compressed; three thoughts loosen from the page and rest beside it" },
  { from: REST, to: ORG_END, kind: "film-only", label: "D · the page is still; the writer puts each thought where it lives" },
  { from: ORG_END, to: T.back, kind: "authentic", label: "D · the finished navigator, the Workspace the writer made" },
  { from: T.back, to: AWAY, kind: "authentic", label: "E · close on The Flat A; the writer types" },
  { from: AWAY, to: BRAND, kind: "film-only", label: "F · the window recedes" },
  { from: BRAND, to: END, kind: "authentic", label: "Sutura · Start writing free" },
] as const;
