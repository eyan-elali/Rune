import type { CSSProperties, ReactNode } from "react";
import { BookOpen, MoreHorizontal, PanelLeft, PanelRight, Plus, StickyNote, X } from "lucide-react";
import { ICON } from "@/components/rune2/icons";

// The Project shell (components/rune2/Rune2Shell.tsx), drawn: the navigator
// column and the content column — tab band, context bar, body, document
// status — with the same elements and classes, so rune2.css lays it out and
// paints it. The shell is drawn at a fixed logical size (the app fills the
// window: 100dvh, and the writing column centres against 100vw), so the two
// window-relative values are given here as the size of this window.

const DOC_MEASURE_WIDTH = 704 + 2 * 52; // rune2.css: --r2-doc-measure-width (44rem prose + gutters)

export function Shell({
  width,
  height,
  navWidth,
  manuscript,
  nav,
  tabs,
  contextBar,
  main,
  panel,
  status,
  navCollapsed = false,
}: {
  width: number;
  height: number;
  /** The navigator's width (a writer may drag it; the app's default is 252). */
  navWidth: number;
  /** The manuscript is in view: the writing surface paints the content region (data-manuscript). */
  manuscript: boolean;
  nav: ReactNode;
  tabs: ReactNode;
  contextBar: ReactNode;
  main: ReactNode;
  /** The contextual panel (ui/Panel.tsx: PanelSheet), beside the content in the body zone. */
  panel?: ReactNode;
  status?: ReactNode;
  /** The navigator retracted (the tab band's toggle): data-nav="collapsed". */
  navCollapsed?: boolean;
}) {
  const centred = (width - (navCollapsed ? 0 : navWidth) - DOC_MEASURE_WIDTH) / 2;
  return (
    <div
      className="r2-shell"
      data-editor-font="serif"
      data-nav={navCollapsed ? "collapsed" : undefined}
      style={{ width, height, "--r2-nav-full": `${navWidth}px` } as CSSProperties}
    >
      <div className="r2-nav-column">{nav}</div>
      <div className="r2-content">
        <div className="r2-content-layer" data-manuscript={manuscript || undefined}>
          {tabs}
          {contextBar}
          <div className="r2-body">
            <main className="r2-main" style={{ "--r2-doc-centred": `${centred}px` } as CSSProperties}>
              {main}
            </main>
            {panel}
            <div className="r2-status">{status}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type TabSpec = { key: string; label: string; context?: string; active?: boolean; reveal?: number };

/** The tab band (Rune2Tabs): the navigator's toggle, the working set, "+". */
export function TabBand({ tabs }: { tabs: TabSpec[] }) {
  return (
    <nav className="r2-tabs" aria-label="Open">
      <span className="r2-icon-button r2-tabs-nav-toggle">
        <PanelLeft {...ICON} aria-hidden />
      </span>
      <ul>
        {tabs.map((t) => (
          <li
            key={t.key}
            className="r2-tab"
            data-active={t.active || undefined}
            style={t.reveal !== undefined && t.reveal < 1 ? { opacity: t.reveal, transform: `translateY(${(1 - t.reveal) * 3}px)` } : undefined}
          >
            <span className="r2-tab-main">
              {t.context && <span className="r2-tab-context">{t.context} ·</span>}
              <span className="r2-tab-label">{t.label}</span>
            </span>
            <span className="r2-tab-close">
              <X {...ICON} aria-hidden />
            </span>
          </li>
        ))}
      </ul>
      <span className="r2-icon-button r2-icon-button--xs r2-tabs-add">
        <Plus {...ICON} aria-hidden />
      </span>
    </nav>
  );
}

/**
 * The context bar (Rune2ContextBar): the trail from the Manuscript or the
 * Workspace down to what is open, and that object's actions — Read for
 * manuscript prose, "⋯", and the panel's two actions.
 */
export function ContextBar({
  project,
  trail,
  read,
  add,
  panel,
}: {
  project: string;
  trail: string[];
  read: boolean;
  /** The object's own add action: "+ Scene" on a Scene (AddSceneAction), "+ Entry" on an Entry (NewEntryAction). */
  add?: "Scene" | "Entry";
  /** Which panel action is pressed (aria-pressed), when the panel is open. */
  panel?: "notes" | "inspector";
}) {
  return (
    <header className="r2-contextbar">
      <nav aria-label="Breadcrumb">
        <ol>
          <li className="r2-crumb-project">{project}</li>
          {trail.map((title, i) => (
            <li key={`${title}-${i}`}>
              <span aria-hidden className="r2-crumb-sep">
                /
              </span>
              {i === trail.length - 1 ? <span className="r2-crumb-current">{title}</span> : <span>{title}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <div className="r2-contextbar-actions">
        {add && (
          <span className="r2-action">
            <Plus {...ICON} aria-hidden />
            {add}
          </span>
        )}
        {read && (
          <span className="r2-action">
            <BookOpen {...ICON} aria-hidden />
            Read
          </span>
        )}
        <span className="r2-action r2-action--icon">
          <MoreHorizontal {...ICON} aria-hidden />
        </span>
        <span className="r2-contextbar-panel">
          <span className="r2-action" aria-pressed={panel === "notes"}>
            <StickyNote {...ICON} aria-hidden />
            Revision Notes
          </span>
          <span className="r2-action r2-action--icon" aria-pressed={panel === "inspector"}>
            <PanelRight {...ICON} aria-hidden />
          </span>
        </span>
      </div>
    </header>
  );
}

/** The document status (DocStatus): "1,412 words · Saved". */
export function DocStatus({ words, state }: { words: number; state: string }) {
  return (
    <div className="r2-doc-status">
      <span className="tabular-nums">{words.toLocaleString("en-US")} words</span>
      <span aria-hidden>·</span>
      <span>{state}</span>
    </div>
  );
}
