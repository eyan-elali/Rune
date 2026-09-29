"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  Eye,
  EyeOff,
  List,
  Plus,
  Table2,
  Trash2,
  X,
} from "lucide-react";
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
import { parseNumberInput } from "@/lib/rune2/collectionProperties";
import { candidates, targetSpecOf } from "@/lib/rune2/references";
import type { CollectionViewConfig, CollectionViewType, PropertyDefinition, SavedView, ViewFilter, ViewFilterOp } from "@/lib/types";
import { useRune2Selection } from "./Rune2Selection";
import { useViewStore } from "./ViewStore";

// The quiet controls of saved Views — a Collection's (migration 027) and a
// Manuscript's Scene Views (032), whose owner is passed as `ownerId`:
//   ViewSwitcher — the Views as a local tab row, once there are two
//   AddViewMenu  — List, Table or Board, each with one line saying what it is
//   ViewOptions  — one View's name, type, order, shown properties, sort,
//                  filters and (a Board) grouping; opened inline like the
//                  property settings, never a dialog
// Everything here is configuration; nothing edits an item or a value, and
// deleting a View says so.

/** What a View is doing beyond showing everything: "Sorted · 2 filters". Empty when nothing. */
export function viewSummary(view: SavedView, properties: readonly PropertyDefinition[]): string {
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

// ── Tabs ────────────────────────────────────────────────────────────────────
//
// An owner's saved Views as a local tab row — different representations of
// the one Collection (or Manuscript), never working-set tabs: switching
// changes only which View it shows. The row's order is the Views' saved order: drag
// a tab, or Alt with ←/→, to move it (move_workspace_collection_view).
// Double-clicking a tab opens its settings. `+` at the end adds a View.

const VIEW_ICON: Record<CollectionViewType, typeof List> = { list: List, table: Table2, board: Columns3 };
const TAB_DRAG = "application/x-rune-view";

export function ViewSwitcher({
  ownerId,
  views,
  active,
  onEdit,
  children,
}: {
  ownerId: string;
  views: SavedView[];
  active: SavedView;
  /** Opens the settings of the (now active) View. */
  onEdit?: () => void;
  /** At the end of the row: the `+`. */
  children?: ReactNode;
}) {
  const { setActiveView, moveView } = useViewStore();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const focusTab = (id: string) =>
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-view-tab="${CSS.escape(id)}"]`)?.focus());

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const to = at + (e.key === "ArrowLeft" ? -1 : 1);
      if (to < 0 || to >= views.length) return;
      e.preventDefault();
      void moveView(views[at], to);
      focusTab(views[at].id);
      return;
    }
    const to = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? views.length - 1 : -2;
    if (to === -2) return;
    e.preventDefault();
    const target = views[Math.max(0, Math.min(views.length - 1, to))];
    setActiveView(ownerId, target.id);
    focusTab(target.id);
  };

  return (
    <div className="r2-view-tabs">
      <p id={`${ownerId}-tabs-hint`} className="sr-only">
        Alt and the left or right arrow move a view. Double-click a view for its settings.
      </p>
      <div className="r2-view-switcher" role="tablist" aria-label="Views" aria-describedby={`${ownerId}-tabs-hint`}>
        {views.map((v, at) => {
          const Icon = VIEW_ICON[v.type];
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              className="r2-view-tab"
              data-view-tab={v.id}
              aria-selected={v.id === active.id}
              tabIndex={v.id === active.id ? 0 : -1}
              data-dragging={dragging === v.id || undefined}
              data-drop={over === at && dragging !== null && dragging !== v.id ? (views.findIndex((x) => x.id === dragging) < at ? "after" : "before") : undefined}
              title={`${VIEW_TYPE_LABEL[v.type]} view`}
              draggable
              onClick={() => setActiveView(ownerId, v.id)}
              onDoubleClick={() => {
                setActiveView(ownerId, v.id);
                onEdit?.();
              }}
              onKeyDown={(e) => onKey(e, at)}
              onDragStart={(e) => {
                e.dataTransfer.setData(TAB_DRAG, v.id);
                e.dataTransfer.effectAllowed = "move";
                setDragging(v.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(TAB_DRAG)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== at) setOver(at);
              }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(TAB_DRAG);
                setDragging(null);
                setOver(null);
                const moved = views.find((x) => x.id === id);
                if (!moved || moved.id === v.id) return;
                e.preventDefault();
                void moveView(moved, at);
              }}
            >
              <Icon size={12} strokeWidth={1.75} aria-hidden className="r2-view-tab-icon" />
              {v.name}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

// ── Add a View ──────────────────────────────────────────────────────────────

const VIEW_TYPE_HINT: Record<CollectionViewType, string> = {
  list: "Names, with a quiet line of details",
  table: "Rows and columns, edited in place",
  board: "Columns by a Status, Select or Relationship",
};

export function AddViewMenu({
  ownerId,
  properties,
  compact,
}: {
  ownerId: string;
  properties: PropertyDefinition[];
  /** Icon only (the `+` at the end of the tab row). */
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
    const error = await createView(ownerId, type, newViewName(type, group));
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
        data-compact={compact || undefined}
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

/** The choices an "is" filter on `property` offers: its options, or a Relationship's possible targets. */
function useFilterChoices() {
  const { index } = useRune2Selection();
  return (property: PropertyDefinition): { id: string; name: string }[] => {
    if (property.type !== "relationship") return property.options;
    const spec = targetSpecOf(property);
    return spec ? candidates(index, spec).map((c) => ({ id: c.id, name: c.title })) : [];
  };
}

/**
 * A new filter on `property`: its first choice for a choice or Relationship
 * (when it has one), a threshold of 0 for a number, today for a date, and
 * otherwise "not empty" (a read-only field has no empty filter).
 */
function newFilter(property: PropertyDefinition, choices: { id: string }[]): ViewFilter | null {
  for (const op of filterOpsFor(property)) {
    const next = withOp({ property: property.id, op: "is_not_empty" }, property, op, choices);
    if (next && (op !== "is" || choices.length)) return next;
  }
  return null;
}

/** `filter` with a new op (keeping or choosing a value as the op needs), or null when none fits. */
function withOp(filter: ViewFilter, property: PropertyDefinition, op: ViewFilterOp, choices: { id: string }[]): ViewFilter | null {
  const kept = "value" in filter ? filter.value : undefined;
  switch (op) {
    case "is":
    case "is_not": {
      const value = typeof kept === "string" && choices.some((c) => c.id === kept) ? kept : choices[0]?.id;
      return value ? { property: filter.property, op, value } : null;
    }
    case "contains":
      return { property: filter.property, op, value: filter.op === "contains" ? filter.value : "" };
    case "gt":
    case "lt": {
      if (property.type === "date") {
        const value = typeof kept === "string" && /^\d{4}-\d{2}-\d{2}$/.test(kept) ? kept : new Date().toISOString().slice(0, 10);
        return { property: filter.property, op, value };
      }
      return { property: filter.property, op, value: typeof kept === "number" ? kept : 0 };
    }
    default:
      return { property: filter.property, op };
  }
}

/** A filter's value: a choice, some text, a number or a date — committed when the writer leaves it. */
function FilterValue({
  filter,
  property,
  choices,
  onChange,
}: {
  filter: ViewFilter;
  property: PropertyDefinition;
  choices: { id: string; name: string }[];
  onChange: (next: ViewFilter) => void;
}) {
  const [draft, setDraft] = useState("value" in filter ? String(filter.value) : "");
  if (!("value" in filter)) return null;
  if (filter.op === "is" || filter.op === "is_not") {
    return (
      <select
        className="r2-schema-type"
        aria-label={property.type === "relationship" ? "Item" : "Option"}
        value={filter.value}
        onChange={(e) => onChange({ ...filter, value: e.target.value })}
      >
        {!choices.some((c) => c.id === filter.value) && <option value={filter.value}>An item in Trash</option>}
        {choices.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
  }
  const commit = () => {
    if (filter.op === "contains") {
      if (draft.trim() && draft.trim() !== filter.value) onChange({ ...filter, value: draft.trim() });
      else setDraft(filter.value);
      return;
    }
    if (filter.op !== "gt" && filter.op !== "lt") return;
    if (property.type === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(draft) && draft !== filter.value) onChange({ ...filter, value: draft });
      else setDraft(String(filter.value));
      return;
    }
    const n = parseNumberInput(draft);
    if (n !== null && n !== filter.value) onChange({ ...filter, value: n });
    else setDraft(String(filter.value));
  };
  return (
    <input
      className="r2-schema-type r2-view-filter-input"
      aria-label={filter.op === "contains" ? "Text" : property.type === "date" ? "Date" : "Number"}
      type={property.type === "date" && filter.op !== "contains" ? "date" : "text"}
      inputMode={property.type === "number" ? "decimal" : undefined}
      placeholder={filter.op === "contains" ? "Some words…" : undefined}
      maxLength={200}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export function ViewOptions({
  view,
  views,
  properties,
  onDeleted,
  naturalOrder = "Order created",
  itemNoun = "entry",
}: {
  view: SavedView;
  views: SavedView[];
  properties: PropertyDefinition[];
  onDeleted: () => void;
  /** How `sort: null` reads: "Order created" (Entries), "Manuscript order" (Scenes). */
  naturalOrder?: string;
  /** "entry", "scene": what the View shows, for its delete question. */
  itemNoun?: string;
}) {
  const { updateView, moveView, deleteView } = useViewStore();
  const choicesOf = useFilterChoices();
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
            Delete the “{view.name}” view? Only this way of showing them goes — every {itemNoun} and its values stay,
            and the other views are unchanged.
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
                <span className="r2-view-muted">Add a Status, Select or Relationship property to group by.</span>
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
              <option value="">{naturalOrder}</option>
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
                  const choices = choicesOf(property);
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
                          if (p) replace(newFilter(p, choicesOf(p)));
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
                        onChange={(e) => replace(withOp(f, property, e.target.value as ViewFilterOp, choices))}
                      >
                        {filterOpsFor(property)
                          .filter((op) => (op !== "is" && op !== "is_not") || choices.length > 0 || f.op === op)
                          .map((op) => (
                            <option key={op} value={op}>
                              {filterOpLabel(property, op)}
                            </option>
                          ))}
                      </select>
                      {/* A fresh field per filter kind, so a draft never carries over. */}
                      <FilterValue key={`${f.property}-${f.op}`} filter={f} property={property} choices={choices} onChange={replace} />
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
                  onClick={() => {
                    const first = properties.map((p) => newFilter(p, choicesOf(p))).find((f) => f !== null);
                    if (first) void save({ ...config, filters: [...config.filters, first] });
                  }}
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
