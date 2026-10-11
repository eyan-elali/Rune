"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { BookOpen, ChevronDown, ChevronRight, FileText, Layers, MoreHorizontal, PanelLeft, PanelRight, Plus, StickyNote, X } from "lucide-react";
import { ICON, ICON_SM_BOLD } from "@/components/rune2/icons";

// Section 2's proof (FrontManuscript): the Project shell with a manuscript
// open, demonstrating one thing. The writer is writing. A short loop, about
// seven seconds, muted, with nothing to press: a line is written, and while
// it is written the chrome gets out of the way; the writing pauses, the
// save lands, and the chrome returns; a breath; and the manuscript is open
// again as it was.
//
// The shell is drawn with the real navigator rows, tab band, context bar
// and title from rune2.css — the same markup Rune2Tabs, Rune2Content and
// Rune2Writing render, by the same classes — and the one state it takes is
// the product's own: the chrome that recedes while writing (useWritingChrome's
// data-writing, here on the demo's frame). Nothing here is the live
// navigator or editor: the manuscript is a small fixed drawing of one
// fictional book, and nothing is read from or written to the product.
//
// Nothing in React changes while the loop plays. Typing writes straight
// into a span; the count and the save state are text set in place; the
// chrome and the caret are attributes on the frame. The loop closes on a
// crossfade to a second, still copy of the opening frame, under which the
// playing frame resets unseen.
//
// Under reduced motion, on a phone, or without JavaScript, the opening frame
// stands still, with its chrome. On a phone the stylesheet shows the
// navigator alone — the manuscript's order is the proof there, with no
// editor and no loop (front.css: Section 2, "Phones"). Offscreen (and in a
// hidden tab) the loop stops and resets, so it costs nothing and comes back
// from the top.

// ── The manuscript ──────────────────────────────────────────────────────

const BASE_PAD = 6;
const INDENT = 16;
const ICONLESS_INSET = 19;

export const DEMO_PROJECT = "The Lantern Road";
const SCENE = "The Thursday Boat";
const CHAPTER = "The Letters";
const SCENE_WORDS = 1412;
const MANUSCRIPT_WORDS = 41208;
const UNPLACED_WORDS = 2340;

const PROSE = [
  "The letters came on the Thursday boat, three of them, tied with the grey string her mother had always used. Ada did not open them at the harbour. She carried them up the hill the way one carries something that might still be warm.",
  "By the time she reached the house the wind had turned. She set the letters on the table beside the lamp and left them there while she made tea, as if the ordinary tasks could be made to go first.",
  "The first was dated in March, which meant it had waited somewhere for the better part of a season. She read it standing, and then again sitting down, and the second reading was the one that counted.",
  "Outside, the ferry gave its long note and turned for the mainland,",
];
/** The line the loop writes: twelve words, a comma to breathe at. */
const TYPED = " and the house was quiet in its own way, as if listening.";

type Scene = { id: string; title: string; muted?: boolean };
type Chapter = { id: string; title: string; scenes: Scene[]; open: boolean };
/** `open: "phone"`: closed in the shell, open in the phone's navigator-only drawing, where the tree is the whole proof (front.css: Section 2, "Phones"). */
type Group = { id: string; title: string; chapters: Chapter[]; open: boolean | "phone" };

const GROUPS: Group[] = [
  {
    id: "p1",
    title: "Part One",
    open: true,
    chapters: [
      { id: "harbour", title: "The Harbour", scenes: [{ id: "h1", title: "" }, { id: "h2", title: "" }], open: false },
      {
        id: "letters",
        title: CHAPTER,
        open: true,
        scenes: [{ id: "ferry", title: "The Ferry" }, { id: "boat", title: SCENE }, { id: "high", title: "High Water" }],
      },
      { id: "quiet", title: "A Quiet House", scenes: [{ id: "q1", title: "" }, { id: "q2", title: "" }], open: false },
    ],
  },
  {
    id: "p2",
    title: "Part Two",
    open: "phone",
    chapters: [
      { id: "crossing", title: "The Crossing", open: true, scenes: [{ id: "tide", title: "Morning Tide" }, { id: "inland", title: "The Road Inland" }] },
      { id: "mainland", title: "The Mainland", scenes: [{ id: "m1", title: "" }, { id: "m2", title: "" }], open: false },
    ],
  },
];
const SELECTED = "boat";

const UNPLACED: Scene[] = [
  { id: "old", title: "The old argument" },
  { id: "untitled", title: "Untitled scene", muted: true },
];

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
  depth,
  title,
  icon: Icon,
  open,
  selected,
  emphasis,
  muted,
}: {
  depth: number;
  title: string;
  icon?: typeof Layers;
  open?: boolean;
  selected?: boolean;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className="r2-row"
      data-selected={selected || undefined}
      data-emphasis={emphasis || undefined}
      data-muted={muted || undefined}
      style={{ paddingLeft: pad(depth, !Icon) } as CSSProperties}
    >
      <Disclosure open={open} />
      {Icon && <Icon className="r2-row-icon" {...ICON} />}
      <span className="r2-row-main">
        <span className="r2-row-label">{title}</span>
      </span>
    </div>
  );
}

function Tree() {
  return (
    <div className="r2-lp-shot-tree">
      <ul>
        <li className="r2-lp-shot-section">
          <div className="r2-row r2-row--root" style={{ paddingLeft: BASE_PAD }}>
            <Disclosure open />
            <span className="r2-row-main">
              <span className="r2-row-label">Manuscript</span>
            </span>
            <span className="r2-row-count">{formatCount(MANUSCRIPT_WORDS)}</span>
          </div>
          <ul>
            {GROUPS.map((g) => (
              <li key={g.id} data-lp-phone={g.open === "phone" ? "open" : undefined}>
                <Row depth={1} title={g.title} icon={Layers} open={g.open === true} emphasis />
                {g.open && (
                  <ul>
                    {g.chapters.map((c) => {
                      // A Chapter's only Scene stays out of sight (chapterShowsScenes).
                      const shows = c.scenes.length > 1;
                      return (
                        <li key={c.id}>
                          <Row depth={2} title={c.title} icon={FileText} open={shows ? c.open : undefined} />
                          {shows && c.open && (
                            <ul>
                              {c.scenes.map((s) => (
                                <li key={s.id}>
                                  <Row depth={3} title={s.title} muted={s.muted} selected={s.id === SELECTED} />
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
          <div className="r2-row r2-row--root" style={{ paddingLeft: BASE_PAD }}>
            <Disclosure open />
            <span className="r2-row-main">
              <span className="r2-row-label">Unplaced Scenes</span>
            </span>
            <span className="r2-row-count">{formatCount(UNPLACED_WORDS)}</span>
          </div>
          <ul>
            {UNPLACED.map((s) => (
              <li key={s.id}>
                <Row depth={1} title={s.title} muted={s.muted} />
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </div>
  );
}

function Frame() {
  return (
    <div className="r2-lp-shot-in">
      <div className="r2-lp-shot-nav">
        <div className="r2-nav-header">
          <span className="r2-nav-project">
            <span className="r2-nav-project-title">{DEMO_PROJECT}</span>
            <ChevronDown {...ICON_SM_BOLD} />
          </span>
        </div>
        <Tree />
      </div>
      <div className="r2-lp-shot-content">
        {/* The tab band (Rune2Tabs): the navigator's toggle, the one open tab
            with its close control shown as the active tab shows it, and "+". */}
        <nav className="r2-tabs">
          <span className="r2-icon-button r2-tabs-nav-toggle">
            <PanelLeft {...ICON} />
          </span>
          <ul>
            <li className="r2-tab" data-active>
              <span className="r2-tab-main">
                <span className="r2-tab-context">{CHAPTER} ·</span>
                <span className="r2-tab-label">{SCENE}</span>
              </span>
              <span className="r2-tab-close">
                <X {...ICON} />
              </span>
            </li>
          </ul>
          <span className="r2-icon-button r2-icon-button--xs r2-tabs-add">
            <Plus {...ICON} />
          </span>
        </nav>
        {/* The context bar (Rune2Content: Rune2ContextBar): the breadcrumb
            from the Manuscript down — the Project's name is the navigator's
            while the navigator is open — and the selection's actions. */}
        <header className="r2-contextbar">
          <nav>
            <ol>
              <li>
                <span>Manuscript</span>
              </li>
              <li>
                <span className="r2-crumb-sep">/</span>
                <span>Part One</span>
              </li>
              <li>
                <span className="r2-crumb-sep">/</span>
                <span>{CHAPTER}</span>
              </li>
              <li>
                <span className="r2-crumb-sep">/</span>
                <span className="r2-crumb-current">{SCENE}</span>
              </li>
            </ol>
          </nav>
          <div className="r2-contextbar-actions">
            <span className="r2-action">
              <BookOpen {...ICON} />
              Read
            </span>
            <span className="r2-action r2-action--icon">
              <MoreHorizontal {...ICON} />
            </span>
            <span className="r2-contextbar-panel">
              <span className="r2-action">
                <StickyNote {...ICON} />
                Revision Notes
              </span>
              <span className="r2-action r2-action--icon">
                <PanelRight {...ICON} />
              </span>
            </span>
          </div>
        </header>
        <div className="r2-lp-shot-doc">
          <div className="r2-doc-head">
            <p className="r2-doc-eyebrow">{CHAPTER}</p>
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

/** A person's typing: unhurried, uneven, a breath after a word, a longer one after a comma. */
function keyDelay(ch: string) {
  const base = ch === "," ? 150 : ch === "." ? 120 : ch === " " ? 76 : 44;
  return base + Math.random() * 36;
}

/** The opening frame stands before any key. */
const OPENING_HOLD = 500;
/** The chrome goes after the typing has settled, as the product waits for a sustained start. */
const CHROME_SETTLE = 360;
/** The product's debounced save: "Saving…" once the first words are down. */
const SAVE_PENDING = 900;
/** After the last key: the save lands, then the chrome comes back, then a breath. */
const AFTER = { saved: 360, chrome: 680, hold: 1400 };
/** The still opening frame fades in over this one (front.css: .r2-lp-demo-seam). */
const SEAM_MS = 660;

/** The text, count and state the loop changes, put back as they were. */
function resetFrame(root: HTMLElement) {
  const p = root.querySelector<HTMLElement>('[data-type="prose"]');
  if (p) p.textContent = "";
  const c = root.querySelector<HTMLElement>('[data-type="count"]');
  if (c) c.textContent = formatCount(SCENE_WORDS);
  const s = root.querySelector<HTMLElement>('[data-type="save"]');
  if (s) s.textContent = "Saved";
  root.removeAttribute("data-typing");
  root.removeAttribute("data-writing");
}

/**
 * One pass of the loop, scheduled against `run`. `root` is the playing
 * frame and `seam` the still one that closes the loop. Returns the loop's
 * length, after which the frame stands as it opened.
 */
function schedule(run: Run, root: HTMLElement, seam: HTMLElement | null) {
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const text = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  // The caret: steady while a key is going down, blinking at rest.
  const typing = (on: boolean) => root.toggleAttribute("data-typing", on);
  // The chrome: gone while the manuscript is being written (the product's data-writing).
  const writing = (on: boolean) => root.toggleAttribute("data-writing", on);

  // ── Writing ─────────────────────────────────────────────────────────
  const start = OPENING_HOLD;
  run.at(start, () => typing(true));
  run.at(start + CHROME_SETTLE, () => writing(true));
  run.at(start + SAVE_PENDING, () => text('[data-type="save"]', "Saving…"));

  let t = start;
  let words = SCENE_WORDS;
  for (const ch of TYPED) {
    t += keyDelay(ch);
    run.at(t, () => {
      const prose = q('[data-type="prose"]');
      if (prose) prose.textContent += ch;
      // A word is counted as the space after it lands, as the editor counts.
      if (ch === " ") {
        words += 1;
        text('[data-type="count"]', formatCount(words));
      }
    });
  }
  const last = t;

  // ── The pause: the save lands, the chrome comes back ────────────────
  run.at(last + 40, () => typing(false));
  run.at(last + AFTER.saved, () => text('[data-type="save"]', "Saved"));
  run.at(last + AFTER.chrome, () => writing(false));

  // ── The seam: the opening frame returns over this one ───────────────
  const seamAt = last + AFTER.hold;
  run.at(seamAt, () => {
    // Both carets stand steady through the crossfade, so no blink shows the join.
    typing(true);
    seam?.setAttribute("data-seam", "");
  });
  const end = seamAt + SEAM_MS;
  run.at(end, () => {
    resetFrame(root);
    seam?.removeAttribute("data-seam");
  });
  return end;
}

// ── The component ───────────────────────────────────────────────────────

export function ManuscriptDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const seamRef = useRef<HTMLDivElement>(null);

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
      // Reset unseen: offscreen, or in a hidden tab. The chrome is back for
      // the still frame.
      resetFrame(root);
      seamRef.current?.removeAttribute("data-seam");
    };
    const loop = () => {
      const r = new Run();
      run = r;
      const end = schedule(r, root, seamRef.current);
      r.at(end, () => {
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
      <div ref={rootRef} className="r2-lp-demo-frame">
        <Frame />
      </div>
      <div ref={seamRef} className="r2-lp-demo-seam">
        <Frame />
      </div>
    </div>
  );
}
