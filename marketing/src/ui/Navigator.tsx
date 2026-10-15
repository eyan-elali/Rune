import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronsUpDown, MessageSquare, Search, Trash2, type LucideIcon } from "lucide-react";
import { ICON, ICON_SM_BOLD } from "@/components/rune2/icons";

// The Project navigator (components/rune2/ProjectNavigator.tsx), drawn: the
// same elements and classes — .r2-nav, its header, the root rows with their
// counts, nested .r2-row rows with the navigator's own indentation rule, the
// Send feedback utility and the account at the foot — so rune2.css paints it
// exactly as it paints the live one. What it shows is declared by the
// creative instead of read from a Project.
//
// The one thing the live navigator does not have is `reveal`: a row the
// creative is adding arrives over a short ease (its height opening, its ink
// fading in) rather than appearing in a single frame.

// ProjectNavigator's geometry.
const BASE_PAD = 6;
const INDENT = 16;
const ICONLESS_INSET = 19;

export type NavRowSpec = {
  id: string;
  title: string;
  /** Chapters, Groups and Workspace objects carry one; Scenes are known by indentation alone. */
  icon?: LucideIcon;
  /** May be fractional while a row is being moved under a new parent. */
  depth: number;
  /** undefined: nothing to disclose. */
  open?: boolean;
  selected?: boolean;
  muted?: boolean;
  emphasis?: boolean;
  /** The pointer is over it. */
  hover?: boolean;
  /** 0–1: the row arriving. Omitted: present. */
  reveal?: number;
  /** 0–1: the row's ink alone (a still of a row arriving, without the height opening). */
  ink?: number;
};

export type NavSectionSpec = {
  id: string;
  label: string;
  count?: number;
  open: boolean;
  selected?: boolean;
  rows: NavRowSpec[];
  /** 0–1: the whole section arriving (Unplaced Scenes appears with its first Scene). */
  reveal?: number;
  /** Opacity of the section's rows — a creative's emphasis, 1 by default. */
  ink?: number;
  /** Shown under an open section with no rows (the Workspace's first-use line). */
  empty?: ReactNode;
};

function Disclosure({ open }: { open?: boolean }) {
  if (open === undefined) return <span className="r2-disclosure" aria-hidden />;
  return (
    <span className="r2-disclosure" data-open={open || undefined} aria-hidden>
      <ChevronRight {...ICON_SM_BOLD} />
    </span>
  );
}

/** Height and ink opening together, from nothing: how a staged row arrives. */
export function Reveal({ t, children }: { t?: number; children: ReactNode }) {
  if (t === undefined || t >= 1) return <>{children}</>;
  return (
    <div style={{ display: "grid", gridTemplateRows: `${t}fr`, opacity: t }}>
      <div style={{ minHeight: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Row({ row }: { row: NavRowSpec }) {
  const Icon = row.icon;
  const pad = BASE_PAD + row.depth * INDENT + (Icon ? 0 : ICONLESS_INSET);
  return (
    <Reveal t={row.reveal}>
      <div
        className="r2-row"
        data-selected={row.selected || undefined}
        data-emphasis={row.emphasis || undefined}
        data-muted={row.muted || undefined}
        style={
          {
            paddingLeft: pad,
            ...(row.hover && !row.selected ? { background: "var(--r2-hover)" } : {}),
            ...(row.ink !== undefined ? { opacity: row.ink } : {}),
          } as CSSProperties
        }
      >
        <Disclosure open={row.open} />
        {Icon && <Icon className="r2-row-icon" {...ICON} aria-hidden />}
        <span className="r2-row-main">
          <span className="r2-row-label">{row.title}</span>
        </span>
      </div>
    </Reveal>
  );
}

function RootRow({ section }: { section: NavSectionSpec }) {
  return (
    <div className="r2-row r2-row--root" data-selected={section.selected || undefined} style={{ paddingLeft: BASE_PAD }}>
      <Disclosure open={section.open} />
      <span className="r2-row-main">
        <span className="r2-row-label">{section.label}</span>
      </span>
      {section.count !== undefined && <span className="r2-row-count">{section.count.toLocaleString("en-US")}</span>}
    </div>
  );
}

export function Navigator({
  project,
  sections,
  penName,
}: {
  project: string;
  sections: NavSectionSpec[];
  penName: string;
}) {
  return (
    <nav aria-label="Project" className="r2-nav">
      <div className="r2-nav-header">
        <span className="r2-nav-project">
          <span className="r2-nav-project-title">{project}</span>
          <ChevronDown {...ICON_SM_BOLD} aria-hidden />
        </span>
        <span className="r2-icon-button r2-nav-search">
          <Search {...ICON} aria-hidden />
        </span>
      </div>
      <div className="r2-nav-progress" aria-hidden />
      <div className="r2-nav-scroll">
        <ul role="list">
          {sections.map((s, i) => {
            const t = s.reveal ?? 1;
            if (t <= 0) return null;
            return (
              <li
                key={s.id}
                className={i > 0 ? "r2-nav-section" : undefined}
                style={i > 0 && t < 1 ? { marginTop: 16 * t } : undefined}
              >
                <Reveal t={s.reveal}>
                  <RootRow section={s} />
                  <div style={{ opacity: s.ink ?? 1 }}>
                    {s.open && s.rows.length > 0 && (
                      <ul role="list">
                        {s.rows.map((r) => (
                          <li key={r.id}>
                            <Row row={r} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.open && s.rows.length === 0 && s.empty}
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
      <span className="r2-nav-utility">
        <span className="r2-nav-utility-mark" aria-hidden>
          <MessageSquare {...ICON} />
        </span>
        Send feedback
      </span>
      <div className="r2-nav-footer">
        <span className="r2-account r2-account--nav">
          <span className="r2-account-mark" aria-hidden>
            {[...penName][0]}
          </span>
          <span className="r2-account-name">{penName}</span>
          <ChevronsUpDown {...ICON_SM_BOLD} aria-hidden />
        </span>
        <span className="r2-icon-button r2-icon-button--md r2-nav-trash">
          <Trash2 {...ICON} aria-hidden />
        </span>
      </div>
    </nav>
  );
}
