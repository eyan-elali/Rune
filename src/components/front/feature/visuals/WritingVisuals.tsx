import { BookOpen, Flag, LayoutGrid, Maximize2, MessageSquarePlus, X } from "lucide-react";
import { ICON, ICON_SM } from "@/components/rune2/icons";
import { surfaceColours, THEMES, WRITING_SURFACES } from "@/lib/rune2/themes";
import { CHAPTER, ContextBar, GROUP, NavHeader, NavRow, PROJECT, PROSE, RootRow, SCENE, SceneProse, Tabs } from "./shell";

// The drawings of the four short pages the landing's strip leads to
// (FrontMore): Widgets and goals, Milestones, Reading Mode, Focus and
// themes. Each is the product's own surface, by rune2.css's classes, as
// the other feature pages draw theirs — nothing invented, nothing a
// writer cannot do today:
//
//   WidgetsBoard      the Widgets panel (Widgets.tsx; rune2.css: "Widgets"):
//                     its head and foot, and a board of the real faces —
//                     Today, Streak, the Daily goal with its ring, Writing
//                     activity, a Milestone, the Project goal.
//   MilestonesSheet   the Manuscript's Inspector on its Milestones section
//                     (ManuscriptMilestones.tsx): named pictures of the
//                     whole manuscript, each a flag, a name, when, how many
//                     words.
//   MilestoneWidget   the Milestone widget, wide: the latest milestone and
//                     what has been written since.
//   ReadingPeek       the Reading Peek (ReadingMode.tsx): the shell dimmed
//                     under the scrim, the reading surface over it — the
//                     reader's bar, then the manuscript as a reader meets
//                     it: the Part, the Chapter, the scenes, a scene break.
//   ChromeRecedes     two frames of the same column: at rest, with the tab
//                     band and the context bar; and while writing, the
//                     chrome gone to nothing in place (rune2.css: "Chrome
//                     that recedes while writing").
//   AppearanceRows    Settings' Appearance rows (RuneSettings.tsx): the
//                     Theme choice and the Writing surface's small pages.

// ── Widgets ────────────────────────────────────────────────────────────

const GOAL_TARGET = 500;
const TODAY = 412;

// Sixteen weeks of one writer's activity (the calendar's shape: a column a
// week, a cell a day, Monday at the top; the last week as far as today).
const WEEKS: ReadonlyArray<ReadonlyArray<0 | 1 | 2 | 3 | 4>> = [
  [0, 1, 0, 2, 1, 0, 0],
  [1, 2, 3, 0, 1, 2, 0],
  [0, 3, 4, 2, 0, 1, 1],
  [2, 1, 0, 3, 2, 0, 0],
  [1, 0, 2, 4, 3, 1, 0],
  [0, 2, 1, 0, 2, 3, 1],
  [1, 1, 0, 2, 0, 0, 0],
  [2, 3, 1, 0, 2, 1, 0],
  [0, 2, 4, 3, 1, 0, 1],
  [1, 0, 2, 1, 0, 2, 0],
  [2, 2, 0, 3, 1, 0, 0],
  [0, 1, 3, 2, 4, 1, 1],
  [1, 0, 0, 2, 1, 3, 0],
  [2, 3, 1, 0, 2, 0, 1],
  [0, 2, 4, 1, 3, 2, 0],
  [3],
];
const MONTHS = ["", "Jul", "", "", "", "Aug", "", "", "", "Sep", "", "", "", "Oct", "", ""];

function Ring({ share, size, stroke }: { share: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = Math.max(0, Math.min(1, share));
  return (
    <svg className="r2-ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle className="r2-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle
        className="r2-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - done)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function Face({ eyebrow, value, unit, meta }: { eyebrow: string; value: React.ReactNode; unit?: string; meta?: string }) {
  return (
    <>
      <span className="r2-widget-eyebrow">{eyebrow}</span>
      <span className="r2-widget-value">
        {value}
        {unit && <span className="r2-widget-unit"> {unit}</span>}
      </span>
      {meta && <span className="r2-widget-meta">{meta}</span>}
    </>
  );
}

function Widget({ size = "small", children }: { size?: "small" | "wide"; children: React.ReactNode }) {
  return (
    <div className="r2-widget" data-size={size}>
      <div className="r2-widget-content">{children}</div>
    </div>
  );
}

function ActivityCalendar() {
  return (
    <div className="r2-activity">
      <div className="r2-activity-months">
        {MONTHS.map((m, i) => (
          <span key={i} className="r2-activity-month">
            {m}
          </span>
        ))}
      </div>
      <ul className="r2-activity-weeks">
        {WEEKS.map((week, i) => (
          <li key={i} className="r2-activity-week">
            {week.map((level, j) => (
              <span key={j} className="r2-activity-day" data-level={level} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Widgets panel with a writer's board on it. */
export function WidgetsBoard() {
  const words = 56_554;
  const target = 80_000;
  return (
    <div className="r2-fp-widgets">
      <div className="r2-widgets-head">
        <div className="r2-widgets-heading">
          <h2>Widgets</h2>
          <p className="r2-widgets-project">{PROJECT}</p>
        </div>
        <span className="r2-icon-button">
          <X {...ICON} />
        </span>
      </div>
      <div className="r2-widgets-body">
        <div className="r2-widget-grid">
          <Widget>
            <div className="r2-widget-face">
              <Face eyebrow="Today" value={TODAY.toLocaleString("en-US")} unit="words" meta="This project" />
            </div>
          </Widget>
          <Widget>
            <div className="r2-widget-face">
              <Face eyebrow="Streak" value="6" unit="days" meta="Best 11 days" />
            </div>
          </Widget>
          <Widget size="wide">
            <div className="r2-widget-face r2-widget-face--daily" data-size="wide">
              <span className="r2-widget-eyebrow-row">
                <span className="r2-widget-eyebrow">Daily goal</span>
                <span className="r2-widget-aside">Edit</span>
              </span>
              <div className="r2-daily">
                <span className="r2-ring">
                  <Ring share={TODAY / GOAL_TARGET} size={56} stroke={3} />
                </span>
                <span className="r2-daily-text">
                  <span className="r2-widget-value">
                    {TODAY}
                    <span className="r2-widget-unit"> / {GOAL_TARGET}</span>
                  </span>
                  <span className="r2-widget-meta">{GOAL_TARGET - TODAY} words to go</span>
                </span>
              </div>
            </div>
          </Widget>
          <Widget size="wide">
            <div className="r2-widget-face r2-widget-face--activity">
              <span className="r2-widget-eyebrow">Writing activity</span>
              <ActivityCalendar />
              <span className="r2-widget-meta">63 writing days in the last sixteen weeks · all projects</span>
            </div>
          </Widget>
          <Widget>
            <div className="r2-widget-face">
              <Face eyebrow="Milestone" value={<span className="r2-widget-title">Draft one</span>} meta="12 March" />
            </div>
          </Widget>
          <Widget>
            <div className="r2-widget-face r2-widget-face--goal">
              <span className="r2-widget-eyebrow-row">
                <span className="r2-widget-eyebrow">Goal</span>
                <span className="r2-widget-aside">Edit</span>
              </span>
              <span className="r2-widget-value">
                {words.toLocaleString("en-US")}
                <span className="r2-widget-unit"> / {target.toLocaleString("en-US")}</span>
              </span>
              <span className="r2-widget-progress">
                <span className="r2-widget-progress-fill" style={{ width: `${Math.round((words / target) * 100)}%` }} />
              </span>
              <span className="r2-widget-meta">{(target - words).toLocaleString("en-US")} words to go</span>
            </div>
          </Widget>
        </div>
      </div>
      <div className="r2-widgets-foot">
        <span className="r2-widgets-link">Edit widgets</span>
      </div>
    </div>
  );
}

/** The tab band's far right: the Widgets control, where the board opens from. */
export function WidgetsControlMark() {
  return (
    <span className="r2-icon-button r2-icon-button--xs r2-tabs-widgets" data-open="">
      <LayoutGrid {...ICON} />
    </span>
  );
}

// ── Milestones ─────────────────────────────────────────────────────────

const MILESTONES = [
  { name: "Before the ending changed", when: "Tuesday, 17:52", words: "55,102 words" },
  { name: "Sent to Nell", when: "2 June", words: "51,870 words" },
  { name: "Draft one", when: "12 March", words: "48,214 words" },
];

/** The Manuscript's Inspector, on its Milestones. */
export function MilestonesSheet() {
  return (
    <div className="r2-fp-sheet">
      <aside className="r2-panel" data-open="">
        <div className="r2-panel-inner">
          <div className="r2-panel-head">
            <h2>Inspector</h2>
            <span className="r2-icon-button">
              <X {...ICON} />
            </span>
          </div>
          <div className="r2-panel-body">
            <div className="r2-inspector">
              <header className="r2-insp-head">
                <p className="r2-insp-kind">Manuscript</p>
                <p className="r2-insp-title">{PROJECT}</p>
                <p className="r2-insp-facts">
                  <span>14 chapters</span>
                  <span>56,554 words</span>
                </p>
              </header>
              <section className="r2-insp-section">
                <header className="r2-insp-section-head">
                  <h3 className="r2-insp-label">Milestones</h3>
                  <span className="r2-insp-aside">
                    <span className="r2-insp-aside-link">Save a milestone</span>
                  </span>
                </header>
                <p className="r2-insp-caption">Named pictures of the whole manuscript, kept as it was.</p>
                <ul className="r2-milestone-list">
                  {MILESTONES.map((m) => (
                    <li key={m.name}>
                      <span className="r2-milestone-item">
                        <Flag className="r2-milestone-flag" {...ICON_SM} />
                        <span className="r2-milestone-text">
                          <span className="r2-milestone-name">{m.name}</span>
                          <span className="r2-milestone-meta">
                            {m.when} · {m.words}
                          </span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The Milestone widget, wide: the latest milestone, and what has been written since. */
export function MilestoneWidget() {
  return (
    <div className="r2-fp-widget-alone">
      <div className="r2-widget" data-size="wide">
        <div className="r2-widget-content">
          <div className="r2-widget-face">
            <Face
              eyebrow="Milestone"
              value={<span className="r2-widget-title">Draft one</span>}
              meta="12 March · 48,214 words · 8,340 since"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reading Mode ───────────────────────────────────────────────────────

const SECOND_SCENE =
  "Tomas Reyes brought the boat in late on the Friday, which he never did, and stood a long time on the quay with the rope in his hands before he tied it.";

/** The shell beneath, as a trace: the navigator and the scene, with the reader over it. */
function ShellTrace() {
  return (
    <div className="r2-fp-reading-shell" aria-hidden>
      <div className="r2-lp-shot-nav r2-fp-nav-shot">
        <NavHeader />
        <div className="r2-lp-shot-tree">
          <ul>
            <li className="r2-lp-shot-section">
              <RootRow title="Manuscript" count="56,554" />
              <ul>
                <li>
                  <NavRow depth={1} title={GROUP} open />
                  <ul>
                    <li>
                      <NavRow depth={2} title="The Harbour" />
                    </li>
                    <li>
                      <NavRow depth={2} title={CHAPTER} open selected />
                      <ul>
                        <li>
                          <NavRow depth={3} title="The Grey String" />
                        </li>
                        <li>
                          <NavRow depth={3} title={SCENE} />
                        </li>
                        <li>
                          <NavRow depth={3} title="What the House Kept" />
                        </li>
                      </ul>
                    </li>
                    <li>
                      <NavRow depth={2} title="A Night Unopened" />
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
      <div className="r2-lp-shot-content">
        <Tabs context={GROUP} label={CHAPTER} />
        <ContextBar crumbs={["Manuscript", GROUP, CHAPTER]} actions="none" />
        <SceneProse paragraphs={PROSE.slice(0, 1)} />
      </div>
    </div>
  );
}

/** The Reading Peek over the shell. */
export function ReadingPeek() {
  return (
    <div className="r2-fp-reading">
      <ShellTrace />
      <div className="r2-fp-reading-scrim" />
      <div className="r2-reader-surface r2-fp-reader">
        <header className="r2-reader-bar">
          <div className="r2-reader-what">
            <p className="r2-reader-eyebrow">
              <BookOpen {...ICON_SM} />
              Reading
            </p>
            <p className="r2-reader-where">
              {GROUP} / {CHAPTER}
            </p>
          </div>
          <div className="r2-reader-actions">
            <span className="r2-action">
              <MessageSquarePlus {...ICON} />
              Add comment
            </span>
            <span className="r2-action r2-action--icon">
              <Maximize2 {...ICON} />
            </span>
            <span className="r2-action r2-action--icon">
              <X {...ICON} />
            </span>
          </div>
        </header>
        <div className="r2-reader-body">
          <div className="r2-reader-inner r2-fp-reader-inner">
            <article className="r2-reading-doc">
              <section className="r2-reading-group" data-depth="0">
                <h2>{GROUP}</h2>
                <section className="r2-reading-chapter">
                  <h3>{CHAPTER}</h3>
                  <section className="r2-reading-scene">
                    <div className="r2-fp-reading-prose">
                      {PROSE.slice(0, 2).map((p) => (
                        <p key={p.slice(0, 20)}>{p}</p>
                      ))}
                    </div>
                  </section>
                  <section className="r2-reading-scene" data-break="">
                    <div className="r2-fp-reading-prose">
                      <p>{SECOND_SCENE}</p>
                    </div>
                  </section>
                </section>
              </section>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Focus and themes ───────────────────────────────────────────────────

/** The writing column twice: at rest, and while the writer writes. */
export function ChromeRecedes() {
  return (
    <div className="r2-fp-pair">
      <figure className="r2-fp-pair-frame">
        <div className="r2-fp-shell r2-fp-shell--pair">
          <Tabs label={SCENE} />
          <ContextBar crumbs={[GROUP, CHAPTER, SCENE]} actions="none" />
          <SceneProse paragraphs={PROSE.slice(0, 2)} />
        </div>
        <figcaption className="r2-fp-pair-caption">At rest</figcaption>
      </figure>
      <figure className="r2-fp-pair-frame">
        <div className="r2-fp-shell r2-fp-shell--pair" data-writing="">
          <Tabs label={SCENE} />
          <ContextBar crumbs={[GROUP, CHAPTER, SCENE]} actions="none" />
          <SceneProse paragraphs={PROSE.slice(0, 2)} />
        </div>
        <figcaption className="r2-fp-pair-caption">While you write</figcaption>
      </figure>
    </div>
  );
}

/** Settings' Appearance rows: the Theme, and the Writing surface. */
export function AppearanceRows() {
  const chosenSurface = "paper";
  return (
    <div className="r2-fp-appearance">
      <div className="r2-settings-rows">
        <div className="r2-settings-row">
          <div className="r2-settings-row-text">
            <div className="r2-settings-row-label">Theme</div>
            <p className="r2-settings-row-help">System follows your device between Light and Dark.</p>
          </div>
          <div className="r2-settings-row-actions">
            <div className="r2-segmented">
              {THEMES.map((t) => (
                <span key={t.id} aria-pressed={t.id === "light" ? "true" : undefined}>
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="r2-settings-row r2-settings-row--stacked">
          <div className="r2-settings-row-text">
            <div className="r2-settings-row-label">Writing surface</div>
            <p className="r2-settings-row-help">
              The page your manuscript is written and read on. Default follows the theme; the others stay the same in every
              theme.
            </p>
          </div>
          <div className="r2-surfaces">
            {WRITING_SURFACES.map((s) => {
              const c = surfaceColours(s.id, "light");
              const chosen = s.id === chosenSurface;
              return (
                <span key={s.id} className="r2-surface-option" aria-checked={chosen ? "true" : "false"}>
                  <span className="r2-surface-swatch" style={{ background: c["ms-bg"], color: c["ms-ink"] }}>
                    <span className="r2-surface-swatch-text">Aa</span>
                    <span className="r2-surface-swatch-line" style={{ background: c["ms-faint"] }} />
                  </span>
                  <span className="r2-surface-label">{s.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
