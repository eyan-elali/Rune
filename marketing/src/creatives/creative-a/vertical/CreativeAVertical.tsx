import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { continueRender, delayRender, useCurrentFrame } from "remotion";
import { FileText, File as PageIcon, Folder, Frame, Layers, Library } from "lucide-react";
import { Camera, cameraAt, TRAVEL, type CameraKey, type CameraState } from "../../../foundation/Camera";
import { Caption } from "../../../foundation/Caption";
import { Cursor, cursorAt } from "../../../foundation/Cursor";
import { EndFrame } from "../../../foundation/EndFrame";
import { FPS } from "../../../foundation/formats";
import { Stage } from "../../../foundation/Stage";
import { EASE, EASE_FRAME, mix, presence, progress, typedCount } from "../../../foundation/time";
import {
  CHAPTER_1,
  CHAPTER_1_LAST_LINE,
  CHAPTER_1_LAST_TYPED,
  CHAPTER_1_PROSE,
  CHAPTER_1_RETURN_TYPED,
  CHAPTER_2,
  CHAPTER_3,
  CHARACTER_BOARD,
  PART_I,
  PEN_NAME,
  PROJECT,
  STORY_MAP,
  UNPLACED_SCENE,
  WORKSPACE_GROWN,
} from "../../../data/hollow";
import { CanvasPage } from "../../../ui/Canvas";
import { CollectionBoardPage } from "../../../ui/Collection";
import { ManuscriptDoc } from "../../../ui/Manuscript";
import { Navigator, type NavRowSpec, type NavSectionSpec } from "../../../ui/Navigator";
import { ContextBar, DocStatus, Shell, TabBand } from "../../../ui/Shell";
import { ANCHOR, GEOMETRY, SHELL } from "./geometry";
import { BOARD, CAPTIONS, CLOSE, CROSS, ENDING, GROWTH, MAP, RETURN, SCRIM, SETTLE, SWAP, type GrowthKey } from "./script";
import { CLICKS, TYPING } from "./beats";
import { Soundtrack } from "./Soundtrack";

// Creative A, 9:16 — "Chapter 1 was simple."
//
// Made for a phone first. The real shell is footage: the camera crops into
// it and follows one thing at a time — the last words of Chapter 1, the
// navigator as the book accumulates beneath it, the settled whole, the
// Characters Board, the Story Map — then back to Chapter 1, where the writer
// simply writes. Nothing is fitted to the frame because it exists.
//
// Every value is a function of the frame (foundation/time.ts). The shell is
// the app's markup and stylesheet (ui/*); only what is on it is staged.

export type CreativeAVerticalProps = {
  /** Lay the sound design under the picture (on by default). The creative is made to work silent. */
  sound?: boolean;
  /** A music file (imported asset URL) to replace the placeholder bed. */
  music?: string;
  /** Development: draw the shell at 1:1 and log where its parts are (scripts/measure.mjs). */
  measure?: boolean;
};

const ENDING_TIMES = TYPING.ending;
const RETURN_TIMES = TYPING.return;

const G = GEOMETRY;
const ROW = G.nav.row;

// ── The navigator's rows, in order ─────────────────────────────────────────

/** Row tops in the grown navigator (every row present). */
const ROW_Y = (() => {
  const order = ["manuscript", "part", "chapter1", "chapter2", "chapter3", "gap", "unplaced", "lighthouse", "gap", "workspace", "characters", "world", "research", "storyMap", "ending"];
  const y: Record<string, number> = {};
  let at = G.nav.top;
  for (const k of order) {
    if (k === "gap") {
      at += G.nav.sectionGap;
      continue;
    }
    y[k] = at;
    at += ROW;
  }
  return y;
})();

function growthAt(frame: number): Record<GrowthKey, number> {
  const g = {} as Record<GrowthKey, number>;
  for (const step of GROWTH) g[step.key] = progress(frame, step.at, step.dur, EASE_FRAME);
  return g;
}

/** The bottom of the navigator's revealed rows, logical px. */
function navBottom(frame: number): number {
  const g = growthAt(frame);
  return (
    G.nav.top +
    ROW * (1 + g.part + 1 + g.chapter2 + g.chapter3) +
    (G.nav.sectionGap + 2 * ROW) * g.unplaced +
    G.nav.sectionGap +
    ROW * (1 + g.characters + g.world + g.research + g.storyMap + g.ending)
  );
}

// ── The camera ─────────────────────────────────────────────────────────────

const A = ANCHOR.copy;
/** Shot 1: the manuscript's ending, filling the clear frame. */
const ON_ENDING: Omit<CameraKey, "t"> = { x: G.proseEnd.x, y: G.proseEnd.y - 60, s: 2.36 };
/** Shot 2: the navigator large, its left edge on the frame's. */
const NAV_S = 3.2;
const ON_NAV = { x: A.ax / NAV_S, y: ROW_Y.manuscript + (A.ay - 720) / NAV_S, s: NAV_S };
/** Where a revealed row should land while the book grows: low in the clear frame. */
const TRACK_LEAD = (1330 - A.ay) / NAV_S;

function tracked(frame: number): CameraState {
  // A short moving average of the ideal: one continuous move, not a step per row.
  const W = 12;
  let y = 0;
  for (let i = 0; i < W; i++) y += Math.max(ON_NAV.y, navBottom(frame - i) - TRACK_LEAD);
  return { x: ON_NAV.x, y: y / W, s: NAV_S, ...A };
}

const SETTLED_S = 2.15;
const SETTLED: Omit<CameraKey, "t"> = { x: A.ax / SETTLED_S, y: (A.ay - 610) / SETTLED_S, s: SETTLED_S };
const BOARD_S = 2.55;
// The frame's left edge just inside the board's own clip, so its lanes scroll out of the frame, not out of a box.
const ON_BOARD: Omit<CameraKey, "t"> = { x: G.board.x - 14 + A.ax / BOARD_S, y: G.board.eyebrow + (A.ay - 640) / BOARD_S, s: BOARD_S };
const BACK_S = 2.3;
const ON_WORKSPACE: Omit<CameraKey, "t"> = { x: A.ax / BACK_S, y: ROW_Y.storyMap + (A.ay - 1150) / BACK_S, s: BACK_S };
const MAP_S = 2.5;
const ON_MAP: Omit<CameraKey, "t"> = { x: G.canvas.x + A.ax / MAP_S, y: G.canvas.y + 20 + (A.ay - 640) / MAP_S, s: MAP_S };
const C = ANCHOR.clear;
const RET_S = 2.4;
// Still under the copy's ground (the copy itself has gone), so the shell's top edge never shows.
const ON_CHAPTERS: Omit<CameraKey, "t"> = { x: A.ax / RET_S, y: ROW_Y.chapter1 + (A.ay - 800) / RET_S, s: RET_S };
// The whole Chapter's last page: its title at the top, the new line low in the frame.
const ON_WRITING: Omit<CameraKey, "t"> = { x: G.proseEnd.x, y: G.proseEnd.y - 50, s: 2.4, ...C };

function camera(frame: number): CameraState {
  const now = frame / FPS;
  const crossEnd = CROSS.at + CROSS.dur;
  if (now < crossEnd)
    return cameraAt(
      [
        { t: 0, ...ON_ENDING },
        { t: CROSS.at, ...ON_ENDING, s: 2.4, ease: (t) => t },
        { t: crossEnd, ...ON_NAV, ease: TRAVEL },
      ],
      now,
      A
    );
  if (now < SETTLE.at) return tracked(frame);
  const from = tracked(Math.round(SETTLE.at * FPS));
  return cameraAt(
    [
      { t: SETTLE.at, ...from },
      { t: SETTLE.at + SETTLE.dur, ...SETTLED, ease: TRAVEL },
      { t: BOARD.pushAt, ...SETTLED },
      { t: BOARD.pushAt + BOARD.pushDur, ...ON_BOARD, ease: TRAVEL },
      { t: MAP.backAt, ...ON_BOARD, x: ON_BOARD.x + 4, ease: (t) => t },
      { t: MAP.backAt + MAP.backDur, ...ON_WORKSPACE, ease: TRAVEL },
      { t: MAP.pushAt, ...ON_WORKSPACE },
      { t: MAP.pushAt + MAP.pushDur, ...ON_MAP, ease: TRAVEL },
      { t: RETURN.backAt, ...ON_MAP },
      { t: RETURN.backAt + RETURN.backDur, ...ON_CHAPTERS, ease: TRAVEL },
      { t: RETURN.pushAt, ...ON_CHAPTERS },
      { t: RETURN.pushAt + RETURN.pushDur, ...ON_WRITING, ease: TRAVEL },
      { t: 12, ...ON_WRITING, s: 2.46, ease: (t) => t },
    ],
    now,
    A
  );
}

// ── The pointer ────────────────────────────────────────────────────────────

const ROW_HIT_X = 96;
const rowHit = (key: string) => ROW_Y[key] + ROW / 2 - 6;
const CURSOR_KEYS = [
  { t: BOARD.cursorIn, x: 410, y: 300 },
  { t: BOARD.atRow, x: ROW_HIT_X, y: rowHit("characters") },
  { t: BOARD.open + 0.12, x: ROW_HIT_X, y: rowHit("characters") },
  { t: BOARD.open + 0.5, x: 380, y: 330 },
  { t: MAP.cursorFrom, x: 380, y: 330 },
  { t: MAP.atRow, x: ROW_HIT_X + 4, y: rowHit("storyMap") },
  { t: MAP.open + 0.12, x: ROW_HIT_X + 4, y: rowHit("storyMap") },
  { t: MAP.open + 0.55, x: 430, y: 420 },
  { t: RETURN.cursorFrom, x: 430, y: 420 },
  { t: RETURN.atRow, x: ROW_HIT_X + 8, y: rowHit("chapter1") },
  { t: 12, x: ROW_HIT_X + 8, y: rowHit("chapter1") },
];

// ── The working set ────────────────────────────────────────────────────────

type Open = "chapter1" | "characters" | "storyMap";
function openAt(now: number): Open {
  if (now < BOARD.open) return "chapter1";
  if (now < MAP.open) return "characters";
  if (now < RETURN.open) return "storyMap";
  return "chapter1";
}

export function CreativeAVertical({ sound = true, music, measure = false }: CreativeAVerticalProps) {
  const frame = useCurrentFrame();
  const now = frame / FPS;

  // ── The writing ────────────────────────────────────────────────────────
  const ended = typedCount(frame, ENDING_TIMES);
  const returned = typedCount(frame, RETURN_TIMES);
  const blink = Math.floor((now * 1000) / 530) % 2 === 0 ? 1 : 0;
  const endingTyping = now >= ENDING.typeAt && ended < CHAPTER_1_LAST_TYPED.length + 1 && now <= ENDING_TIMES[ENDING_TIMES.length - 1] + 0.05;
  const returnTyping = now >= RETURN.typeAt - 0.05;
  const returnedText = CHAPTER_1_RETURN_TYPED.slice(0, returned);
  const words = (text: string) => (text.match(/\S+(?=\s)/g) ?? []).length;
  const chapter1Words = CHAPTER_1.words + words(CHAPTER_1_LAST_TYPED.slice(0, ended) + " ") + words(returnedText);

  // ── The growth ─────────────────────────────────────────────────────────
  const g = growthAt(frame);
  const open = openAt(now);
  const pointerOver = (key: string, at: number, clickAt: number) => now >= at - 0.06 && now < clickAt;
  const stepBack =
    progress(frame, SETTLE.stepBack.in, SETTLE.stepBack.dur) * (1 - progress(frame, SETTLE.stepBack.out, SETTLE.stepBack.dur));
  const workspaceInk = mix(1, SETTLE.stepBack.ink, stepBack);
  const chapterDepth = mix(1, 2, g.part);
  const manuscriptRows: NavRowSpec[] = [
    ...(g.part > 0 ? [{ id: PART_I.id, title: PART_I.title, icon: Layers, depth: 1, open: true, emphasis: true, reveal: g.part }] : []),
    {
      id: CHAPTER_1.id,
      title: CHAPTER_1.title,
      icon: FileText,
      depth: chapterDepth,
      selected: open === "chapter1",
      hover: pointerOver("chapter1", RETURN.atRow, RETURN.open),
    },
    ...(g.chapter2 > 0 ? [{ id: CHAPTER_2.id, title: CHAPTER_2.title, icon: FileText, depth: chapterDepth, reveal: g.chapter2 }] : []),
    ...(g.chapter3 > 0 ? [{ id: CHAPTER_3.id, title: CHAPTER_3.title, icon: FileText, depth: chapterDepth, reveal: g.chapter3 }] : []),
  ];
  const W = WORKSPACE_GROWN;
  const workspaceRows: NavRowSpec[] = (
    [
      { id: W.characters.id, title: W.characters.title, icon: Library, depth: 1, reveal: g.characters, selected: open === "characters", hover: pointerOver("characters", BOARD.atRow, BOARD.open) },
      { id: W.world.id, title: W.world.title, icon: Folder, depth: 1, open: false, reveal: g.world },
      { id: W.research.id, title: W.research.title, icon: PageIcon, depth: 1, reveal: g.research },
      { id: W.storyMap.id, title: W.storyMap.title, icon: Frame, depth: 1, reveal: g.storyMap, selected: open === "storyMap", hover: pointerOver("storyMap", MAP.atRow, MAP.open) },
      { id: W.ending.id, title: W.ending.title, icon: PageIcon, depth: 1, reveal: g.ending },
    ] as NavRowSpec[]
  ).filter((r) => (r.reveal ?? 1) > 0);
  const manuscriptWords = chapter1Words + (g.chapter2 > 0.5 ? CHAPTER_2.words : 0) + (g.chapter3 > 0.5 ? CHAPTER_3.words : 0);
  const sections: NavSectionSpec[] = [
    { id: "manuscript", label: "Manuscript", count: manuscriptWords, open: true, rows: manuscriptRows },
    {
      id: "unplaced",
      label: "Unplaced Scenes",
      count: UNPLACED_SCENE.words,
      open: true,
      reveal: g.unplaced,
      rows: [{ id: UNPLACED_SCENE.id, title: UNPLACED_SCENE.title, depth: 1, muted: true }],
    },
    // A Project's Workspace is closed while it is empty (ProjectNavigator).
    { id: "workspace", label: "Workspace", open: workspaceRows.length > 0, rows: workspaceRows, ink: workspaceInk },
  ];

  // ── The content ────────────────────────────────────────────────────────
  // The content changes surface with a short dip, as a View arrives (r2-view-enter).
  const dip = (at: number) => {
    const t = now - at;
    if (t < -SWAP / 2 || t > SWAP) return 1;
    return t < 0 ? mix(1, 0.15, EASE((t + SWAP / 2) / (SWAP / 2))) : mix(0.15, 1, EASE(t / SWAP));
  };
  const contentInk = Math.min(dip(BOARD.open), dip(MAP.open), dip(RETURN.open));
  const boardScroll = BOARD.scroll * progress(frame, BOARD.scrollAt, BOARD.scrollDur, (t) => TRAVEL(t));
  const pan = progress(frame, MAP.panAt, MAP.panDur, (t) => t * t * (3 - 2 * t));
  const vp = { tx: mix(14, -116, pan), ty: mix(95, -55, pan), scale: 0.85 };
  const returning = now >= RETURN.open;

  const trail: Record<Open, string[]> = {
    chapter1: g.part > 0.5 ? ["Manuscript", PART_I.title, CHAPTER_1.title] : ["Manuscript", CHAPTER_1.title],
    characters: ["Workspace", W.characters.title],
    storyMap: ["Workspace", W.storyMap.title],
  };
  const tabLabel: Record<Open, string> = { chapter1: CHAPTER_1.title, characters: W.characters.title, storyMap: W.storyMap.title };

  const main =
    open === "characters" ? (
      <CollectionBoardPage
        title={W.characters.title}
        groupBy={CHARACTER_BOARD.property}
        properties={CHARACTER_BOARD.properties.length}
        lanes={CHARACTER_BOARD.lanes}
        scroll={boardScroll}
      />
    ) : open === "storyMap" ? (
      <CanvasPage title={W.storyMap.title} sections={STORY_MAP.sections} cards={STORY_MAP.cards} lines={STORY_MAP.lines} vp={vp} />
    ) : returning ? (
      <ManuscriptDoc
        title={CHAPTER_1.title}
        paragraphs={[...CHAPTER_1_PROSE, CHAPTER_1_LAST_LINE + CHAPTER_1_LAST_TYPED]}
        openLine=""
        typed={returnedText}
        caret={returnTyping ? 1 : blink}
      />
    ) : (
      <ManuscriptDoc
        title={CHAPTER_1.title}
        paragraphs={CHAPTER_1_PROSE}
        openLine={CHAPTER_1_LAST_LINE}
        typed={CHAPTER_1_LAST_TYPED.slice(0, ended)}
        caret={endingTyping ? 1 : now < BOARD.open ? blink : 0}
      />
    );

  const shell = (
    <Shell
      width={SHELL.width}
      height={SHELL.height}
      navWidth={SHELL.navWidth}
      manuscript={open === "chapter1"}
      nav={<Navigator project={PROJECT} sections={sections} penName={PEN_NAME} />}
      tabs={<TabBand tabs={[{ key: "tab", label: tabLabel[open], active: true }]} />}
      contextBar={<ContextBar project={PROJECT} trail={trail[open]} read={open === "chapter1"} />}
      main={<div style={{ opacity: contentInk, height: "100%", display: "flex", flexDirection: "column" } as CSSProperties}>{main}</div>}
      status={open === "chapter1" ? <DocStatus words={chapter1Words} state="Saved" /> : null}
    />
  );

  // ── The pointer ────────────────────────────────────────────────────────
  const cursor = cursorAt(CURSOR_KEYS, now, EASE_FRAME);
  const cursorInk = presence(frame, BOARD.cursorIn, RETURN.cursorOut + 0.22, 0.2, 0.22);
  const pressed = CLICKS.some((t) => now >= t - 0.06 && now < t + 0.08);

  // ── The frame ──────────────────────────────────────────────────────────
  const footage = 1 - progress(frame, CLOSE.footageOut, CLOSE.footageDur);
  const scrim = 1 - progress(frame, SCRIM.out, SCRIM.dur);

  if (measure) return <Measure>{shell}</Measure>;

  return (
    <Stage>
      {sound && <Soundtrack music={music} />}

      {footage > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: footage }}>
          <Camera state={camera(frame)}>
            {shell}
            {cursorInk > 0 && <Cursor x={cursor.x} y={cursor.y} opacity={cursorInk} pressed={pressed} size={1.15} />}
          </Camera>
        </div>
      )}

      {/* The copy's ground: the page itself, laid over the top of the footage while there is copy. */}
      {scrim > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 760,
            opacity: scrim,
            background: "linear-gradient(to bottom, var(--r2-page-bg) 0, var(--r2-page-bg) 620px, transparent 740px)",
          }}
        />
      )}

      <div style={{ position: "absolute", left: 72, top: 250, width: 936, height: 330, display: "grid", alignItems: "end" }}>
        {CAPTIONS.map((c) => (
          <div key={c.text} style={{ gridArea: "1 / 1" }}>
            <Caption inAt={c.in} outAt={c.out} style={{ size: 104, width: 936 }}>
              {c.text}
            </Caption>
          </div>
        ))}
      </div>

      {now >= CLOSE.endIn - 0.05 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 880, transform: "translateY(-50%)", display: "flex", justifyContent: "center" }}>
          <EndFrame inAt={CLOSE.endIn} titleSize={156} wordmarkWidth={500} noteSize={46} gap={100} />
        </div>
      )}
    </Stage>
  );
}

/** Development: the shell at 1:1, with the rectangles the geometry is read from logged. */
function Measure({ children }: { children: ReactNode }) {
  const [handle] = useState(() => delayRender("Measuring the shell"));
  useLayoutEffect(() => {
    void document.fonts.ready.then(() => requestAnimationFrame(() => {
    const root = document.querySelector(".r2-shell")!.getBoundingClientRect();
    const rel = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left - root.left), y: Math.round(r.top - root.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const out: Record<string, unknown> = {};
    out.rows = [...document.querySelectorAll(".r2-nav .r2-row")].map((el) => ({ label: el.textContent, ...rel(el) }));
    const ps = [...document.querySelectorAll(".ProseMirror p")];
    if (ps.length) out.lastParagraph = rel(ps[ps.length - 1]);
    const lane = document.querySelector(".r2-lane");
    if (lane) out.lane = rel(lane);
    const board = document.querySelector(".r2-board");
    if (board) out.board = { ...rel(board), scrollWidth: board.scrollWidth, clientWidth: board.clientWidth, scrollLeft: board.scrollLeft };
    const head = document.querySelector(".r2-page-title");
    if (head) out.title = rel(head);
    const canvas = document.querySelector(".r2-canvas");
    if (canvas) out.canvas = rel(canvas);
    const main = document.querySelector(".r2-main");
    if (main) out.main = rel(main);
    console.log("MEASURE " + JSON.stringify(out));
    continueRender(handle);
    }));
  }, [handle]);
  return (
    <Stage>
      <div style={{ position: "absolute", left: 0, top: 0 }}>{children}</div>
    </Stage>
  );
}
