import type { CSSProperties, ReactNode } from "react";
import { Easing, Html5Audio, Img, Sequence, staticFile, useCurrentFrame } from "remotion";
import { FileText, File as PageIcon, FolderOpen, Frame as CanvasIcon, Layers, Library } from "lucide-react";
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
import { CAMERA, SETTLE, clamp01, lerp, logLerp, span } from "../product-film/studies/motion";
import { WithProbes, type ProbeSpec, type Probes } from "../product-film/studies/probe";
import { TYPING_REAL } from "../../audio/typing-real";
import settleSound from "../../audio/settle.wav";
import resolveTone from "../../audio/resolve.wav";
import { ARRIVALS, CHAPTERS_ONE, CHAPTERS_TWO, FLAT_A, FLAT_A_PROSE, MANUSCRIPT_WORDS, OPEN, PART_ONE, PART_TWO, PEN_NAME, PROJECT, RETURN_TYPED, SEGMENTS, UNPLACED, WORKSPACE } from "./content";
import { REST, STREAM_ANCHORS, Stream, TemporalColumn, arrivalTimes, frontAt, geometry, segmentAt, written, writingRate } from "./stream";
import { T } from "./timeline";

// Ad01StartSimple — Sutura Performance Ad #1, 9:16 (ads/ad-01-start-simple/
// CREATIVE_TREATMENT.md). One continuous composition on one clock
// (timeline.ts), drawn as a pure function of time over the product's own
// markup. The hook stands at frame 0 over a Project that is Manuscript →
// Chapter 1; the writer types; months compress through the editor while the
// navigator grows from the Chapter 1 row; the Workspace is noticed at the
// foot of the spine; the writer writes again; Sutura.

export const FRAME = { width: FORMATS.vertical.width, height: FORMATS.vertical.height } as const;
/** The window the shell is drawn at: a narrow desktop window (the app's narrow-container layout), tall, the navigator docked. */
export const WIN = { width: 720, height: 1500, nav: 232 } as const;
/** The one left margin every line of copy and the window's corner hang from (the carousel's). */
const MARGIN = 88;

// ── Copy ───────────────────────────────────────────────────────────────────

export const HOOK = ["You shouldn’t have to", "build a system", "before you write."] as const;
export const LINE_1 = "Start simple.";
export const LINE_2 = ["Build outward when", "the book asks for it."] as const;
export const CTA = { action: "Start writing free", address: "writesutura.com", note: "Early Access · Free" } as const;

// ── The writer's words ─────────────────────────────────────────────────────

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
/** The window's width on screen, as a fraction of the frame, at which it begins to go (the film's figure). */
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

// ── Authentic states ───────────────────────────────────────────────────────

type ShellState = {
  nav: NavSectionSpec[];
  tabs: TabSpec[];
  trail: string[];
  main: ReactNode;
  status: ReactNode;
};

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

/** A light Sutura root shaped as a window, standing on the ink stage. */
function Window({ children }: { children: ReactNode }) {
  return (
    <div
      className="r2"
      data-theme="light"
      data-accent="blue"
      data-surface="theme"
      style={{
        position: "relative",
        width: WIN.width,
        height: WIN.height,
        borderRadius: "14px 14px 0 0",
        overflow: "hidden",
        background: "var(--r2-shell-bg)",
        boxShadow: "0 0 0 1px rgba(255 255 255 / 0.06), 0 30px 90px rgba(0 0 0 / 0.5)",
      }}
    >
      {children}
    </div>
  );
}

const CH1_TAB: TabSpec[] = [{ key: "c1", label: OPEN.title, active: true }];
const FLAT_TABS: TabSpec[] = [
  { key: "flat", label: FLAT_A.title, active: true },
  { key: "rui", label: "Rui Carvalho" },
  { key: "pitch", label: WORKSPACE.pitch.title },
  { key: "canvas", label: WORKSPACE.canvas.title },
];
const CH1_TRAIL = ["Manuscript", OPEN.title];
const FLAT_TRAIL = ["Manuscript", PART_TWO.title, FLAT_A.chapter, FLAT_A.title];

/** The new Project, exactly as create_project_checked makes it: Manuscript → Chapter 1; the Workspace folded while it is empty. */
function newProjectNav(words: number): NavSectionSpec[] {
  return [
    { id: "manuscript", label: "Manuscript", count: words, open: true, rows: [{ id: "c-call", title: OPEN.title, icon: FileText, depth: 1, selected: true }] },
    { id: "workspace", label: "Workspace", open: false, rows: [] },
  ];
}

/**
 * The navigator growing from the Chapter 1 row: each row arrives when the
 * writing front reaches what it holds (stream.ts: arrivalTimes); Part One
 * arrives above Chapter 1, which steps one indent in, in place. Past the
 * lapse every row is present: the finished navigator.
 */
function grownNav(t: number, at: Map<string, number>, selected: string, words: number): NavSectionSpec[] {
  const reveal = (id: string) => {
    const a = at.get(id);
    return a === undefined ? 1 : SETTLE(clamp01((t - a) / 0.26));
  };
  const indent = SETTLE(clamp01((t - at.get(PART_ONE.id)!) / 0.32));
  const row = (id: string, title: string, depth: number, o: Partial<NavRowSpec> = {}): NavRowSpec[] => {
    const r = reveal(id);
    if (r <= 0) return [];
    return [{ id, title, depth, selected: id === selected, ...o, reveal: r < 1 ? r : undefined }];
  };
  const chapter = (c: (typeof CHAPTERS_ONE)[number]) => [
    ...row(c.id, c.title, 2, { icon: FileText, open: c.scenes ? true : undefined }),
    ...(c.scenes ?? []).flatMap((s) => row(s.id, s.title, 3)),
  ];
  const manuscript: NavRowSpec[] = [
    ...row(PART_ONE.id, PART_ONE.title, 1, { icon: Layers, open: true, emphasis: true }),
    ...row(CHAPTERS_ONE[0].id, CHAPTERS_ONE[0].title, 1 + indent, { icon: FileText }),
    ...CHAPTERS_ONE.slice(1).flatMap(chapter),
    ...row(PART_TWO.id, PART_TWO.title, 1, { icon: Layers, open: true, emphasis: true }),
    ...CHAPTERS_TWO.flatMap(chapter),
  ];
  const workspace: NavRowSpec[] = [
    ...row(WORKSPACE.characters.id, WORKSPACE.characters.title, 1, { icon: Library, selected: false }),
    ...row(WORKSPACE.research.id, WORKSPACE.research.title, 1, { icon: FolderOpen, open: true, selected: false }),
    ...row(WORKSPACE.pitch.id, WORKSPACE.pitch.title, 2, { icon: PageIcon, selected: false }),
    ...row(WORKSPACE.aphasia.id, WORKSPACE.aphasia.title, 2, { icon: PageIcon, selected: false }),
    ...row(WORKSPACE.canvas.id, WORKSPACE.canvas.title, 1, { icon: CanvasIcon, selected: false }),
  ];
  const unplaced = reveal("unplaced");
  return [
    { id: "manuscript", label: "Manuscript", count: words, open: true, rows: manuscript },
    { id: "unplaced", label: "Unplaced Scenes", count: UNPLACED.reduce((n, u) => n + u.words, 0), open: false, rows: [], reveal: unplaced < 1 ? unplaced : undefined },
    { id: "workspace", label: "Workspace", open: workspace.length > 0, rows: workspace },
  ];
}

const blink = (t: number, since: number) => (Math.floor((t - since) / 0.53) % 2 === 0 ? 1 : 0);

/** The product at t: the opening Chapter, the temporal column, or The Flat A with the writer's new line. */
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
  const g = geometry(m);
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
  // At rest: The Flat A, where the lapse came to rest; then the writer's own line.
  const n = t < T.type2 ? 0 : typedCount(Math.round(t * FPS), RETURN_TIMES);
  const typed = RETURN_TYPED.slice(0, n);
  const typing = t >= T.type2 && t < RETURN_END + 0.4;
  const caret = t < T.type2 ? blink(t, REST) : typing ? 1 : blink(t, RETURN_END + 0.4);
  return {
    nav: grownNav(t, at, FLAT_A.id, MANUSCRIPT_WORDS + wordsIn(typed)),
    tabs: FLAT_TABS,
    trail: FLAT_TRAIL,
    main: <ManuscriptDoc eyebrow={FLAT_A.chapter} title={FLAT_A.title} paragraphs={FLAT_A_PROSE} openLine="" typed={typed} caret={caret} />,
    status: <DocStatus words={FLAT_A.words + wordsIn(typed)} state={typing ? "Saving…" : "Saved"} />,
  };
}

/**
 * The writing chrome, the app's own: it leaves 0.7s into sustained typing
 * (460ms), returns when the writer reaches for the interface (200ms; here
 * at rest, the pointer off-frame), and leaves again with the last typing —
 * and stays away through the retreat, because nothing reaches for it.
 */
function writingAt(t: number) {
  const first = span(t, T.type + WRITING_SETTLE, FADE_OUT, EASE_FRAME) * (1 - span(t, REST + T.chromeBack, FADE_IN, EASE_FRAME));
  const second = span(t, T.type2 + WRITING_SETTLE, FADE_OUT, EASE_FRAME);
  return Math.max(first, second);
}

// ── Probes: where the authentic states put things ──────────────────────────

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
const FLAT_STATE: ShellState = {
  nav: newProjectNav(0),
  tabs: FLAT_TABS,
  trail: FLAT_TRAIL,
  main: <ManuscriptDoc eyebrow={FLAT_A.chapter} title={FLAT_A.title} paragraphs={FLAT_A_PROSE} openLine="" typed="" caret={1} />,
  status: null,
};
export const PROBES: ProbeSpec[] = [
  { id: "open", node: probeShell(OPEN_STATE), anchors: [{ key: "line", selector: ".r2-prose p", text: "off a card." }] },
  { id: "stream", node: probeShell(STREAM_STATE), anchors: STREAM_ANCHORS },
  { id: "flat", node: probeShell(FLAT_STATE), anchors: [{ key: "line", selector: ".r2-prose p:last-of-type", mode: "box" }] },
];

// ── The camera ─────────────────────────────────────────────────────────────

const CENTRE = { x: FRAME.width / 2, y: FRAME.height / 2 };
/** The window's top-left corner at (left, top) on screen, at scale s. */
const win = (left: number, top: number, s: number): CameraState => ({ x: 0, y: 0, s, ax: left, ay: top });
/** World point P pinned at screen point A, at scale s. */
const pin = (P: { x: number; y: number }, A: { x: number; y: number }, s: number): CameraState => ({ x: P.x, y: P.y, s, ax: A.x, ay: A.y });
/** Two framings blended by what sits at the frame's centre (scale in log space): one dolly, not a drift of corners. */
function blend(a: CameraState, b: CameraState, p: number): CameraState {
  if (p <= 0) return a;
  if (p >= 1) return b;
  const centre = (c: CameraState) => ({ x: c.x + (CENTRE.x - c.ax) / c.s, y: c.y + (CENTRE.y - c.ay) / c.s });
  const A = centre(a);
  const B = centre(b);
  return { x: lerp(A.x, B.x, p), y: lerp(A.y, B.y, p), s: logLerp(a.s, b.s, p), ax: CENTRE.x, ay: CENTRE.y };
}
const PUSH = Easing.bezier(0.5, 0.0, 0.22, 1);

/** Composition A: the window's corner on the margin under the hook's slot, at the carousel cover's scale. */
const CAM_A = win(MARGIN, 580, 1.45);
/** C: the spine — the window opened a little, its top a touch higher as the growth runs down. */
const CAM_GROW = win(MARGIN, 600, 1.15);
const CAM_REST = win(MARGIN, 560, 1.15);
/** F: the whole window, small, centred on the stage. */
const CAM_FAR: CameraState = { x: WIN.width / 2, y: 740, s: FAR_S, ax: CENTRE.x, ay: CENTRE.y };
const closeOn = (lineY: number) => pin({ x: WIN.nav, y: lineY }, { x: 0, y: 990 }, CLOSE_S);

export function cameraAt(t: number, m: Probes): CameraState {
  const openLine = m.open.line.box;
  const flatLine = m.flat.line.box;
  let cam = CAM_A;
  cam = blend(cam, closeOn(openLine.y + openLine.h / 2), span(t, T.push, T.pushDur, PUSH));
  cam = blend(cam, CAM_GROW, span(t, T.open, T.openDur, CAMERA));
  cam = blend(cam, CAM_REST, span(t, T.open + T.openDur, REST - (T.open + T.openDur), CAMERA));
  cam = blend(cam, closeOn(flatLine.y + flatLine.h / 2), span(t, T.back, T.backDur, PUSH));
  cam = blend(cam, CAM_FAR, span(t, AWAY, T.retreatDur, RETREAT_CURVE));
  return cam;
}

// ── Copy and brand (the stage's own ink: the Dark theme's first ink on the film's stage) ──

const SERIF = "var(--r2-prose-font)";
const SANS = "var(--r2-font-ui)";
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
function Answer({ lines, o, size = 56 }: { lines: readonly string[]; o: number; size?: number }) {
  if (o <= 0.001) return null;
  return (
    <p style={{ marginTop: 14, fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, fontSize: size, lineHeight: 1.14, letterSpacing: "-0.01em", color: "var(--r2-accent-ink)", opacity: o, transform: `translateY(${(1 - o) * 10}px)` }}>
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
  const l1 = span(t, T.line1, 0.5, SETTLE) * out;
  const l2 = span(t, T.line2, 0.55, SETTLE) * out;
  return (
    <div style={{ position: "absolute", left: MARGIN, top: 284, width: COPY_W }}>
      {hook > 0.001 && <Statement lines={HOOK} o={hook} />}
      {hook <= 0.001 && (
        <>
          <Statement lines={[LINE_1]} o={l1} />
          <Answer lines={LINE_2} o={l2} />
        </>
      )}
    </div>
  );
}

/** The close: the approved wordmark, the action, the address, the status — in reading order, then still. */
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

export const frameScope = (t: number) => `a${Math.round(t * 10000)}`;

/** The picture at t seconds: pure, so the strips and the sheet draw the same frames as the cut. */
export function frameAt(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cameraAt(t, m);
  const s = stateAt(t, m, scope);
  const css = writingCss(scope, writingAt(t));
  // FILM-ONLY: the window goes late and short — full light until it is small, then removed over four frames.
  const u = clamp01((t - FADE_GO) / (GO_FRAMES / FPS));
  const windowO = 1 - u * u;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: STAGE_INK }}>
      {windowO > 0.001 && (
        <div style={{ position: "absolute", inset: 0, opacity: windowO }}>
          <Camera state={cam}>
            <Window>
              <AdShell s={s} scope={scope} css={css} />
            </Window>
          </Camera>
        </div>
      )}
      <Copy t={t} />
      <Brand t={t} />
    </div>
  );
}

// ── Sound: a quiet room, a real keyboard, nothing else ─────────────────────

export type Cue = { at: number; src: string; volume: number; seconds: number; note: string };

/** Real keystrokes (src/audio/typing-real: CC0, one keyboard, one room), rotated so no key is heard twice running. */
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
/** The lapse: months of typing as a texture whose density follows the page's own speed, silent before the page is still. */
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
  ...typed(RETURN_TYPED, RETURN_TIMES, 0.5, 1209, "the writer types, back in The Flat A (~3 dB under the opening)"),
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

// ── The composition ────────────────────────────────────────────────────────

const DARK = { theme: "dark", surface: "theme", accent: "blue" } as const;

export function Ad01StartSimple({ sound = true }: { sound?: boolean }) {
  const t = useCurrentFrame() / FPS;
  return (
    <Stage appearance={DARK} background={STAGE_INK}>
      <WithProbes probes={PROBES}>{(m) => frameAt(t, m)}</WithProbes>
      {sound && <Sound />}
    </Stage>
  );
}

/** What is the product and what is the film, for the report. */
export const PHASES = [
  { from: 0, to: T.type + WRITING_SETTLE, kind: "authentic", label: "A · the new Project: Manuscript → Chapter 1; the writer types" },
  { from: T.type + WRITING_SETTLE, to: T.grow, kind: "authentic", label: "A→B · the chrome leaves (data-writing); the camera follows the writing in" },
  { from: T.grow, to: REST, kind: "film-only", label: "C · months compressed: the stream, the front, speed blur; rows arrive from Chapter 1" },
  { from: REST, to: T.back, kind: "authentic", label: "D · at rest: the finished navigator, the Workspace at its foot, The Flat A" },
  { from: T.back, to: AWAY, kind: "authentic", label: "E · close on The Flat A; the writer types" },
  { from: AWAY, to: BRAND, kind: "film-only", label: "F · the window recedes into the stage" },
  { from: BRAND, to: END, kind: "authentic", label: "Sutura · Start writing free" },
] as const;
