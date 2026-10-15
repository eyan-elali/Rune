import type { ReactNode } from "react";
import { ChevronDown, CircleDashed, CircleDot, Flag, Hash, Link2, Pencil, Trash2, Type, X, type LucideIcon } from "lucide-react";
import { ICON, ICON_SM } from "@/components/rune2/icons";

// The contextual panel (components/rune2/Rune2Panel.tsx), drawn: the one
// side sheet that holds either Revision Notes (RevisionNotes.tsx) or the
// Inspector (InspectorView, InspectorSection, PropertyFields' rows,
// SceneHistorySection, ObjectMilestonesSection, ObjectLinks) — the same
// elements and classes, so rune2.css paints it as it paints the live one.
// What it holds is declared by the creative.

export function PanelSheet({
  title,
  scroll = 0,
  children,
}: {
  title: "Revision Notes" | "Inspector";
  /** The panel body's own scroll, px — drawn, not set, so the frame never depends on scroll state. */
  scroll?: number;
  children: ReactNode;
}) {
  return (
    <aside className="r2-panel" data-open="" aria-label={title}>
      <div className="r2-panel-inner">
        <header className="r2-panel-head">
          <h2>{title}</h2>
          <span className="r2-icon-button">
            <X {...ICON} aria-hidden />
          </span>
        </header>
        <div className="r2-panel-body">{scroll ? <div style={{ transform: `translateY(${-scroll}px)` }}>{children}</div> : children}</div>
      </div>
    </aside>
  );
}

// ── Revision Notes ─────────────────────────────────────────────────────────

export type NoteSpec = { id: string; body: string; details: string | null; anchor: string | null; expanded?: boolean; hover?: boolean };

export function RevisionNotesBody({
  trail,
  notes,
  resolved,
}: {
  /** Manuscript → … → the level shown (the last is current). */
  trail: string[];
  notes: readonly NoteSpec[];
  /** How many resolved notes sit behind "Show …". */
  resolved: number;
}) {
  return (
    <div className="r2-rnotes">
      <nav className="r2-rnotes-trail" aria-label="Revision Notes for">
        {trail.map((step, i) => (
          <span key={step} className="r2-rnotes-trail-step">
            {i > 0 && (
              <span aria-hidden className="r2-rnotes-trail-sep">
                /
              </span>
            )}
            <button type="button" tabIndex={-1} className="r2-rnotes-trail-link" aria-current={i === trail.length - 1 ? "location" : undefined}>
              {step}
            </button>
          </span>
        ))}
      </nav>

      <div className="r2-composer r2-rnotes-composer" data-note-composer>
        <textarea className="r2-composer-input" placeholder="Note for this scene…" rows={1} readOnly tabIndex={-1} />
        <div className="r2-composer-foot">
          <span className="r2-composer-tool">+ Add details</span>
          <span className="r2-composer-hint" aria-hidden>
            Return to add · Shift-Return for a new line
          </span>
        </div>
      </div>

      <div className="r2-rnotes-body">
        <section className="r2-rnotes-own">
          <ul role="list" className="r2-rnotes-list">
            {notes.map((n) => (
              <li key={n.id} className="r2-rnote" data-anchored={n.anchor ? "" : undefined} style={n.hover ? { background: "var(--r2-hover)" } : undefined}>
                <span className="r2-rnote-check" role="checkbox" aria-checked={false} />
                <div className="r2-rnote-main">
                  <span className="r2-rnote-body">{n.body}</span>
                  {n.details && n.expanded && <p className="r2-rnote-details">{n.details}</p>}
                  {n.anchor && (
                    <div className="r2-rnote-anchor">
                      <span className="r2-rnote-excerpt">“{n.anchor}”</span>
                    </div>
                  )}
                </div>
                <span className="r2-rnote-actions">
                  {n.details && (
                    <span className="r2-icon-button r2-icon-button--xs" data-always="">
                      <ChevronDown {...ICON_SM} aria-hidden />
                    </span>
                  )}
                  <span className="r2-icon-button r2-icon-button--xs">
                    <Trash2 {...ICON} aria-hidden />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {resolved > 0 && (
        <p className="r2-rnotes-resolved-toggle">
          <span className="r2-panel-link">{resolved === 1 ? "Show 1 resolved note" : `Show ${resolved} resolved notes`}</span>
        </p>
      )}
    </div>
  );
}

// ── Inspector ──────────────────────────────────────────────────────────────

export function InspectorHead({ kind, title, place, facts, more = [] }: { kind: string; title: string; place: string[]; facts: string[]; more?: string[] }) {
  return (
    <header className="r2-insp-head">
      <p className="r2-insp-kind">{kind}</p>
      <p className="r2-insp-title">{title}</p>
      {place.length > 0 && (
        <p className="r2-insp-place">
          {place.map((p, i) => (
            <span key={p} className="r2-insp-place-step">
              {i > 0 && (
                <span aria-hidden className="r2-insp-place-sep">
                  /
                </span>
              )}
              <span className="r2-insp-place-link">{p}</span>
            </span>
          ))}
        </p>
      )}
      {facts.length > 0 && (
        <p className="r2-insp-facts">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </p>
      )}
      {more.map((line) => (
        <p key={line} className="r2-insp-more">
          {line}
        </p>
      ))}
    </header>
  );
}

export function InspectorSection({ title, aside, caption, children }: { title: string; aside?: ReactNode; caption?: string; children: ReactNode }) {
  return (
    <section className="r2-insp-section" aria-label={title}>
      <header className="r2-insp-section-head">
        <h3 className="r2-insp-label">{title}</h3>
        {aside && <span className="r2-insp-aside">{aside}</span>}
      </header>
      {caption && <p className="r2-insp-caption">{caption}</p>}
      {children}
    </section>
  );
}

export type PropertySpec =
  | { name: string; type: "relationship"; value: string[]; hover?: string }
  | { name: string; type: "select" | "status" | "multi_select"; value: string[] }
  | { name: string; type: "text" | "number"; value: string };

const TYPE_ICON: Record<PropertySpec["type"], LucideIcon> = {
  relationship: Link2,
  select: CircleDot,
  multi_select: CircleDot,
  status: CircleDashed,
  text: Type,
  number: Hash,
};

/** PropertyFields' rows (ItemProperties / PropertyRow / PropertyValueEditor), drawn. */
export function PropertyList({ properties }: { properties: readonly PropertySpec[] }) {
  return (
    <dl className="r2-props-list">
      {properties.map((p) => {
        const Icon = TYPE_ICON[p.type];
        return (
          <div key={p.name} className="r2-prop">
            <dt className="r2-prop-label">
              <Icon {...ICON_SM} aria-hidden className="r2-prop-label-icon" />
              <span className="r2-prop-label-text">{p.name}</span>
              <span className="r2-prop-edit">
                <Pencil {...ICON_SM} aria-hidden />
              </span>
            </dt>
            <dd className="r2-prop-value">
              {p.type === "relationship" ? (
                <div className="r2-prop-choice r2-prop-relation">
                  <span className="r2-prop-links">
                    {p.value.map((t) => (
                      <button
                        key={t}
                        type="button"
                        tabIndex={-1}
                        className="r2-prop-link"
                        style={p.hover === t ? { background: "var(--r2-hover)", textDecorationColor: "currentColor" } : undefined}
                      >
                        {t}
                      </button>
                    ))}
                  </span>
                </div>
              ) : p.type === "text" || p.type === "number" ? (
                <textarea className="r2-prop-input" rows={1} readOnly tabIndex={-1} value={p.value} data-type={p.type} />
              ) : (
                <div className="r2-prop-choice">
                  <button type="button" tabIndex={-1} className="r2-prop-button">
                    <span className="r2-prop-options" data-type={p.type}>
                      {(p.value as string[]).map((v) => (
                        <span key={v} className="r2-prop-option">
                          {v}
                        </span>
                      ))}
                    </span>
                  </button>
                </div>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function SceneProperties({ properties }: { properties: readonly PropertySpec[] }) {
  return (
    <InspectorSection title="Scene properties" aside={<span className="r2-insp-aside-note">For every scene</span>}>
      <div className="r2-scene-props">
        <section className="r2-props" aria-label="Properties">
          <PropertyList properties={properties} />
        </section>
      </div>
    </InspectorSection>
  );
}

export function HistorySection({ versions }: { versions: readonly { when: string; words: string }[] }) {
  return (
    <InspectorSection title="History" caption="Kept automatically as you write." aside={<span className="r2-insp-aside-link">All versions</span>}>
      <ul className="r2-versions" aria-label="Recent versions">
        {versions.map((v) => (
          <li key={v.when}>
            <span className="r2-version">
              <span className="r2-version-when">{v.when}</span>
              <span className="r2-version-words">{v.words}</span>
            </span>
          </li>
        ))}
      </ul>
    </InspectorSection>
  );
}

export function MilestonesSection({ milestones }: { milestones: readonly { name: string; meta: string }[] }) {
  return (
    <InspectorSection title="Milestones" caption="Named manuscript snapshots that hold this scene.">
      <ul className="r2-milestone-list">
        {milestones.map((m) => (
          <li key={m.name}>
            <span className="r2-milestone-item">
              <Flag className="r2-milestone-flag" {...ICON_SM} aria-hidden />
              <span className="r2-milestone-text">
                <span className="r2-milestone-name">{m.name}</span>
                <span className="r2-milestone-meta">{m.meta}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </InspectorSection>
  );
}

export function ConnectionsSection({
  related = [],
  backlinks = [],
}: {
  related?: readonly { title: string; hint: string }[];
  backlinks?: readonly { title: string; hint: string }[];
}) {
  const list = (items: readonly { title: string; hint: string }[]) => (
    <ul className="r2-links-list">
      {items.map((r) => (
        <li key={r.title}>
          <span className="r2-link">
            <span className="r2-link-title">{r.title}</span>
            <span className="r2-link-hint">{r.hint}</span>
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <InspectorSection
      title="Connections"
      aside={
        <span className="r2-links-add">
          <span className="r2-insp-aside-link">
            <Link2 {...ICON_SM} aria-hidden />
            Link to…
          </span>
        </span>
      }
    >
      <div className="r2-links">
        {related.length > 0 && <h4 className="r2-links-sub">Related</h4>}
        {related.length > 0 && list(related)}
        {related.length === 0 && backlinks.length === 0 && <p className="r2-insp-empty">Not linked to anything yet.</p>}
        {backlinks.length > 0 && <h4 className="r2-links-sub">Referenced by</h4>}
        {backlinks.length > 0 && list(backlinks)}
      </div>
    </InspectorSection>
  );
}

