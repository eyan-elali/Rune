"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import {
  filterOpLabel,
  filterOpsFor,
  groupableProperties,
  hiddenProperties,
  newViewName,
  shownProperties,
  sortableProperties,
  VIEW_TYPE_LABEL,
  VIEW_TYPES,
  withPropertyMoved,
  withPropertyShown,
} from "@/lib/rune2/collectionViews";
import type { CollectionProperty, CollectionViewConfig, CollectionViewType, ViewFilter, ViewFilterOp, WorkspaceCollectionView } from "@/lib/types";
import { useViewStore } from "./ViewStore";

// The quiet controls of a Collection's saved Views (migration 027):
//   ViewSwitcher — the Views by name, as words in a row, once there are two
//   AddViewMenu  — List, Table or Board, each with one line saying what it is
//   ViewOptions  — one View's name, type, order, shown properties, sort,
//                  filters and (a Board) grouping; opened inline like the
//                  property settings, never a dialog
// Everything here is configuration; nothing edits an Entry or a value, and
// deleting a View says so.

/** What a View is doing beyond showing everything: "Sorted · 2 filters". Empty when nothing. */
export function viewSummary(view: WorkspaceCollectionView, properties: readonly CollectionProperty[]): string {
  const known = new Set(properties.map((p) => p.id));
  const filters = view.config.filters.filter((f) => known.has(f.property)).length;
  const sorted = view.config.sort && (view.config.sort.by === "title" || known.has(view.config.sort.by));
  return [sorted && "Sorted", filters > 0 && `${filters} ${filters === 1 ? "filter" : "filters"}`].filter(Boolean).join(" · ");
}

function useNotice(ms = 5000) {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), ms);
    return () => clearTimeout(timer);
  }, [notice, ms]);
  return [notice, setNotice] as const;
}

// ── Switcher ────────────────────────────────────────────────────────────────

export function ViewSwitcher({
  collectionId,
  views,
  active,
}: {
  collectionId: string;
  views: WorkspaceCollectionView[];
  active: WorkspaceCollectionView;
}) {
  const { setActiveView } = useViewStore();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const to = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? views.length - 1 : -2;
    if (to === -2) return;
    e.preventDefault();
    const target = views[Math.max(0, Math.min(views.length - 1, to))];
    setActiveView(collectionId, target.id);
    (e.currentTarget.parentElement?.children[views.indexOf(target)] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="r2-view-switcher" role="tablist" aria-label="Views">
      {views.map((v, at) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          className="r2-view-tab"
          aria-selected={v.id === active.id}
          tabIndex={v.id === active.id ? 0 : -1}
          title={`${VIEW_TYPE_LABEL[v.type]} view`}
          onClick={() => setActiveView(collectionId, v.id)}
          onKeyDown={(e) => onKey(e, at)}
        >
          {v.name}
        </button>
      ))}
    </div>
  );
}

// ── Add a View ──────────────────────────────────────────────────────────────

const VIEW_TYPE_HINT: Record<CollectionViewType, string> = {
  list: "Names, with a quiet line of details",
  table: "Rows and columns, edited in place",
  board: "Columns by a Status or Select property",
};

export function AddViewMenu({
  collectionId,
  properties,
  compact,
}: {
  collectionId: string;
  properties: CollectionProperty[];
  /** Icon only (beside a switcher). */
  compact: boolean;
}) {
  const { createView } = useViewStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useNotice();
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = async (type: CollectionViewType) => {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    const groupable = groupableProperties(properties);
    const group = groupable.find((p) => p.type === "status") ?? groupable[0];
    const error = await createView(collectionId, type, newViewName(type, group));
    setBusy(false);
    if (error) setNotice("Couldn’t add the view.");
  };

  return (
    <div ref={ref} className="r2-view-add">
      <button
        ref={button}
        type="button"
        className="r2-collection-tool"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={compact ? "Add a view" : undefined}
        title="Add a view: list, table or board"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        <Plus size={13} strokeWidth={1.75} aria-hidden />
        {!compact && "Add view"}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="r2-view-menu"
          onKeyDown={(e) => {
            const items = [...(e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
            const at = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              button.current?.focus();
            } else if (e.key === "Tab") {
              setOpen(false);
            }
          }}
        >
          {VIEW_TYPES.map((type, i) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              autoFocus={i === 0}
              className="r2-view-menu-item"
              onClick={() => void choose(type)}
            >
              <span className="r2-view-menu-name">{VIEW_TYPE_LABEL[type]}</span>
              <span className="r2-view-menu-hint">{VIEW_TYPE_HINT[type]}</span>
            </button>
          ))}
        </div>
      )}
      {notice && (
        <span role="status" className="r2-view-add-notice">
          {notice}
        </span>
      )}
    </div>
  );
}

// ── Options ─────────────────────────────────────────────────────────────────

const SHOWN_LABEL: Record<CollectionViewType, string> = {
  list: "Details",
  table: "Columns",
  board: "On cards",
};

/** A new filter on `property`: its first option for a choice, otherwise "not empty". */
function newFilter(property: CollectionProperty): ViewFilter {
  const ops = filterOpsFor(property);
  if (ops[0] === "is" && property.options[0]) return { property: property.id, op: "is", value: property.options[0].id };
  return { property: property.id, op: ops.includes("is") ? "is_not_empty" : ops[0] as "is_empty" | "is_not_empty" };
}

/** `filter` with a new op (keeping or choosing a value as the op needs). */
function withOp(filter: ViewFilter, property: CollectionProperty, op: ViewFilterOp): ViewFilter | null {
  if (op === "is" || op === "is_not") {
    const value = "value" in filter ? filter.value : property.options[0]?.id;
    return value ? { property: filter.property, op, value } : null;
  }
  return { property: filter.property, op };
}

export function ViewOptions({
  view,
  views,
  properties,
  onDeleted,
}: {
  view: WorkspaceCollectionView;
  views: WorkspaceCollectionView[];
  properties: CollectionProperty[];
  onDeleted: () => void;
}) {
  const { updateView, moveView, deleteView } = useViewStore();
  const [notice, setNotice] = useNotice(6000);
  const [name, setName] = useState(view.name);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const at = views.findIndex((v) => v.id === view.id);
  const shown = shownProperties(view, properties);
  const hidden = hiddenProperties(view, properties);
  const byId = new Map(properties.map((p) => [p.id, p]));
  const groupable = groupableProperties(properties);
  const sortable = sortableProperties(properties);
  const config = view.config;

  const save = async (next: CollectionViewConfig) => {
    const error = await updateView(view, { config: next });
    if (error) setNotice("That change couldn’t be saved.");
  };

  const rename = async () => {
    const next = name.trim();
    if (!next || next === view.name) {
      setName(view.name);
      return;
    }
    const error = await updateView(view, { name: next });
    if (error) {
      setName(view.name);
      setNotice("The name couldn’t be saved.");
    }
  };

  const remove = async () => {
    setBusy(true);
    const error = await deleteView(view);
    setBusy(false);
    setConfirming(false);
    if (error) setNotice("The view couldn’t be deleted.");
    else onDeleted();
  };

  return (
    <section className="r2-schema r2-view-options" aria-label={`Settings for the ${view.name} view`}>
      <div className="r2-view-head">
        <label htmlFor={`${ids}-name`} className="sr-only">
          View name
        </label>
        <input
          id={`${ids}-name`}
          className="r2-schema-name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void rename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setName(view.name);
              requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
            }
          }}
        />
        <select
          className="r2-schema-type"
          aria-label="Show as"
          value={view.type}
          onChange={async (e) => {
            const error = await updateView(view, { type: e.target.value as CollectionViewType });
            if (error) setNotice("That change couldn’t be saved.");
          }}
        >
          {VIEW_TYPES.map((t) => (
            <option key={t} value={t}>
              {VIEW_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        {views.length > 1 && (
          <span className="r2-schema-actions">
            <button
              type="button"
              className="r2-icon-button"
              aria-label={`Move ${view.name} left`}
              disabled={at <= 0}
              onClick={() => void moveView(view, at - 1)}
            >
              <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className="r2-icon-button"
              aria-label={`Move ${view.name} right`}
              disabled={at >= views.length - 1}
              onClick={() => void moveView(view, at + 1)}
            >
              <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className="r2-icon-button"
              aria-label={`Delete the ${view.name} view`}
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </span>
        )}
      </div>

      {confirming && (
        <div className="r2-schema-confirm r2-view-confirm" role="group" aria-label="Delete this view">
          <p>
            Delete the “{view.name}” view? Only this way of showing the collection goes — every entry and its values
            stay, and the other views are unchanged.
          </p>
          <button type="button" className="r2-button r2-button--danger" disabled={busy} onClick={() => void remove()}>
            Delete view
          </button>
          <button type="button" className="r2-button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}

      <dl className="r2-view-settings">
        {view.type === "board" && (
          <div className="r2-view-setting">
            <dt id={`${ids}-group`}>Columns by</dt>
            <dd>
              {groupable.length > 0 ? (
                <select
                  className="r2-schema-type"
                  aria-labelledby={`${ids}-group`}
                  value={config.group_by ?? ""}
                  onChange={(e) => void save({ ...config, group_by: e.target.value || null })}
                >
                  {config.group_by === null && <option value="">Choose a property</option>}
                  {groupable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="r2-view-muted">Add a Status or Select property to group by.</span>
              )}
            </dd>
          </div>
        )}

        <div className="r2-view-setting">
          <dt>{SHOWN_LABEL[view.type]}</dt>
          <dd>
            {properties.length === 0 ? (
              <span className="r2-view-muted">No properties yet.</span>
            ) : (
              <ul className="r2-view-props">
                {shown.map((p, i) => (
                  <li key={p.id}>
                    <span className="r2-view-prop-name">{p.name}</span>
                    <span className="r2-schema-actions">
                      <button
                        type="button"
                        className="r2-icon-button"
                        aria-label={`Move ${p.name} up`}
                        disabled={i === 0}
                        onClick={() => void save(withPropertyMoved(config, p.id, -1))}
                      >
                        <ArrowUp size={13} strokeWidth={1.75} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="r2-icon-button"
                        aria-label={`Move ${p.name} down`}
                        disabled={i === shown.length - 1}
                        onClick={() => void save(withPropertyMoved(config, p.id, 1))}
                      >
                        <ArrowDown size={13} strokeWidth={1.75} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="r2-icon-button"
                        aria-pressed
                        aria-label={`Hide ${p.name}`}
                        title="Shown — click to hide"
                        onClick={() => void save(withPropertyShown(config, p.id, false))}
                      >
                        <Eye size={13} strokeWidth={1.75} aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
                {hidden.map((p) => (
                  <li key={p.id} data-hidden="">
                    <span className="r2-view-prop-name">{p.name}</span>
                    <span className="r2-schema-actions">
                      <button
                        type="button"
                        className="r2-icon-button"
                        aria-pressed={false}
                        aria-label={`Show ${p.name}`}
                        title="Hidden — click to show"
                        onClick={() => void save(withPropertyShown(config, p.id, true))}
                      >
                        <EyeOff size={13} strokeWidth={1.75} aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>

        <div className="r2-view-setting">
          <dt id={`${ids}-sort`}>Sort</dt>
          <dd className="r2-view-inline">
            <select
              className="r2-schema-type"
              aria-labelledby={`${ids}-sort`}
              value={config.sort?.by ?? ""}
              onChange={(e) =>
                void save({
                  ...config,
                  sort: e.target.value ? { by: e.target.value, direction: config.sort?.direction ?? "asc" } : null,
                })
              }
            >
              <option value="">Order created</option>
              <option value="title">Name</option>
              {sortable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {config.sort && (
              <select
                className="r2-schema-type"
                aria-label="Direction"
                value={config.sort.direction}
                onChange={(e) =>
                  config.sort && void save({ ...config, sort: { ...config.sort, direction: e.target.value as "asc" | "desc" } })
                }
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            )}
          </dd>
        </div>

        <div className="r2-view-setting">
          <dt>Filter</dt>
          <dd>
            {config.filters.length > 0 && (
              <ul className="r2-view-filters">
                {config.filters.map((f, i) => {
                  const property = byId.get(f.property);
                  if (!property) return null;
                  const replace = (next: ViewFilter | null) =>
                    next && void save({ ...config, filters: config.filters.map((x, j) => (j === i ? next : x)) });
                  return (
                    <li key={i} className="r2-view-inline">
                      <select
                        className="r2-schema-type"
                        aria-label="Property"
                        value={property.id}
                        onChange={(e) => {
                          const p = byId.get(e.target.value);
                          if (p) replace(newFilter(p));
                        }}
                      >
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="r2-schema-type"
                        aria-label="Condition"
                        value={f.op}
                        onChange={(e) => replace(withOp(f, property, e.target.value as ViewFilterOp))}
                      >
                        {filterOpsFor(property)
                          .filter((op) => (op !== "is" && op !== "is_not") || property.options.length > 0)
                          .map((op) => (
                            <option key={op} value={op}>
                              {filterOpLabel(property, op)}
                            </option>
                          ))}
                      </select>
                      {"value" in f && (
                        <select
                          className="r2-schema-type"
                          aria-label="Option"
                          value={f.value}
                          onChange={(e) => replace({ ...f, value: e.target.value })}
                        >
                          {property.options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        className="r2-icon-button"
                        aria-label="Remove this filter"
                        onClick={() => void save({ ...config, filters: config.filters.filter((_, j) => j !== i) })}
                      >
                        <X size={13} strokeWidth={1.75} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {properties.length > 0 ? (
              config.filters.length < 20 && (
                <button
                  type="button"
                  className="r2-prop-add"
                  onClick={() => void save({ ...config, filters: [...config.filters, newFilter(properties[0])] })}
                >
                  <Plus size={13} strokeWidth={1.75} aria-hidden />
                  Add a filter
                </button>
              )
            ) : (
              <span className="r2-view-muted">Filters use properties.</span>
            )}
          </dd>
        </div>
      </dl>

      {notice && (
        <p role="status" className="r2-doc-note">
          {notice}
        </p>
      )}
    </section>
  );
}
