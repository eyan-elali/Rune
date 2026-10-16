import type { CSSProperties, ReactNode } from "react";
import { FileText, File as PageIcon, FolderOpen, Frame as CanvasIcon, Layers, Library } from "lucide-react";
import { CanvasPage } from "../../ui/Canvas";
import { ManuscriptDoc } from "../../ui/Manuscript";
import type { NavRowSpec, NavSectionSpec } from "../../ui/Navigator";
import { DocStatus, type TabSpec } from "../../ui/Shell";
import { writingCss } from "../product-film/film/common";
import {
  CHAPTER_ONE,
  FLAT_A,
  FLAT_A_NEW,
  FLAT_A_PROSE,
  MANUSCRIPT_WORDS,
  PART_ONE,
  PART_ONE_CHAPTERS,
  PART_TWO,
  PART_TWO_CHAPTERS,
  DESTINATION,
  THOUGHT,
  THOUGHT_CARDS,
  THOUGHT_LINE,
  THOUGHT_LINES,
  UNPLACED,
  WORKSPACE,
  ZOOM,
  type Chapter,
} from "./content";
import { Answer, at, caretStyle, Frame, GRID, Label, LightWindow, ShellView, SLIDE, Statement, Wordmark, type ShellState } from "./kit";

// The six slides, pass 2 (CAROUSEL_CREATIVE_DIRECTION.md, and the principles
// in CAROUSEL_REFERENCE_RESEARCH.md). One system:
//   - every line of copy hangs from the same left margin (GRID.left);
//   - copy never sits on product chrome;
//   - one idea per slide, carried by one disproportionately large element;
//   - attention by ink, not by boxes: context recedes, it is never deleted;
//   - the book is Equal Temperament (content.ts), not the film's.

// ── Navigator states ───────────────────────────────────────────────────────

const chapterRows = (list: Chapter[], o: { selected?: string; open?: (c: Chapter) => boolean } = {}): NavRowSpec[] =>
  list.flatMap((c) => {
    const open = c.scenes ? (o.open ? o.open(c) : true) : undefined;
    return [
      { id: c.id, title: c.title, icon: FileText, depth: 2, open, selected: o.selected === c.id } as NavRowSpec,
      ...(open && c.scenes ? c.scenes.map((s) => ({ id: s.id, title: s.title, depth: 3, selected: o.selected === s.id }) as NavRowSpec) : []),
    ];
  });

const workspaceRows = (selected?: string): NavRowSpec[] => [
  { id: WORKSPACE.characters.id, title: WORKSPACE.characters.title, icon: Library, depth: 1 },
  { id: WORKSPACE.research.id, title: WORKSPACE.research.title, icon: FolderOpen, depth: 1, open: true },
  { id: WORKSPACE.pitch.id, title: WORKSPACE.pitch.title, icon: PageIcon, depth: 2, selected: selected === WORKSPACE.pitch.id },
  { id: WORKSPACE.temperament.id, title: WORKSPACE.temperament.title, icon: PageIcon, depth: 2 },
  { id: WORKSPACE.aphasia.id, title: WORKSPACE.aphasia.title, icon: PageIcon, depth: 2 },
  { id: WORKSPACE.canvas.id, title: WORKSPACE.canvas.title, icon: CanvasIcon, depth: 1 },
];

const unplaced = (open: boolean): NavSectionSpec => ({
  id: "unplaced",
  label: "Unplaced Scenes",
  count: UNPLACED.reduce((n, u) => n + u.words, 0),
  open,
  rows: UNPLACED.map((u) => ({ id: u.id, title: u.title, depth: 1, muted: true })),
});

/** Slide 3: the finished first draft, everything open — the book's whole weight. */
function draftNav(): NavSectionSpec[] {
  return [
    {
      id: "manuscript",
      label: "Manuscript",
      count: MANUSCRIPT_WORDS,
      open: true,
      rows: [
        { id: PART_ONE.id, title: PART_ONE.title, icon: Layers, depth: 1, open: true, emphasis: true },
        ...chapterRows(PART_ONE_CHAPTERS),
        { id: PART_TWO.id, title: PART_TWO.title, icon: Layers, depth: 1, open: true, emphasis: true },
        ...chapterRows(PART_TWO_CHAPTERS, { selected: "c-equal" }),
      ],
    },
    unplaced(false),
    { id: "workspace", label: "Workspace", open: true, rows: workspaceRows() },
  ];
}

/** Slide 4: revising Part Two — Part One folded, The Flat A open, and the Workspace that grew. */
function revisingNav(): NavSectionSpec[] {
  return [
    {
      id: "manuscript",
      label: "Manuscript",
      count: MANUSCRIPT_WORDS,
      open: true,
      rows: [
        { id: PART_ONE.id, title: PART_ONE.title, icon: Layers, depth: 1, open: false, emphasis: true },
        { id: PART_TWO.id, title: PART_TWO.title, icon: Layers, depth: 1, open: true, emphasis: true },
        ...chapterRows(PART_TWO_CHAPTERS, { selected: FLAT_A.id }),
      ],
    },
    unplaced(false),
    { id: "workspace", label: "Workspace", open: true, rows: workspaceRows() },
  ];
}

// ── The new Project ────────────────────────────────────────────────────────
// Exactly what create_project_checked makes (migration 021): the Project, its
// Manuscript and "Chapter 1". The Workspace is folded, as the navigator keeps
// it while it is empty — no first-use text in sight.

const CH1_WORDS = [...CHAPTER_ONE.paragraphs, CHAPTER_ONE.open + CHAPTER_ONE.typed].join(" ").split(/\s+/).length;

function newProjectNav(): NavSectionSpec[] {
  return [
    { id: "manuscript", label: "Manuscript", count: CH1_WORDS, open: true, rows: [{ id: "ch-1", title: CHAPTER_ONE.title, icon: FileText, depth: 1, selected: true }] },
    { id: "workspace", label: "Workspace", open: false, rows: [] },
  ];
}

function chapterOne(o: { width: number; height: number; nav: boolean; scope?: string; writing?: boolean }): ShellState {
  return {
    width: o.width,
    height: o.height,
    nav: o.nav ? newProjectNav() : undefined,
    navCollapsed: !o.nav,
    tabs: [{ key: "c1", label: CHAPTER_ONE.title, active: true }],
    trail: ["Manuscript", CHAPTER_ONE.title],
    manuscript: true,
    add: "Scene",
    main: <ManuscriptDoc title={CHAPTER_ONE.title} paragraphs={CHAPTER_ONE.paragraphs} openLine={CHAPTER_ONE.open} typed={CHAPTER_ONE.typed} caret={1} />,
    status: <DocStatus words={CH1_WORDS} state="Saved" />,
    scope: o.scope,
    css: o.writing && o.scope ? writingCss(o.scope, 1).replaceAll("data-pf", "data-cs") : undefined,
  };
}

// ── The Flat A ─────────────────────────────────────────────────────────────

/** The Scene's writing surface. `ink` dims everything but the new sentence (the film's ink step). */
function FlatA({ withNew = false, ink = 1, head = true, from = 0 }: { withNew?: boolean; ink?: number; head?: boolean; from?: number }) {
  const dim: CSSProperties | undefined = ink < 1 ? { opacity: ink } : undefined;
  return (
    <div className="r2-writing">
      <article className="r2-doc r2-doc--manuscript">
        {head && (
          <header className="r2-doc-head">
            <p className="r2-doc-eyebrow">{FLAT_A.chapter}</p>
            <h1 className="r2-doc-title">
              <span className="r2-doc-title-text">{FLAT_A.title}</span>
            </h1>
          </header>
        )}
        <div className="r2-scenes">
          <section className="r2-scene">
            <div className="r2-prose">
              <div className="ProseMirror tiptap">
                {FLAT_A_PROSE.slice(from).map((p, i) => (
                  <p key={i} style={dim}>
                    {p}
                  </p>
                ))}
                {withNew && (
                  <p>
                    {FLAT_A_NEW}
                    <span style={caretStyle} />
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}

const flatTab: TabSpec = { key: "flat", label: FLAT_A.title, active: true };
const TRAIL = ["Manuscript", PART_TWO.title, FLAT_A.chapter, FLAT_A.title];

// ── Stage pieces ───────────────────────────────────────────────────────────

const abs = (x: number, y: number, w?: number): CSSProperties => ({ position: "absolute", left: x, top: y, width: w });

function Copy({ x = GRID.left, y, w = SLIDE.width - GRID.left - GRID.right, children }: { x?: number; y: number; w?: number; children: ReactNode }) {
  return <div style={abs(x, y, w)}>{children}</div>;
}

/** The window's corner on the shared margin — slides 1 and 4 use the same one, at the same scale. */
const CORNER = { x: GRID.left, s: 1.6 } as const;
const cornerShadow: CSSProperties = { boxShadow: "0 0 0 1px rgba(255 255 255 / 0.06), 0 30px 90px rgba(0 0 0 / 0.5)" };

// ── 1 · The thesis ─────────────────────────────────────────────────────────
// The cover. The statement large on the stage; below it the corner of a
// window on the shared margin: Equal Temperament on its first day — a
// Manuscript, Chapter 1, its first lines, a Workspace with nothing in it.

export function Slide1() {
  const W = Math.round((SLIDE.width - CORNER.x) / CORNER.s);
  const H = 760;
  const top = 672;
  return (
    <>
      <Copy y={GRID.top}>
        <Wordmark width={150} />
      </Copy>
      <Copy y={258}>
        <Statement size={124}>Write the book.</Statement>
        <Answer size={60} style={{ marginTop: 18 }}>
          Build only what it asks for.
        </Answer>
      </Copy>
      <Frame clip={{ x: CORNER.x, y: top, w: SLIDE.width - CORNER.x, h: SLIDE.height - top, radius: "14px 0 0 0" }} camera={at(0, 0, CORNER.s)} style={cornerShadow}>
        <LightWindow width={W} height={H} radius={0} shadow={false}>
          <ShellView s={chapterOne({ width: W, height: H, nav: true })} />
        </LightWindow>
      </Frame>
    </>
  );
}

// ── 2 · The manuscript ─────────────────────────────────────────────────────
// Close, and one image: the slide is the page. Chapter 1, the novel's first
// lines at reading size, the caret still in them — and the statement set at
// the foot of the same page, on the same margin as the prose, as if it were
// the page's last word. No band, no split.

export function Slide2() {
  const s = 2.16;
  const W = 480;
  const H = 640;
  const gutter = 28; // the app's narrow-container gutter (rune2.css, ≤ 640px)
  const camX = gutter - GRID.left / s;
  return (
    <div className="r2" data-theme="light" data-accent="blue" data-surface="theme" style={{ position: "absolute", inset: 0, background: "var(--r2-ms-bg)" }}>
      <Frame clip={{ x: 0, y: 0, w: SLIDE.width, h: 930 }} camera={at(camX, 104, s)}>
        <LightWindow width={W} height={H} radius={0} shadow={false}>
          <ShellView s={chapterOne({ width: W, height: H, nav: false, scope: "s2", writing: true })} />
        </LightWindow>
      </Frame>
      <Copy y={1022}>
        <Statement size={74}>Sutura starts with the manuscript.</Statement>
        <Answer size={48} style={{ marginTop: 16 }}>
          Open the draft. Start writing.
        </Answer>
      </Copy>
    </div>
  );
}

// ── 3 · The book grows ─────────────────────────────────────────────────────
// Medium. The navigator alone, tall, at reading size: weight through
// accumulation — two Parts, nine Chapters, Scenes inside them, 58,420 words,
// writing set aside, a Workspace beginning — running on past the frame.

export function Slide3() {
  const s = 1.96;
  const navW = 252;
  const H = SLIDE.height / s + 300;
  const shell: ShellState = {
    width: 1100,
    height: H,
    nav: draftNav(),
    tabs: [{ key: "t", label: "Equal Temperament", active: true }],
    trail: ["Manuscript", PART_TWO.title, "Equal Temperament"],
    manuscript: true,
    main: null,
  };
  const x = SLIDE.width - navW * s;
  return (
    <>
      <Copy y={GRID.top + 4} w={x - GRID.left - 40}>
        <Statement size={80}>Then the book gets bigger.</Statement>
        <Answer size={44} style={{ marginTop: 36, lineHeight: 1.3 }}>
          Scenes.
          <br />
          Characters.
          <br />
          Research.
          <br />
          Questions.
          <br />
          Connections.
        </Answer>
      </Copy>
      <Frame clip={{ x, y: 0, w: navW * s, h: SLIDE.height }} camera={at(0, 4, s)} style={{ boxShadow: "-30px 0 80px rgba(0 0 0 / 0.35)" }}>
        <LightWindow width={1100} height={H} radius={0} shadow={false}>
          <ShellView s={shell} />
        </LightWindow>
      </Frame>
    </>
  );
}

// ── 4 · The workspace grows around the writing ─────────────────────────────
// The cover's frame, later. The same corner on the same margin at the same
// scale as slide 1 — so the eye compares. Then: one Chapter, a folded empty
// Workspace, one tab. Now: the Scene being revised at the centre, the book's
// Parts above it in the navigator, the Workspace that grew beneath it
// (Characters, three Research Pages, a Canvas), and the working set across
// the top. Nothing was added that the book didn't ask for.

export function Slide4() {
  const W = Math.round((SLIDE.width - CORNER.x) / CORNER.s);
  const top = 410;
  const H = Math.ceil((SLIDE.height - top) / CORNER.s) + 140;
  const shell: ShellState = {
    width: W,
    height: H,
    nav: revisingNav(),
    tabs: [flatTab, { key: "rui", label: "Rui Carvalho" }, { key: "pitch", label: WORKSPACE.pitch.title }, { key: "canvas", label: WORKSPACE.canvas.title }],
    trail: TRAIL,
    manuscript: true,
    add: "Scene",
    main: <FlatA />,
    status: <DocStatus words={FLAT_A.words} state="Saved" />,
  };
  return (
    <>
      <Copy y={GRID.top + 4}>
        <Statement size={76}>So the workspace grows around the writing.</Statement>
        <Answer size={46} style={{ marginTop: 22 }}>
          Only when the story asks for it.
        </Answer>
      </Copy>
      <Frame clip={{ x: CORNER.x, y: top, w: SLIDE.width - CORNER.x, h: SLIDE.height - top, radius: "14px 0 0 0" }} camera={at(0, 0, CORNER.s)} style={cornerShadow}>
        <LightWindow width={W} height={H} radius={0} shadow={false}>
          <ShellView s={shell} />
        </LightWindow>
      </Frame>
    </>
  );
}

// ── 5 · Thinking through the book ──────────────────────────────────────────
// Inside the Canvas "Rui’s piano", full bleed, at 190%: one area of a larger
// board, cut by the slide's edges. One thought in full ink, found rather than
// diagrammed — a small question, its evidence, the man, a decision given
// room, and the Scene it returns to, selected. No edge labels; only the last
// connection carries an arrow. The rest of the board recedes at the edges.

export function Slide5() {
  const sel = (i: number) => `[data-cs="s5"] .r2-canvas-world > .r2-canvas-card:nth-child(${1 + i + 1})`;
  const recede = THOUGHT_CARDS.map((c, i) => (THOUGHT.has(c.id) ? "" : `${sel(i)} { opacity: 0.36; }`)).join("\n");
  const lines = THOUGHT_LINES.map((_, i) =>
    THOUGHT_LINE.has(i)
      ? `[data-cs="s5"] .r2-canvas-line:nth-of-type(${i + 1}) .r2-canvas-line-stroke { stroke: color-mix(in srgb, rgb(var(--r2-palette-ink)) 58%, transparent) !important; }`
      : `[data-cs="s5"] .r2-canvas-line:nth-of-type(${i + 1}) { opacity: 0.5; }`
  ).join("\n");
  const css = `
    [data-cs="s5"] .r2-canvas-ui { display: none; }
    ${recede}
    ${lines}
  `;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <LightWindow width={SLIDE.width} height={SLIDE.height} radius={0} shadow={false}>
        <div data-cs="s5" style={{ position: "absolute", inset: 0 }}>
          <style>{css}</style>
          <CanvasPage title={WORKSPACE.canvas.title} sections={[]} cards={THOUGHT_CARDS} lines={THOUGHT_LINES} vp={{ tx: 0, ty: 0, scale: ZOOM }} selected={DESTINATION} />
        </div>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <Copy y={GRID.top}>
            <Statement size={84}>Follow the thought.</Statement>
          </Copy>
          <Copy y={1196}>
            <Answer size={68} style={{ lineHeight: 1.06 }}>
              Get back to the sentence.
            </Answer>
          </Copy>
        </div>
      </LightWindow>
    </div>
  );
}

// ── 6 · The close ──────────────────────────────────────────────────────────
// Resolved. The sentence the thinking was for — "She left his A where it
// was…" — in full ink on a fragment of The Flat A, the paragraphs before it
// dimmed; then the line, the mark, the address.

export function Slide6() {
  const w = SLIDE.width - GRID.left;
  const s = 1.9;
  const W = Math.ceil(w / s);
  const H = 900;
  const top = 150;
  const h = 380;
  const shell: ShellState = {
    width: W,
    height: H,
    navCollapsed: true,
    tabs: [flatTab],
    trail: TRAIL,
    manuscript: true,
    main: <FlatA withNew ink={0.4} head={false} from={2} />,
    scope: "s6",
    css: writingCss("s6", 1).replaceAll("data-pf", "data-cs"),
  };
  return (
    <>
      <Frame clip={{ x: GRID.left, y: top, w, h, radius: "12px 0 0 12px" }} camera={at(0, 116, s)} style={cornerShadow}>
        <LightWindow width={W} height={H} radius={0} shadow={false}>
          <ShellView s={shell} />
        </LightWindow>
      </Frame>
      <Copy y={top + h + 112}>
        <Statement size={80}>A writing workspace built around the book.</Statement>
      </Copy>
      <Copy y={1066}>
        <Wordmark width={156} />
        <Label size={30} style={{ marginTop: 30, color: "var(--r2-ink-1)" }}>
          Early Access is open
        </Label>
        <Label size={30} style={{ marginTop: 8, fontWeight: 400, color: "var(--r2-ink-1)", opacity: 0.86 }}>
          writesutura.com
        </Label>
      </Copy>
    </>
  );
}

export const SLIDES = [
  { n: 1, id: "thesis", title: "The thesis", tone: "dark", Slide: Slide1 },
  { n: 2, id: "manuscript", title: "The manuscript", tone: "light", Slide: Slide2 },
  { n: 3, id: "book-grows", title: "The book grows", tone: "dark", Slide: Slide3 },
  { n: 4, id: "workspace", title: "The workspace grows around it", tone: "dark", Slide: Slide4 },
  { n: 5, id: "thinking", title: "Thinking through the book", tone: "light", Slide: Slide5 },
  { n: 6, id: "close", title: "The close", tone: "dark", Slide: Slide6 },
] as const;
