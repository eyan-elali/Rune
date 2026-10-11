import type { ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronRight, MoreHorizontal, PanelLeft, PanelRight, Plus, StickyNote, X } from "lucide-react";
import { ICON, ICON_SM_BOLD } from "@/components/rune2/icons";

// The pieces the feature pages' drawings share: one fictional book — the
// landing page's (ManuscriptDemo, FrontDetails) — and the shell's own
// chrome, drawn by rune2.css's classes exactly as the landing draws it:
// the tab band (Rune2Tabs), the context bar (Rune2Content), the document
// head, and a property row as the Inspector and an
// Entry set it (PropertyFields.tsx). Nothing here is a control: the
// product's buttons are plain spans with the same classes, and the
// drawings are set inert by the stylesheet (pointer-events: none).

export const PROJECT = "The Lantern Road";
export const GROUP = "Part One";
export const CHAPTER = "The Letters";
export const SCENE = "The Thursday Boat";

/** The scene's opening, as the landing shows it. */
export const PROSE = [
  "The letters came on the Thursday boat, three of them, tied with the grey string her mother had always used. Ada did not open them at the harbour. She carried them up the hill the way one carries something that might still be warm.",
  "By the time she reached the house the wind had turned. She set the letters on the table beside the lamp and left them there while she made tea, as if the ordinary tasks could be made to go first.",
  "The first was dated in March, which meant it had waited somewhere for the better part of a season. She read it standing, and then again sitting down, and the second reading was the one that counted.",
];

export function Disclosure({ open }: { open?: boolean }) {
  if (open === undefined) return <span className="r2-disclosure" />;
  return (
    <span className="r2-disclosure" data-open={open || undefined}>
      <ChevronRight {...ICON_SM_BOLD} />
    </span>
  );
}

const BASE_PAD = 6;
const INDENT = 16;
const ICONLESS_INSET = 19;

/** A navigator row (ProjectNavigator: NavRow), by the product's classes and metrics. */
export function NavRow({
  depth,
  title,
  icon: Icon,
  open,
  selected,
  emphasis,
  muted,
  count,
}: {
  depth: number;
  title: string;
  icon?: typeof ChevronDown;
  open?: boolean;
  selected?: boolean;
  emphasis?: boolean;
  muted?: boolean;
  count?: string;
}) {
  return (
    <div
      className="r2-row"
      data-selected={selected || undefined}
      data-emphasis={emphasis || undefined}
      data-muted={muted || undefined}
      style={{ paddingLeft: BASE_PAD + depth * INDENT + (Icon ? 0 : ICONLESS_INSET) }}
    >
      <Disclosure open={open} />
      {Icon && <Icon className="r2-row-icon" {...ICON} />}
      <span className="r2-row-main">
        <span className="r2-row-label">{title}</span>
      </span>
      {count && <span className="r2-row-count">{count}</span>}
    </div>
  );
}

export function RootRow({ title, count, open = true }: { title: string; count?: string; open?: boolean }) {
  return (
    <div className="r2-row r2-row--root" style={{ paddingLeft: BASE_PAD }}>
      <Disclosure open={open} />
      <span className="r2-row-main">
        <span className="r2-row-label">{title}</span>
      </span>
      {count && <span className="r2-row-count">{count}</span>}
    </div>
  );
}

export function NavHeader() {
  return (
    <div className="r2-nav-header">
      <span className="r2-nav-project">
        <span className="r2-nav-project-title">{PROJECT}</span>
        <ChevronDown {...ICON_SM_BOLD} />
      </span>
    </div>
  );
}

/** The tab band: one open tab, "Context · Title", with the navigator toggle and "+". */
export function Tabs({ context, label, toggle = true }: { context?: string; label: string; toggle?: boolean }) {
  return (
    <nav className="r2-tabs">
      {toggle && (
        <span className="r2-icon-button r2-tabs-nav-toggle">
          <PanelLeft {...ICON} />
        </span>
      )}
      <ul>
        <li className="r2-tab" data-active>
          <span className="r2-tab-main">
            {context && <span className="r2-tab-context">{context} ·</span>}
            <span className="r2-tab-label">{label}</span>
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
  );
}

/** The context bar: the breadcrumb and the selection's actions. */
export function ContextBar({ crumbs, actions = "scene" }: { crumbs: string[]; actions?: "scene" | "workspace" | "none" }) {
  return (
    <header className="r2-contextbar">
      <nav>
        <ol>
          {crumbs.map((c, i) => (
            <li key={c}>
              {i > 0 && <span className="r2-crumb-sep">/</span>}
              <span className={i === crumbs.length - 1 ? "r2-crumb-current" : undefined}>{c}</span>
            </li>
          ))}
        </ol>
      </nav>
      {actions !== "none" && (
        <div className="r2-contextbar-actions">
          {actions === "scene" && (
            <span className="r2-action">
              <BookOpen {...ICON} />
              Read
            </span>
          )}
          <span className="r2-action r2-action--icon">
            <MoreHorizontal {...ICON} />
          </span>
          <span className="r2-contextbar-panel">
            {actions === "scene" && (
              <span className="r2-action">
                <StickyNote {...ICON} />
                Revision Notes
              </span>
            )}
            <span className="r2-action r2-action--icon">
              <PanelRight {...ICON} />
            </span>
          </span>
        </div>
      )}
    </header>
  );
}

/** The manuscript's prose, as the landing sets it: the title, then the paragraphs. */
export function SceneProse({ paragraphs = PROSE, eyebrow = CHAPTER, title = SCENE }: { paragraphs?: string[]; eyebrow?: string; title?: string }) {
  return (
    <div className="r2-lp-shot-doc">
      <div className="r2-doc-head">
        <p className="r2-doc-eyebrow">{eyebrow}</p>
        <p className="r2-doc-title">{title}</p>
      </div>
      <div className="r2-lp-shot-prose">
        {paragraphs.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </div>
    </div>
  );
}

// ── Property rows (PropertyFields.tsx) ──────────────────────────────────

export function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="r2-prop">
      <dt className="r2-prop-label">
        <span className="r2-prop-label-text">{label}</span>
      </dt>
      <dd className="r2-prop-value">{children}</dd>
    </div>
  );
}

/** A Relationship's value: the linked objects' names, in the product's link voice. */
export function Relation({ names }: { names: string[] }) {
  return (
    <div className="r2-prop-choice r2-prop-relation">
      <span className="r2-prop-links">
        {names.map((n) => (
          <span key={n} className="r2-prop-link">
            {n}
          </span>
        ))}
      </span>
    </div>
  );
}

/** A Select, Multi-select or Status value: the chosen options, a Status with its dot. */
export function Choice({ type, options }: { type: "select" | "multi_select" | "status"; options: string[] }) {
  return (
    <div className="r2-prop-choice">
      <span className="r2-prop-button">
        <Options type={type} options={options} />
      </span>
    </div>
  );
}

export function Options({ type, options }: { type: "select" | "multi_select" | "status"; options: string[] }) {
  return (
    <span className="r2-prop-options" data-type={type}>
      {options.map((o) => (
        <span key={o} className="r2-prop-option">
          {o}
        </span>
      ))}
    </span>
  );
}

/** A Text, Number or Date value, as the product shows it at rest. */
export function Plain({ children }: { children: ReactNode }) {
  return <span className="r2-prop-input r2-fp-prop-plain">{children}</span>;
}
