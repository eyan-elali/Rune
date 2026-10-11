"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, ChevronRight, FileText, Layers, PanelLeft } from "lucide-react";
import { ICON, ICON_SM_BOLD } from "@/components/rune2/icons";

// Section 2's proof (FrontManuscript): the Project shell with a manuscript
// open, demonstrating itself. One short loop, about ten seconds, muted, with
// nothing to press: the writer types, turns to the navigator, sets a Scene
// aside, makes a Chapter, places the Scene in it, and goes back to writing.
// Write → structure when needed → return to writing.
//
// The shell is drawn with the real navigator rows, tabs and title classes
// from rune2.css, and its states are the product's own: the dragged row
// dims (data-dragging), the landing is the accent hairline (data-drop=
// "before") or the Chapter's wash (data-drop="inside"), a new Chapter arrives
// as "Chapter 4" in the rename field with its name selected, and a Chapter
// with one Scene shows no Scene row (lib/rune2/navigatorModel.ts,
// chapterShowsScenes). Nothing here is the live navigator or editor: the
// state is a small fixed model of one fictional manuscript, and nothing is
// read from or written to the product.
//
// Motion is kept to what the actions need. Rows that make room or close a
// gap move by a FLIP transform; a new row fades in; the lifted Scene is a
// copy of its row carried from where it was to where it lands; the editor
// recedes a little while the navigator is the point, and comes back. Typing
// writes straight into two spans (the prose and the Chapter's name) so the
// tree is not re-rendered per character. The loop closes on a crossfade to
// a second, static copy of the opening frame, under which the playing frame
// resets unseen.
//
// Under reduced motion, on a phone, or without JavaScript, the opening frame
// stands still. Offscreen (and in a hidden tab) the loop stops and resets, so
// it costs nothing and comes back from the top.

// ── The manuscript ──────────────────────────────────────────────────────

const BASE_PAD = 6;
const INDENT = 16;
const ICONLESS_INSET = 19;

export const DEMO_PROJECT = "The Lantern Road";
const SCENE_ID = "boat";
const SCENE = "The Thursday Boat";
const LETTERS = "The Letters";
const NEW_CHAPTER = "The Crossing";
const NEW_CHAPTER_DEFAULT = "Chapter 4";
const SCENE_WORDS = 1412;
const MANUSCRIPT_WORDS = 41208;
const UNPLACED_WORDS = 2340;

const PROSE = [
  "The letters came on the Thursday boat, three of them, tied with the grey string her mother had always used. Ada did not open them at the harbour. She carried them up the hill the way one carries something that might still be warm.",
  "By the time she reached the house the wind had turned. She set the letters on the table beside the lamp and left them there while she made tea, as if the ordinary tasks could be made to go first.",
  "The first was dated in March, which meant it had waited somewhere for the better part of a season. She read it standing, and then again sitting down, and the second reading was the one that counted.",
  "Outside, the ferry gave its long note and turned for the mainland,",
];
const TYPED_FIRST = " and the house was quiet";
const TYPED_LAST = " in the particular way of a house";

type Scene = { id: string; title: string; muted?: boolean };
type Chapter = { id: string; title: string; scenes: Scene[]; open: boolean; renaming?: boolean };
type Group = { id: string; title: string; chapters: Chapter[]; open: boolean };

type DemoState = {
  groups: Group[];
  unplaced: Scene[];
  /** The selected row: the open Scene, or the Chapter standing for its only Scene. */
  selected: string;
  /** Whose moment it is: the editor's, or the navigator's. */
  focus: "editor" | "nav";
  /** The Scene being carried: its row dims where it was. */
  dragging: string | null;
  /** Where it will land, in the product's terms. */
  drop: { id: string; side: "before" | "inside" } | null;
  /** The carried copy of the row, in the tree's coordinates. */
  ghost: { title: string; top: number; pad: number; dy: number; ms: number; stage: "rest" | "lift" | "travel" | "drop" } | null;
  /** The Chapter the open Scene belongs to, as the tab, breadcrumb and title say it. */
  chapter: string;
  chapterFading: boolean;
  /** The second, static opening frame fading in over this one. */
  seam: boolean;
};

const BOAT: Scene = { id: SCENE_ID, title: SCENE };

const INITIAL: DemoState = {
  groups: [
    {
      id: "p1",
      title: "Part One",
      open: true,
      chapters: [
        { id: "harbour", title: "The Harbour", scenes: [{ id: "h1", title: "" }, { id: "h2", title: "" }], open: false },
        {
          id: "letters",
          title: LETTERS,
          open: true,
          scenes: [{ id: "ferry", title: "The Ferry" }, BOAT, { id: "high", title: "High Water" }],
        },
        { id: "quiet", title: "A Quiet House", scenes: [{ id: "q1", title: "" }, { id: "q2", title: "" }], open: false },
      ],
    },
    { id: "p2", title: "Part Two", open: false, chapters: [] },
  ],
  unplaced: [
    { id: "old", title: "The old argument" },
    { id: "untitled", title: "Untitled scene", muted: true },
  ],
  selected: SCENE_ID,
  focus: "editor",
  dragging: null,
  drop: null,
  ghost: null,
  chapter: LETTERS,
  chapterFading: false,
  seam: false,
};

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

function pad(depth: number, iconless = false) {
  return BASE_PAD + depth * INDENT + (iconless ? ICONLESS_INSET : 0);
}

// ── The frame ───────────────────────────────────────────────────────────

function Disclosure({ open }: { open?: boolean }) {
  if (open === undefined) return <span className="r2-disclosure" />;
  return (
    <span className="r2-disclosure" data-open={open || undefined}>
      <ChevronRight {...ICON_SM_BOLD} />
    </span>
  );
}

function Row({
  id,
  depth,
  title,
  icon: Icon,
  open,
  selected,
  emphasis,
  muted,
  dragging,
  drop,
  renaming,
}: {
  id: string;
  depth: number;
  title: string;
  icon?: typeof Layers;
  open?: boolean;
  selected?: boolean;
  emphasis?: boolean;
  muted?: boolean;
  dragging?: boolean;
  drop?: "before" | "inside";
  renaming?: boolean;
}) {
  const left = pad(depth, !Icon);
  return (
    <div
      className="r2-row"
      data-row-id={id}
      data-selected={selected || undefined}
      data-emphasis={emphasis || undefined}
      data-muted={muted || undefined}
      data-dragging={dragging || undefined}
      data-drop={drop}
      data-renaming={renaming || undefined}
      style={{ paddingLeft: left, "--r2-drop-inset": `${left}px` } as CSSProperties}
    >
      <Disclosure open={open} />
      {Icon && <Icon className="r2-row-icon" {...ICON} />}
      {renaming ? (
        // The product's rename field (ProjectNavigator: RenameInput), drawn:
        // the given name selected, so the first keystroke replaces it.
        <span className="r2-row-input r2-lp-demo-input">
          <span className="r2-lp-demo-sel" data-type="chapter-default">
            {NEW_CHAPTER_DEFAULT}
          </span>
          <span data-type="chapter" />
          <span className="r2-lp-caret r2-lp-caret--field" />
        </span>
      ) : (
        <span className="r2-row-main">
          <span className="r2-row-label">{title}</span>
        </span>
      )}
    </div>
  );
}

function Tree({ state }: { state: DemoState }) {
  const { groups, unplaced, selected, dragging, drop, ghost } = state;
  const inUnplaced = unplaced.some((s) => s.id === SCENE_ID);
  const manuscriptWords = MANUSCRIPT_WORDS - (inUnplaced ? SCENE_WORDS : 0);
  const unplacedWords = UNPLACED_WORDS + (inUnplaced ? SCENE_WORDS : 0);
  const rowProps = (id: string) => ({
    id,
    selected: selected === id,
    dragging: dragging === id,
    drop: drop?.id === id ? drop.side : undefined,
  });
  return (
    <div className="r2-lp-shot-tree" data-tree>
      <ul>
        <li className="r2-lp-shot-section">
          <div className="r2-row r2-row--root" style={{ paddingLeft: BASE_PAD }}>
            <Disclosure open />
            <span className="r2-row-main">
              <span className="r2-row-label">Manuscript</span>
            </span>
            <span className="r2-row-count">{formatCount(manuscriptWords)}</span>
          </div>
          <ul>
            {groups.map((g) => (
              <li key={g.id}>
                <Row {...rowProps(g.id)} depth={1} title={g.title} icon={Layers} open={g.open} emphasis />
                {g.open && (
                  <ul>
                    {g.chapters.map((c) => {
                      // A Chapter's only Scene stays out of sight (chapterShowsScenes).
                      const shows = c.scenes.length > 1;
                      return (
                        <li key={c.id}>
                          <Row
                            {...rowProps(c.id)}
                            depth={2}
                            title={c.title}
                            icon={FileText}
                            open={shows ? c.open : undefined}
                            renaming={c.renaming}
                          />
                          {shows && c.open && (
                            <ul>
                              {c.scenes.map((s) => (
                                <li key={s.id}>
                                  <Row {...rowProps(s.id)} depth={3} title={s.title} muted={s.muted} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </li>
        <li className="r2-lp-shot-section">
          <div className="r2-row r2-row--root" data-row-id="unplaced" style={{ paddingLeft: BASE_PAD }}>
            <Disclosure open />
            <span className="r2-row-main">
              <span className="r2-row-label">Unplaced Scenes</span>
            </span>
            <span className="r2-row-count">{formatCount(unplacedWords)}</span>
          </div>
          <ul>
            {unplaced.map((s) => (
              <li key={s.id}>
                <Row {...rowProps(s.id)} depth={1} title={s.title} muted={s.muted} />
              </li>
            ))}
          </ul>
        </li>
      </ul>
      {ghost && (
        <div
          className="r2-row r2-lp-ghost"
          data-ghost={ghost.stage}
          style={
            {
              top: ghost.top,
              paddingLeft: ghost.pad,
              "--lp-ghost-dy": `${ghost.dy}px`,
              "--lp-ghost-ms": `${ghost.ms}ms`,
            } as CSSProperties
          }
        >
          <span className="r2-disclosure" />
          <span className="r2-row-main">
            <span className="r2-row-label">{ghost.title}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function Frame({ state }: { state: DemoState }) {
  const { chapter, chapterFading } = state;
  return (
    <div className="r2-lp-shot-in">
      <div className="r2-lp-shot-nav">
        <div className="r2-nav-header">
          <span className="r2-nav-project">
            <span className="r2-nav-project-title">{DEMO_PROJECT}</span>
            <ChevronDown {...ICON_SM_BOLD} />
          </span>
        </div>
        <Tree state={state} />
      </div>
      <div className="r2-lp-shot-content">
        <div className="r2-tabs">
          <span className="r2-icon-button r2-tabs-nav-toggle">
            <PanelLeft {...ICON} />
          </span>
          <ul>
            <li className="r2-tab" data-active>
              <span className="r2-tab-main">
                <span className="r2-tab-context r2-lp-demo-chapter" data-fading={chapterFading || undefined}>
                  {chapter} ·
                </span>
                <span className="r2-tab-label">{SCENE}</span>
              </span>
            </li>
          </ul>
        </div>
        <div className="r2-lp-shot-crumbs">
          <span className="r2-crumb-project">{DEMO_PROJECT}</span>
          <span>Part One</span>
          <span className="r2-crumb-sep">/</span>
          <span className="r2-lp-demo-chapter" data-fading={chapterFading || undefined}>
            {chapter}
          </span>
          <span className="r2-crumb-sep">/</span>
          <span className="r2-crumb-current">{SCENE}</span>
        </div>
        <div className="r2-lp-shot-doc">
          <div className="r2-doc-head">
            <p className="r2-doc-eyebrow r2-lp-demo-chapter" data-fading={chapterFading || undefined}>
              {chapter}
            </p>
            <p className="r2-doc-title">{SCENE}</p>
          </div>
          <div className="r2-lp-shot-prose">
            {PROSE.map((p, i) =>
              i < PROSE.length - 1 ? (
                <p key={p.slice(0, 24)}>{p}</p>
              ) : (
                <p key={p.slice(0, 24)}>
                  {p}
                  <span data-type="prose" />
                  <span className="r2-lp-caret" />
                </p>
              )
            )}
          </div>
        </div>
      </div>
      <div className="r2-lp-shot-status">
        <span data-type="count">{formatCount(SCENE_WORDS)}</span> words <span className="r2-lp-shot-status-sep">·</span>{" "}
        <span data-type="save">Saved</span>
      </div>
    </div>
  );
}

// ── The loop ────────────────────────────────────────────────────────────

type SetState = Dispatch<SetStateAction<DemoState>>;

/** Timers for one run of the loop, all cancelled together. */
class Run {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private dead = false;
  at(ms: number, fn: () => void) {
    if (this.dead) return;
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.dead) fn();
    }, ms);
    this.timers.add(t);
  }
  cancel() {
    this.dead = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}

/** A person's typing: unhurried, uneven, a breath after a word. */
function keyDelay(ch: string) {
  const base = ch === " " ? 95 : ch === "," ? 140 : 58;
  return base + Math.random() * 48;
}

/**
 * Types `text` into the element `el` finds, one character at a time (it is
 * looked up per keystroke: the Chapter's field exists only once its row
 * does); `onChar` per character; `onDone` after the last. Returns when it ends.
 */
function typeInto(run: Run, from: number, el: () => HTMLElement | null, text: string, onChar?: (ch: string) => void, onDone?: () => void) {
  let t = from;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    t += keyDelay(ch);
    run.at(t, () => {
      const target = el();
      if (target) target.textContent += ch;
      onChar?.(ch);
    });
  }
  run.at(t + 40, () => onDone?.());
  return t + 40;
}

function moveScene(state: DemoState, to: "unplaced" | "crossing"): DemoState {
  const groups = state.groups.map((g) => ({
    ...g,
    chapters: g.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.filter((s) => s.id !== SCENE_ID).concat(to === "crossing" && c.id === "crossing" ? [BOAT] : []),
    })),
  }));
  const unplaced = state.unplaced.filter((s) => s.id !== SCENE_ID);
  return {
    ...state,
    groups,
    unplaced: to === "unplaced" ? [BOAT, ...unplaced] : unplaced,
    // Inside its new Chapter the Scene is the Chapter's only one: the Chapter stands for it.
    selected: to === "crossing" ? "crossing" : SCENE_ID,
  };
}

function addChapter(state: DemoState, renaming: boolean, title: string): DemoState {
  return {
    ...state,
    groups: state.groups.map((g) =>
      g.id !== "p1"
        ? g
        : {
            ...g,
            chapters: g.chapters.some((c) => c.id === "crossing")
              ? g.chapters.map((c) => (c.id === "crossing" ? { ...c, renaming, title } : c))
              : [...g.chapters, { id: "crossing", title, scenes: [], open: false, renaming }],
          }
    ),
  };
}

/**
 * One pass of the loop, scheduled against `run`. `root` is the playing frame;
 * `skipFlip` marks the next commit as one whose rows should not slide (the
 * dropped Scene appears where its ghost stopped; the reset happens under
 * the seam). Returns the loop's length.
 */
function schedule(run: Run, root: HTMLElement, set: SetState, skipFlip: { id: string | null; all: boolean }) {
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const tree = () => q<HTMLElement>("[data-tree]");
  const rowTop = (id: string) => {
    const t = tree();
    const r = q<HTMLElement>(`[data-row-id="${id}"]`);
    return t && r ? r.getBoundingClientRect().top - t.getBoundingClientRect().top : 0;
  };
  const rowPad = (id: string) => parseFloat(q<HTMLElement>(`[data-row-id="${id}"]`)?.style.paddingLeft || "0");
  const typing = (on: boolean) => {
    if (on) root.setAttribute("data-typing", "");
    else root.removeAttribute("data-typing");
  };
  const status = (save: string) => {
    const el = q<HTMLElement>('[data-type="save"]');
    if (el) el.textContent = save;
  };
  let words = SCENE_WORDS;
  const countWord = (ch: string) => {
    if (ch !== " ") return;
    words += 1;
    const el = q<HTMLElement>('[data-type="count"]');
    if (el) el.textContent = formatCount(words);
  };
  const prose = () => q<HTMLElement>('[data-type="prose"]');

  // A drag: lift the row's copy, carry it to `destTop`, show the landing, drop.
  const drag = (from: number, dest: () => number, landing: DemoState["drop"], travelMs: number, commit: (s: DemoState) => DemoState) => {
    run.at(from, () => {
      const top = rowTop(SCENE_ID);
      const left = rowPad(SCENE_ID);
      set((s) => ({ ...s, dragging: SCENE_ID, ghost: { title: SCENE, top, pad: left, dy: 0, ms: travelMs, stage: "rest" } }));
    });
    run.at(from + 30, () => set((s) => (s.ghost ? { ...s, ghost: { ...s.ghost, stage: "lift" } } : s)));
    run.at(from + 260, () => {
      const dy = dest() - rowTop(SCENE_ID);
      set((s) => (s.ghost ? { ...s, ghost: { ...s.ghost, dy, stage: "travel" } } : s));
    });
    run.at(from + 260 + travelMs * 0.55, () => set((s) => ({ ...s, drop: landing })));
    const arrive = from + 260 + travelMs;
    // Into a Chapter, the row is taken as it arrives, so the two names never sit on each other.
    if (landing?.side === "inside") run.at(arrive - 140, () => set((s) => (s.ghost ? { ...s, ghost: { ...s.ghost, stage: "drop" } } : s)));
    const dropAt = arrive + 100;
    run.at(dropAt, () => {
      skipFlip.id = SCENE_ID;
      set((s) => ({ ...commit(s), dragging: null, drop: null, ghost: s.ghost ? { ...s.ghost, stage: "drop" } : null }));
    });
    run.at(dropAt + 220, () => set((s) => ({ ...s, ghost: null })));
    return dropAt;
  };

  // ── 1. Writing ──────────────────────────────────────────────────────
  run.at(200, () => {
    typing(true);
    status("Saving…");
  });
  const t1 = typeInto(run, 200, prose, TYPED_FIRST, countWord, () => typing(false));
  run.at(t1 + 260, () => status("Saved"));

  // ── 2. The navigator comes forward ──────────────────────────────────
  const t2 = t1 + 420;
  run.at(t2, () => set((s) => ({ ...s, focus: "nav" })));

  // ── 3. The Scene is set aside: carried down to Unplaced Scenes, before "The old argument" ──
  const t3 = drag(t2 + 480, () => rowTop("old"), { id: "old", side: "before" }, 820, (s) => moveScene(s, "unplaced"));

  // ── 4. A new Chapter at the end of Part One, named in place ─────────
  const t4 = t3 + 620;
  run.at(t4, () => set((s) => addChapter(s, true, NEW_CHAPTER_DEFAULT)));
  run.at(t4 + 420, () => {
    const sel = q<HTMLElement>('[data-type="chapter-default"]');
    if (sel) sel.textContent = "";
    typing(true);
  });
  const t4b = typeInto(run, t4 + 420, () => q<HTMLElement>('[data-type="chapter"]'), NEW_CHAPTER, undefined, () => typing(false));
  run.at(t4b + 300, () => set((s) => addChapter(s, false, NEW_CHAPTER)));

  // ── 5. The Scene placed in the new Chapter ──────────────────────────
  const t5 = drag(t4b + 760, () => rowTop("crossing"), { id: "crossing", side: "inside" }, 620, (s) => moveScene(s, "crossing"));
  run.at(t5 + 60, () => set((s) => ({ ...s, chapterFading: true })));
  run.at(t5 + 300, () => set((s) => ({ ...s, chapter: NEW_CHAPTER, chapterFading: false })));

  // ── 6. Back to the book ─────────────────────────────────────────────
  const t6 = t5 + 620;
  run.at(t6, () => set((s) => ({ ...s, focus: "editor" })));
  run.at(t6 + 420, () => {
    typing(true);
    status("Saving…");
  });
  const t6b = typeInto(run, t6 + 420, prose, TYPED_LAST, countWord, () => typing(false));
  run.at(t6b + 240, () => status("Saved"));

  // ── The seam: the opening frame returns over this one ───────────────
  const t7 = t6b + 560;
  run.at(t7, () => set((s) => ({ ...s, seam: true })));
  const end = t7 + 720;
  run.at(end, () => {
    skipFlip.all = true;
    const p = prose();
    if (p) p.textContent = "";
    typing(false);
    status("Saved");
    const c = q<HTMLElement>('[data-type="count"]');
    if (c) c.textContent = formatCount(SCENE_WORDS);
    set(INITIAL);
  });
  return end;
}

// ── The component ───────────────────────────────────────────────────────

export function ManuscriptDemo() {
  const [state, setState] = useState<DemoState>(INITIAL);
  const rootRef = useRef<HTMLDivElement>(null);
  const positions = useRef<Map<string, number>>(new Map());
  const skipFlip = useRef<{ id: string | null; all: boolean }>({ id: null, all: false });

  // FLIP: rows that moved between commits slide from where they were; a row
  // that is new fades in. The dropped Scene, and a reset under the seam, do neither.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const prev = positions.current;
    const next = new Map<string, number>();
    const rows = root.querySelectorAll<HTMLElement>("[data-row-id]");
    const skip = skipFlip.current;
    // In the frame's own coordinates: the page may have scrolled between commits.
    const origin = root.getBoundingClientRect().top;
    for (const el of rows) {
      const id = el.dataset.rowId!;
      const top = el.getBoundingClientRect().top - origin;
      next.set(id, top);
      if (skip.all || id === skip.id) continue;
      const was = prev.get(id);
      if (was === undefined) {
        if (prev.size > 0) {
          el.setAttribute("data-enter", "");
          requestAnimationFrame(() => el.removeAttribute("data-enter"));
        }
        continue;
      }
      const dy = was - top;
      if (Math.abs(dy) < 0.5) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      void el.offsetHeight;
      el.style.transition = "";
      el.style.transform = "";
    }
    positions.current = next;
    skipFlip.current = { id: null, all: false };
  });

  // The loop runs while the shell is on screen, in a visible tab, on a screen
  // wide enough for the shell, and only for those who have not asked for less motion.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 641px)");
    let run: Run | null = null;
    let onScreen = false;

    const stop = () => {
      if (!run) return;
      run.cancel();
      run = null;
      // Reset unseen: offscreen, or in a hidden tab.
      skipFlip.current.all = true;
      const p = root.querySelector<HTMLElement>('[data-type="prose"]');
      if (p) p.textContent = "";
      const sel = root.querySelector<HTMLElement>('[data-type="chapter-default"]');
      if (sel) sel.textContent = NEW_CHAPTER_DEFAULT;
      root.removeAttribute("data-typing");
      const c = root.querySelector<HTMLElement>('[data-type="count"]');
      if (c) c.textContent = formatCount(SCENE_WORDS);
      const s = root.querySelector<HTMLElement>('[data-type="save"]');
      if (s) s.textContent = "Saved";
      setState(INITIAL);
    };
    const loop = () => {
      const r = new Run();
      run = r;
      const end = schedule(r, root, setState, skipFlip.current);
      r.at(end + 20, () => {
        if (run === r) loop();
      });
    };
    const sync = () => {
      const should = onScreen && !document.hidden && !still.matches && wide.matches;
      if (should && !run) loop();
      else if (!should && run) stop();
    };
    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        sync();
      },
      { threshold: 0.3 }
    );
    io.observe(root);
    document.addEventListener("visibilitychange", sync);
    still.addEventListener("change", sync);
    wide.addEventListener("change", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      still.removeEventListener("change", sync);
      wide.removeEventListener("change", sync);
      run?.cancel();
      run = null;
    };
  }, []);

  return (
    <div className="r2-lp-demo">
      <div ref={rootRef} className="r2-lp-demo-frame" data-focus={state.focus}>
        <Frame state={state} />
      </div>
      <div className="r2-lp-demo-seam" data-seam={state.seam || undefined}>
        <Frame state={INITIAL} />
      </div>
    </div>
  );
}
