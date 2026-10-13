import Link from "next/link";
import { ArrowRight, BookOpen, Flag } from "lucide-react";
import { ICON_SM, ICON_SM_BOLD } from "@/components/rune2/icons";
import { Reveal } from "./Reveal";

// Section 5 of the landing page (front.css: "More for the writing"): after
// the sections that say what Sutura fundamentally is — the manuscript, the
// workspace around it, the details beside it — a short, quiet strip of four
// smaller things that make the writing itself more complete: Widgets and
// goals, Milestones, Reading Mode, and the writing environment (the chrome
// that recedes, the themes, the writing surface). It is deliberately a step
// down from the sections above it: one understated line, four compact
// cards in a row, and no picture that asks for the viewport. "There is more
// here, but it does not interrupt the story to say so."
//
// A card is the workspace section's material surface at a smaller scale:
// a small preview of the product's surface in a well at its head, drawn
// with this section's own small classes rather than the live components
// (which need a Project and a session); then the eyebrow, a short serif
// line, one sentence, and the cue at the foot. Nothing in a preview is a
// control; the card as a whole is the one link, to the feature's short
// closer look (MORE_FEATURES: /features/<slug>), read in the Center Peek
// from here and on its own route by a direct visit, as every feature page
// is (app/(front)/features, components/front/feature).
//
// The previews make no claim the product does not keep: the Widgets are
// the real board's faces (Widgets.tsx) — a Daily goal ring, Today's words,
// the Writing activity cells; the Milestone is a named picture of the
// manuscript with its words and what has been written since
// (ManuscriptMilestones.tsx, the Milestone widget); Reading Mode is the
// Reading Peek over the shell (ReadingMode.tsx); and the environment is the
// chrome receding as the writer types (rune2.css: "Chrome that recedes
// while writing") with the writing surfaces of Settings (themes.ts:
// WRITING_SURFACES). There is no "focus mode" switch in Sutura: the
// interface simply gets out of the way, and the card says so.

export type MoreFeatureSlug = "widgets" | "milestones" | "reading-mode" | "focus-and-themes";

export const MORE_FEATURES: ReadonlyArray<{
  slug: MoreFeatureSlug;
  eyebrow: string;
  title: string;
  line: string;
}> = [
  {
    slug: "widgets",
    eyebrow: "Widgets & goals",
    title: "See the writing add up.",
    line: "Today’s words, a daily goal, a streak, and a quiet record of the days you showed up.",
  },
  {
    slug: "milestones",
    eyebrow: "Milestones",
    title: "Remember where the draft has been.",
    line: "Mark a meaningful point in the manuscript and see how the work has changed since.",
  },
  {
    slug: "reading-mode",
    eyebrow: "Reading Mode",
    title: "Read it like a reader.",
    line: "Step away from the workspace and meet the manuscript without everything around it.",
  },
  {
    slug: "focus-and-themes",
    eyebrow: "Focus & themes",
    title: "Make room for the page.",
    line: "The interface recedes as you write. Choose your writing surface, and keep only what helps.",
  },
];

export function moreFeaturePath(slug: MoreFeatureSlug) {
  return `/features/${slug}`;
}

// ── The previews ───────────────────────────────────────────────────────

// Widgets: three faces from the real board, at the well's scale — the Daily
// goal with its ring (412 of 500, 88 to go), Today's words, and the Writing
// activity calendar's last weeks. The numbers are one writer's afternoon.
const ACTIVITY: ReadonlyArray<ReadonlyArray<0 | 1 | 2 | 3 | 4>> = [
  [1, 0, 2, 1, 0, 0, 1],
  [2, 3, 0, 1, 2, 0, 0],
  [0, 2, 4, 2, 1, 0, 1],
  [1, 0, 2, 3, 2, 1, 0],
  [2, 1, 0, 2, 4, 1, 0],
  [0, 3, 2, 1, 0, 2, 1],
  [1, 2, 0, 3, 1, 0, 0],
  [2, 1, 3, 0, 2, 1, 0],
];

function Ring({ share, size, stroke }: { share: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="r2-lp-mo-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="r2-lp-mo-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle
        className="r2-lp-mo-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - share)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function WidgetsPreview() {
  return (
    <div className="r2-lp-mo-board">
      <div className="r2-lp-mo-widget r2-lp-mo-widget--wide">
        <span className="r2-lp-mo-widget-eyebrow">Daily goal</span>
        <span className="r2-lp-mo-daily">
          <Ring share={412 / 500} size={36} stroke={3} />
          <span className="r2-lp-mo-daily-text">
            <span className="r2-lp-mo-widget-value">
              412<span className="r2-lp-mo-widget-unit"> / 500</span>
            </span>
            <span className="r2-lp-mo-widget-meta">88 words to go</span>
          </span>
        </span>
      </div>
      <div className="r2-lp-mo-widget">
        <span className="r2-lp-mo-widget-eyebrow">Today</span>
        <span className="r2-lp-mo-widget-value">
          412<span className="r2-lp-mo-widget-unit"> words</span>
        </span>
        <span className="r2-lp-mo-widget-meta">This project</span>
      </div>
      <div className="r2-lp-mo-widget">
        <span className="r2-lp-mo-widget-eyebrow">Activity</span>
        <span className="r2-lp-mo-activity">
          {ACTIVITY.map((week, i) => (
            <span key={i} className="r2-lp-mo-week">
              {week.map((level, j) => (
                <span key={j} className="r2-lp-mo-day" data-level={level || undefined} />
              ))}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

// Milestones: the Manuscript's named pictures, as the Inspector lists them
// (ManuscriptMilestones), and under them where the manuscript stands now
// against the latest — the Milestone widget's own line.
function MilestonesPreview() {
  return (
    <div className="r2-lp-mo-milestones">
      <p className="r2-lp-mo-insp-label">Milestones</p>
      <ul className="r2-lp-mo-ms-list">
        <li className="r2-lp-mo-ms">
          <Flag className="r2-lp-mo-ms-flag" {...ICON_SM} />
          <span className="r2-lp-mo-ms-text">
            <span className="r2-lp-mo-ms-name">Draft one</span>
            <span className="r2-lp-mo-ms-meta">12 March · 48,214 words</span>
          </span>
        </li>
        <li className="r2-lp-mo-ms">
          <Flag className="r2-lp-mo-ms-flag" {...ICON_SM} />
          <span className="r2-lp-mo-ms-text">
            <span className="r2-lp-mo-ms-name">Before the ending changed</span>
            <span className="r2-lp-mo-ms-meta">Tuesday · 55,102 words</span>
          </span>
        </li>
      </ul>
      <p className="r2-lp-mo-ms-now">
        <span className="r2-lp-mo-ms-now-words">56,554 words</span>
        <span className="r2-lp-mo-ms-now-since">8,340 since Draft one</span>
      </p>
    </div>
  );
}

// Reading Mode: the shell's trace — the navigator's tone, the tab band —
// dimmed under the scrim, and the reading surface over it: the reader's
// bar, the chapter's title centred in the serif, the opening lines.
function ReadingPreview() {
  return (
    <div className="r2-lp-mo-reading">
      <div className="r2-lp-mo-reading-shell" aria-hidden>
        <div className="r2-lp-mo-reading-nav" />
        <div className="r2-lp-mo-reading-content">
          <div className="r2-lp-mo-reading-band" />
        </div>
      </div>
      <div className="r2-lp-mo-reading-scrim" />
      <div className="r2-lp-mo-reader">
        <div className="r2-lp-mo-reader-bar">
          <span className="r2-lp-mo-reader-eyebrow">
            <BookOpen {...ICON_SM} />
            Reading
          </span>
          <span className="r2-lp-mo-reader-where">Part One / The Letters</span>
        </div>
        <div className="r2-lp-mo-reader-body">
          <p className="r2-lp-mo-reader-chapter">The Letters</p>
          <p className="r2-lp-mo-reader-prose">
            The letters came on the Thursday boat, three of them, tied with the grey string her mother had always used. Ada did
            not open them at the harbour.
          </p>
        </div>
      </div>
    </div>
  );
}

// The environment: the writer writing — the tab band's tone gone and its
// tabs with it, the prose alone on a Paper surface (themes.ts: "paper") —
// and at the foot the writing surfaces as Settings draws them, four of
// the six, the chosen one ringed.
const SURFACES = [
  { id: "theme", label: "Default", bg: "var(--r2-ms-bg, var(--r2-bg))", ink: "var(--r2-prose-ink)", line: "var(--r2-ink-3)" },
  { id: "paper", label: "Paper", bg: "#f6f3ec", ink: "#25221d", line: "#8c8578" },
  { id: "warm", label: "Warm", bg: "#f2e9d8", ink: "#2d261d", line: "#877b67" },
  { id: "charcoal", label: "Charcoal", bg: "#26282c", ink: "#d6d8dc", line: "#80848b" },
] as const;

function EnvironmentPreview() {
  return (
    <div className="r2-lp-mo-env">
      <div className="r2-lp-mo-env-page">
        <div className="r2-lp-mo-env-band" />
        <p className="r2-lp-mo-env-prose">
          By the time she reached the house the wind had turned. She set the letters on the table beside the lamp
          <span className="r2-lp-mo-env-caret" />
        </p>
      </div>
      <div className="r2-lp-mo-surfaces">
        {SURFACES.map((s) => (
          <span key={s.id} className="r2-lp-mo-surface" data-chosen={s.id === "paper" || undefined}>
            <span className="r2-lp-mo-swatch" style={{ background: s.bg, color: s.ink }}>
              <span className="r2-lp-mo-swatch-text">Aa</span>
              <span className="r2-lp-mo-swatch-line" style={{ background: s.line }} />
            </span>
            <span className="r2-lp-mo-surface-label">{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const PREVIEWS: Record<MoreFeatureSlug, () => React.JSX.Element> = {
  widgets: WidgetsPreview,
  milestones: MilestonesPreview,
  "reading-mode": ReadingPreview,
  "focus-and-themes": EnvironmentPreview,
};

// ── The section ────────────────────────────────────────────────────────

export function FrontMore() {
  return (
    <section id="more" className="r2-lp-mo" aria-labelledby="lp-mo-title">
      <div className="r2-lp-mo-in">
        <Reveal className="r2-lp-mo-head">
          <p className="r2-lp-eyebrow">Around the writing</p>
          <h2 id="lp-mo-title" className="r2-lp-h2">
            More for the writing itself.
          </h2>
        </Reveal>
        <Reveal delay>
          <ul className="r2-lp-mo-grid">
            {MORE_FEATURES.map((f) => {
              const Preview = PREVIEWS[f.slug];
              return (
                <li key={f.slug} className="r2-lp-mo-cell" data-feature={f.slug}>
                  <Link
                    href={moreFeaturePath(f.slug)}
                    scroll={false}
                    className="r2-lp-mo-card r2-material r2-material--interactive"
                    aria-labelledby={`lp-mo-${f.slug}-eyebrow lp-mo-${f.slug}-title`}
                    aria-describedby={`lp-mo-${f.slug}-line`}
                  >
                    <div className="r2-lp-mo-card-preview" aria-hidden>
                      <Preview />
                    </div>
                    <div className="r2-lp-mo-card-text">
                      <p id={`lp-mo-${f.slug}-eyebrow`} className="r2-lp-mo-card-eyebrow">
                        {f.eyebrow}
                      </p>
                      <h3 id={`lp-mo-${f.slug}-title`} className="r2-lp-mo-card-title">
                        {f.title}
                      </h3>
                      <p id={`lp-mo-${f.slug}-line`} className="r2-lp-mo-card-line">
                        {f.line}
                      </p>
                    </div>
                    <span className="r2-lp-mo-card-cue" aria-hidden>
                      Learn more
                      <ArrowRight {...ICON_SM_BOLD} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
