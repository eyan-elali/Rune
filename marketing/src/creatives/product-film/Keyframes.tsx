import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { FileText, File as PageIcon, Folder, FolderOpen, Frame, Layers, Library } from "lucide-react";
import { WORDMARK } from "@/lib/brand";
import { Camera, type CameraState } from "../../foundation/Camera";
import { Cursor } from "../../foundation/Cursor";
import {
  CHARACTERS_BOARD,
  CHARACTERS_PROPERTIES,
  ELIAS,
  ELIAS_BODY,
  LEDGER_BACKLINKS,
  LEDGER_BODY,
  LEDGER_FACTS,
  LEDGER_RELATED,
  MANUSCRIPT_WORDS,
  NIGHT_CARDS,
  NIGHT_LINES,
  NIGHT_SECTIONS,
  NOTES_TRAIL,
  PART_I,
  PART_I_CHAPTERS,
  PART_II,
  PART_II_CHAPTERS,
  PEN_NAME,
  PROJECT,
  REVISION_NOTES,
  SCENE,
  SCENE_HISTORY,
  SCENE_MILESTONE,
  SCENE_OPEN_LINE,
  SCENE_OPEN_TYPED,
  SCENE_PROPERTIES,
  SCENE_PROSE,
  SCENE_RETURN_TYPED,
  TIMELAPSE_PROSE,
  UNPLACED,
  WORKSPACE,
} from "../../data/salt-house";
import { CanvasPage, type CanvasViewport } from "../../ui/Canvas";
import { CollectionBoardPage } from "../../ui/Collection";
import { ManuscriptDoc } from "../../ui/Manuscript";
import { Navigator, type NavRowSpec, type NavSectionSpec } from "../../ui/Navigator";
import { EntryDoc, WorkspacePageDoc } from "../../ui/Page";
import {
  ConnectionsSection,
  HistorySection,
  InspectorHead,
  MilestonesSection,
  PanelSheet,
  RevisionNotesBody,
  SceneProperties,
  type PropertySpec,
} from "../../ui/Panel";
import { ContextBar, DocStatus, Shell, TabBand, type TabSpec } from "../../ui/Shell";
import { FILM, type KeyframeId } from "./frames";

// Sutura's product film, as thirteen still keyframes (PRODUCT_FILM_STORYBOARD.md).
//
// The world is one light Sutura window — the real shell (ui/*: the app's own
// markup, classes and rune2.css) at a laptop's logical size — standing on a
// dark stage (the theme registry's Dark page). The camera (foundation/Camera)
// treats the window as an environment: wide only once, at the reveal; close
// everywhere else, letting the window's edges run out of frame. The stage is
// the Dark theme's root; the window is a Light root inside it, exactly as a
// writer's appearance would make it.

/** The window's logical size: a wide laptop browser viewport. */
export const SHELL = { width: 1520, height: 780, nav: 252 } as const;
/** The wide shot: the window across ~90% of the frame's width. */
const WIDE_S = 1736 / SHELL.width;

type Selected = "scene" | "ledger" | "characters" | "elias" | "canvas" | "timelapse";
type Growth = "draft" | "growing" | "full";

export type Plan = {
  selected: Selected;
  growth: Growth;
  tabs: TabSpec[];
  panel?: "notes" | "inspector-scene" | "inspector-ledger";
  navCollapsed?: boolean;
  camera: CameraState;
  cursor?: { x: number; y: number; pressed?: boolean };
  /** Frame 01: the paragraph being finished; 12: the sentence brought back. */
  prose?: "finishing" | "settled" | "returning";
  canvas?: CanvasViewport;
  boardScroll?: number;
  /** A row the pointer is over. */
  hoverRow?: string;
  hoverCard?: string;
  hoverLink?: string;
  /**
   * The time-lapse's window: narrower, the navigator dragged to its widest
   * (NAV_MAX, 400) — real layout states — so structure and prose sit side by
   * side. Its edges are never in frame.
   */
  window?: { width: number; nav: number };
  /** The panel scrolled, px (the Inspector runs past the window's height). */
  panelScroll?: number;
  /** A motion study's own drawing of the content or the panel (studies/): the same markup, with film-only staging. */
  mainNode?: ReactNode;
  panelNode?: ReactNode;
  /** The film's own navigator state (the time-lapse: rows arriving), trail and status — the same components, other data. */
  nav?: NavSectionSpec[];
  trail?: string[];
  status?: ReactNode;
};

/** A camera state: logical point (x, y) of the window pinned to screen (ax, ay) at scale s. */
export const on = (x: number, y: number, s: number, ax = FILM.width / 2, ay = FILM.height / 2): CameraState => ({ x, y, s, ax, ay });

// ── The navigator ──────────────────────────────────────────────────────────

const chapterRows = (
  chapters: typeof PART_I_CHAPTERS,
  opts: { selected?: string; hover?: string; reveal?: (i: number) => number | undefined; scenesOf?: (id: string) => number }
): NavRowSpec[] =>
  chapters.flatMap((c, i) => {
    const reveal = opts.reveal?.(i);
    if (reveal !== undefined && reveal <= 0) return [];
    const scenes = c.scenes ? c.scenes.slice(0, opts.scenesOf?.(c.id) ?? c.scenes.length) : [];
    const row: NavRowSpec = {
      id: c.id,
      title: c.title,
      icon: FileText,
      depth: 2,
      open: scenes.length > 1 ? true : undefined,
      selected: opts.selected === c.id,
      hover: opts.hover === c.id,
      reveal,
    };
    return [
      row,
      ...(scenes.length > 1
        ? scenes.map((s) => ({ id: s.id, title: s.title, depth: 3, selected: opts.selected === s.id, hover: opts.hover === s.id, reveal }))
        : []),
    ];
  });

export function navSections(plan: Plan): NavSectionSpec[] {
  const g = plan.growth;
  const sel =
    plan.selected === "scene"
      ? SCENE.id
      : plan.selected === "ledger"
        ? WORKSPACE.ledger.id
        : plan.selected === "characters"
          ? WORKSPACE.characters.id
          : plan.selected === "canvas"
            ? WORKSPACE.canvas.id
            : plan.selected === "timelapse"
              ? "c-ledger"
              : undefined;
  const hover = plan.hoverRow;

  // The first draft as it stood in the opening: Part I, three Chapters, the Scene being written.
  const partI =
    g === "draft"
      ? chapterRows(PART_I_CHAPTERS.slice(0, 3), { selected: sel, hover, scenesOf: () => 2 })
      : chapterRows(PART_I_CHAPTERS, { selected: sel, hover });
  // The time-lapse: Part II arriving, its last Chapter half-revealed.
  // (The third — The Cliff Path — is arriving: drawn at part ink below.)
  const partII =
    g === "draft" ? [] : chapterRows(PART_II_CHAPTERS, { selected: sel, hover, reveal: g === "growing" ? (i) => (i < 3 ? 1 : 0) : undefined });
  const words =
    g === "draft"
      ? PART_I_CHAPTERS[0].words + PART_I_CHAPTERS[1].words + 2240 + SCENE.words - 9
      : g === "growing"
        ? MANUSCRIPT_WORDS - PART_II_CHAPTERS[3].words - 2950
        : MANUSCRIPT_WORDS;

  if (g === "growing") {
    const arriving = partII.find((r) => r.id === "c-cliff");
    if (arriving) arriving.ink = 0.4;
  }
  const manuscriptRows: NavRowSpec[] = [
    { id: PART_I.id, title: PART_I.title, icon: Layers, depth: 1, open: true, emphasis: true },
    ...partI,
    ...(g === "draft" ? [] : [{ id: PART_II.id, title: PART_II.title, icon: Layers, depth: 1, open: true, emphasis: true } as NavRowSpec]),
    ...partII,
  ];

  const workspaceRows: NavRowSpec[] =
    g === "draft"
      ? [
          { id: WORKSPACE.characters.id, title: WORKSPACE.characters.title, icon: Library, depth: 1 },
          { id: WORKSPACE.research.id, title: WORKSPACE.research.title, icon: Folder, depth: 1, open: false },
        ]
      : [
          { id: WORKSPACE.characters.id, title: WORKSPACE.characters.title, icon: Library, depth: 1, selected: sel === WORKSPACE.characters.id, hover: hover === WORKSPACE.characters.id },
          { id: WORKSPACE.research.id, title: WORKSPACE.research.title, icon: FolderOpen, depth: 1, open: true },
          { id: WORKSPACE.ledger.id, title: WORKSPACE.ledger.title, icon: PageIcon, depth: 2, selected: sel === WORKSPACE.ledger.id },
          { id: WORKSPACE.harbour.id, title: WORKSPACE.harbour.title, icon: PageIcon, depth: 2 },
          { id: WORKSPACE.canvas.id, title: WORKSPACE.canvas.title, icon: Frame, depth: 1, selected: sel === WORKSPACE.canvas.id, hover: hover === WORKSPACE.canvas.id, ink: g === "growing" ? 0.4 : undefined },
        ];

  return [
    { id: "manuscript", label: "Manuscript", count: words, open: true, rows: manuscriptRows },
    ...(g === "draft"
      ? []
      : [
          {
            id: "unplaced",
            label: "Unplaced Scenes",
            count: g === "full" ? UNPLACED[0].words + UNPLACED[1].words : UNPLACED[0].words,
            // Folded once the draft is done: the writer is revising Part I.
            open: g !== "full",
            rows: (g === "full" ? UNPLACED : UNPLACED.slice(0, 1)).map((u) => ({ id: u.id, title: u.title, depth: 1, muted: true })),
          } as NavSectionSpec,
        ]),
    { id: "workspace", label: "Workspace", open: true, rows: workspaceRows },
  ];
}

// ── The content ────────────────────────────────────────────────────────────

const caret = (on: boolean): CSSProperties => ({
  display: "inline-block",
  width: 2,
  height: "1.08em",
  marginLeft: 1,
  marginRight: -3,
  verticalAlign: "-0.18em",
  background: "var(--r2-ms-caret)",
  opacity: on ? 1 : 0,
});

function SceneDoc({ prose }: { prose: Plan["prose"] }) {
  if (prose === "finishing")
    return (
      <ManuscriptDoc
        eyebrow="The East Stair"
        title={SCENE.title}
        paragraphs={SCENE_PROSE}
        openLine={SCENE_OPEN_LINE}
        typed={SCENE_OPEN_TYPED.slice(0, 21)}
        caret={1}
      />
    );
  const settled = [...SCENE_PROSE, SCENE_OPEN_LINE + SCENE_OPEN_TYPED];
  if (prose === "returning")
    return (
      <ManuscriptDoc
        eyebrow="The East Stair"
        title={SCENE.title}
        paragraphs={settled}
        openLine=""
        typed={SCENE_RETURN_TYPED.slice(0, -6)}
        caret={1}
      />
    );
  // The pause: the writer back in the Scene, the caret resting after "Seventeen was empty."
  return (
    <div className="r2-writing">
      <article className="r2-doc r2-doc--manuscript">
        <header className="r2-doc-head">
          <p className="r2-doc-eyebrow">The East Stair</p>
          <h1 className="r2-doc-title">
            <span className="r2-doc-title-text">{SCENE.title}</span>
          </h1>
        </header>
        <div className="r2-scenes">
          <section className="r2-scene">
            <div className="r2-prose">
              <div className="ProseMirror tiptap">
                {settled.map((p, i) => (
                  <p key={i}>
                    {p}
                    {i === 3 && <span style={caret(true)} />}
                  </p>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}

/**
 * The time-lapse's editor: weeks of writing passing in one frame. Three
 * Chapters' prose at once, each displaced along the scroll and blurred along
 * it only (a vertical motion blur, #pf-scroll-blur), so the page reads as
 * moving, not broken.
 */
function TimelapseDoc() {
  const layers = [
    { y: -40, o: 0.8, title: "What the Ledger Kept", eyebrow: "Part II", prose: TIMELAPSE_PROSE.slice(0, 4) },
    { y: -330, o: 0.4, title: "The Inquest", eyebrow: "Part II", prose: TIMELAPSE_PROSE.slice(2, 6) },
    { y: 260, o: 0.32, title: "Low Tide", eyebrow: "Part I", prose: TIMELAPSE_PROSE.slice(3, 6).concat(TIMELAPSE_PROSE.slice(0, 2)) },
  ];
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      {layers.map((l) => (
        <div key={l.title} style={{ position: "absolute", inset: 0, transform: `translateY(${l.y}px)`, opacity: l.o, filter: "url(#pf-scroll-blur)" }}>
          <ManuscriptDoc eyebrow={l.eyebrow} title={l.title} paragraphs={l.prose} />
        </div>
      ))}
    </div>
  );
}

function main(plan: Plan): ReactNode {
  switch (plan.selected) {
    case "scene":
      return <SceneDoc prose={plan.prose} />;
    case "timelapse":
      return <TimelapseDoc />;
    case "ledger":
      return <WorkspacePageDoc title={WORKSPACE.ledger.title} blocks={LEDGER_BODY} />;
    case "characters":
      return (
        <CollectionBoardPage
          title={WORKSPACE.characters.title}
          groupBy="Whereabouts"
          properties={CHARACTERS_PROPERTIES.length}
          lanes={CHARACTERS_BOARD.map((l) => ({ name: l.name, cards: l.cards }))}
          scroll={plan.boardScroll}
          hover={plan.hoverCard}
        />
      );
    case "elias":
      return <EntryDoc collection={WORKSPACE.characters.title} title={ELIAS.title} properties={ELIAS.properties as PropertySpec[]} blocks={ELIAS_BODY} />;
    case "canvas":
      return <CanvasPage title={WORKSPACE.canvas.title} sections={NIGHT_SECTIONS} cards={NIGHT_CARDS} lines={NIGHT_LINES} vp={plan.canvas ?? { tx: 0, ty: 0, scale: 1 }} hover={plan.hoverCard} />;
  }
}

function panel(plan: Plan): ReactNode {
  if (plan.panel === "notes")
    return (
      <PanelSheet title="Revision Notes">
        <RevisionNotesBody trail={NOTES_TRAIL} notes={REVISION_NOTES.map((n, i) => ({ ...n, expanded: i === 0 }))} resolved={1} />
      </PanelSheet>
    );
  if (plan.panel === "inspector-scene")
    return (
      <PanelSheet title="Inspector" scroll={plan.panelScroll}>
        <div className="r2-inspector">
          <InspectorHead
            kind="Scene"
            title={SCENE.title}
            place={[PART_I.title, "The East Stair"]}
            facts={["Scene 2 of 3", `${SCENE.words.toLocaleString("en-US")} words`]}
            more={["In the manuscript: counts toward the total and export"]}
          />
          <SceneProperties
            properties={SCENE_PROPERTIES.map((p) => (p.name === "Research" ? { ...p, hover: plan.hoverLink } : p)) as PropertySpec[]}
          />
          <HistorySection versions={SCENE_HISTORY} />
          <MilestonesSection milestones={[SCENE_MILESTONE]} />
        </div>
      </PanelSheet>
    );
  if (plan.panel === "inspector-ledger")
    return (
      <PanelSheet title="Inspector">
        <div className="r2-inspector">
          <InspectorHead kind="Page" title={WORKSPACE.ledger.title} place={[WORKSPACE.research.title]} facts={LEDGER_FACTS} />
          <ConnectionsSection related={LEDGER_RELATED} backlinks={LEDGER_BACKLINKS} />
        </div>
      </PanelSheet>
    );
  return null;
}

const TRAIL: Record<Selected, string[]> = {
  scene: ["Manuscript", PART_I.title, "The East Stair", SCENE.title],
  timelapse: ["Manuscript", PART_II.title, "What the Ledger Kept"],
  ledger: ["Workspace", WORKSPACE.research.title, WORKSPACE.ledger.title],
  characters: ["Workspace", WORKSPACE.characters.title],
  elias: ["Workspace", WORKSPACE.characters.title, ELIAS.title],
  canvas: ["Workspace", WORKSPACE.canvas.title],
};

export function ShellFor({ plan }: { plan: Plan }) {
  const prose = plan.selected === "scene" || plan.selected === "timelapse";
  const panelAction = plan.panel === "notes" ? "notes" : plan.panel ? "inspector" : undefined;
  return (
    <Shell
      width={plan.window?.width ?? SHELL.width}
      height={SHELL.height}
      navWidth={plan.window?.nav ?? SHELL.nav}
      manuscript={prose}
      navCollapsed={plan.navCollapsed}
      nav={<Navigator project={PROJECT} sections={plan.nav ?? navSections(plan)} penName={PEN_NAME} />}
      tabs={<TabBand tabs={plan.tabs} />}
      contextBar={
        <ContextBar
          project={PROJECT}
          trail={plan.trail ?? TRAIL[plan.selected]}
          read={prose}
          add={prose ? "Scene" : plan.selected === "elias" ? "Entry" : undefined}
          panel={panelAction}
        />
      }
      main={plan.mainNode ?? main(plan)}
      panel={plan.panelNode ?? panel(plan)}
      status={
        plan.status !== undefined ? (
          plan.status
        ) : plan.selected === "scene" ? (
          <DocStatus words={plan.prose === "finishing" ? SCENE.words - 9 : plan.prose === "returning" ? SCENE.words + 17 : SCENE.words} state={plan.prose === "settled" ? "Saved" : "Saving…"} />
        ) : plan.selected === "ledger" || plan.selected === "elias" ? (
          <DocStatus words={plan.selected === "ledger" ? 214 : 168} state="Saved" />
        ) : null
      }
    />
  );
}

// ── The keyframes ──────────────────────────────────────────────────────────

const SCENE_TAB: TabSpec = { key: "scene", label: SCENE.title, active: true };
const tabs = (second?: string): TabSpec[] =>
  second ? [{ ...SCENE_TAB, active: false }, { key: "second", label: second, active: true }] : [SCENE_TAB];

/** The cursor at a readable size whatever the camera's scale: about 30px tall on screen. */
const CURSOR_SCREEN = 30;

const LAPSE = { width: 1260, nav: 400 } as const;

export const PLANS: Record<Exclude<KeyframeId, "brand">, Plan> = {
  // 01 — deep in the prose; almost no chrome.
  writing: { selected: "scene", growth: "draft", prose: "finishing", tabs: tabs(), camera: on(886, 360, 2.2) },
  // 02 — the camera drifting left: the navigator arrives, the prose still alive at the right.
  "toward-structure": { selected: "scene", growth: "draft", prose: "finishing", tabs: tabs(), camera: on(510, 284, 1.9) },
  // 03 — the time-lapse: structure growing on the left, writing rushing on the right.
  "the-book-grows": { selected: "timelapse", growth: "growing", window: LAPSE, tabs: [{ key: "t", label: "What the Ledger Kept", active: true }], camera: on(8, 46, 2.6, 0, 0) },
  // 04 — the lapse stops: the pointer has climbed back to Part I and chosen The Key Cabinet.
  "back-to-revise": {
    selected: "scene",
    growth: "full",
    prose: "settled",
    window: LAPSE,
    tabs: tabs(),
    camera: on(8, 46, 2.6, 0, 0),
    cursor: { x: 236, y: 236, pressed: true },
  },
  // 05 — stillness: the Scene, the caret resting; room on the right for what comes.
  "the-pause": { selected: "scene", growth: "full", prose: "settled", tabs: tabs(), camera: on(965, 352, 1.75), cursor: { x: 1330, y: 330 } },
  // 06 — Revision Notes beside the prose.
  "revision-notes": { selected: "scene", growth: "full", prose: "settled", panel: "notes", tabs: tabs(), camera: on(938, 372, 1.65), cursor: { x: 1418, y: 68 } },
  // 07 — the Inspector beside the whole Scene, settled on Research → 1998 Guest Ledger.
  inspector: {
    selected: "scene",
    growth: "full",
    prose: "settled",
    panel: "inspector-scene",
    panelScroll: 160,
    tabs: tabs(),
    camera: on(972, 392, 1.75),
    hoverLink: WORKSPACE.ledger.title,
    cursor: { x: 1402, y: 297, pressed: true },
  },
  // 08 — the reveal: the whole window, wordless.
  reveal: {
    selected: "ledger",
    growth: "full",
    panel: "inspector-ledger",
    tabs: tabs(WORKSPACE.ledger.title),
    camera: on(SHELL.width / 2, SHELL.height / 2, WIDE_S, FILM.width / 2, FILM.height / 2 + 6),
    cursor: { x: 1400, y: 402 },
  },
  // 09 — close on the ledger's body.
  "research-page": { selected: "ledger", growth: "full", tabs: tabs(WORKSPACE.ledger.title), camera: on(886, 400, 1.95) },
  // 10 — the Characters Board, pushed in: two lanes and the edge of a third, the pointer on Elias.
  collection: { selected: "characters", growth: "full", tabs: tabs(WORKSPACE.characters.title), camera: on(690, 486, 2.7), hoverCard: "Elias Vale", cursor: { x: 790, y: 372 } },
  // 11 — Elias's Entry: properties, then notes.
  entry: { selected: "elias", growth: "full", tabs: tabs(ELIAS.title), camera: on(886, 432, 1.85) },
  // 12 — the end of the camera's path through the Canvas: the Scene card, about to be clicked.
  canvas: {
    selected: "canvas",
    growth: "full",
    tabs: tabs(WORKSPACE.canvas.title),
    canvas: { tx: -852, ty: -132, scale: 1 },
    camera: on(680, 413, 2.53),
    cursor: { x: 830, y: 330 },
    hoverCard: "scene",
  },
  // 13 — back in the Scene, closer than the opening: the final lines and the sentence arriving.
  return: { selected: "scene", growth: "full", prose: "returning", navCollapsed: true, tabs: tabs(WORKSPACE.canvas.title).map((t) => ({ ...t, active: t.key === "scene" })), camera: on(760, 543, 2.45) },
};

export function Keyframe({ id, debug = false }: { id: KeyframeId; debug?: boolean }) {
  if (id === "brand") return <BrandFrame />;
  const plan = PLANS[id];
  const camera = debug ? on(0, 0, 1, 0, 0) : plan.camera;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <ScrollBlur />
      <Camera state={camera}>
        <Window width={plan.window?.width}>
          <ShellFor plan={plan} />
        </Window>
        {plan.cursor && <Cursor x={plan.cursor.x} y={plan.cursor.y} opacity={1} pressed={plan.cursor.pressed} size={CURSOR_SCREEN / 20 / camera.s} />}
      </Camera>
    </div>
  );
}

/** A light Sutura root, as a writer's appearance makes it, shaped as a window on the stage. */
export function Window({ width = SHELL.width, bare = false, children }: { width?: number; /** No edge shadow: a layer over another window (studies/layers.tsx). */ bare?: boolean; children: ReactNode }) {
  return (
    <div
      className="r2"
      data-theme="light"
      data-accent="blue"
      data-surface="theme"
      style={{
        position: "relative",
        width,
        height: SHELL.height,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: bare ? undefined : "0 0 0 1px rgba(var(--r2-palette-ink) / 0.10), 0 24px 70px rgba(0 0 0 / 0.42)",
      }}
    >
      {children}
    </div>
  );
}

/** A blur along the scroll only — the editor moving, not out of focus. */
export function ScrollBlur() {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      <filter id="pf-scroll-blur" x="0" y="-10%" width="100%" height="120%">
        <feGaussianBlur stdDeviation="0 5" />
      </filter>
    </svg>
  );
}

// ── 13 — The close ─────────────────────────────────────────────────────────

/** The approved wordmark, the line, the status and the address — on the stage, nothing else. */
export function BrandFrame() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Img src={staticFile(WORDMARK.onDark.replace(/^\//, ""))} style={{ width: 300, height: "auto" }} alt="Sutura" />
      <h1 style={{ marginTop: 64, fontFamily: "var(--r2-prose-font)", fontWeight: 400, color: "var(--r2-ink-1)", lineHeight: 1 }}>
        <span style={{ display: "block", fontSize: 76, letterSpacing: "-0.025em" }}>Write the book.</span>
        <span style={{ display: "block", marginTop: 18, fontSize: 40, fontStyle: "italic", letterSpacing: "-0.01em", color: "var(--r2-accent-ink)" }}>
          Build only what it asks for.
        </span>
      </h1>
      <p style={{ marginTop: 72, fontFamily: "var(--r2-font-ui)", fontSize: 22, fontWeight: 500, letterSpacing: "0.02em", color: "var(--r2-ink-2)" }}>
        Early Access<span style={{ margin: "0 0.4em" }}>·</span>Free
      </p>
      <p style={{ marginTop: 12, fontFamily: "var(--r2-font-ui)", fontSize: 21, letterSpacing: "0.02em", color: "var(--r2-ink-2)" }}>writesutura.com</p>
    </div>
  );
}
