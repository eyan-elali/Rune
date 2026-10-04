"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Ellipsis,
  Eye,
  EyeOff,
  GitCommitHorizontal,
  Layers2,
  List,
  ListFilter,
  Plus,
  Rows3,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { useFloating } from "./useFloating";
import { ICON, ICON_SM } from "./icons";
import {
  filterOpLabel,
  filterOpsFor,
  groupableProperties,
  hiddenProperties,
  isSceneView,
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
import { axisProperties, MANUSCRIPT_AXIS } from "@/lib/rune2/timelineViews";
import type {
  CollectionViewConfig,
  CollectionViewType,
  PropertyDefinition,
  SavedView,
  ViewFilter,
  ViewFilterOp,
} from "@/lib/types";
import { useRune2Selection } from "./Rune2Selection";
import { useViewStore } from "./ViewStore";

// The quiet controls of saved Views — a Collection's (migration 027) and a
// Manuscript's Scene Views (032), whose owner is passed as `ownerId`:
//   ViewSwitcher — the Views as a local row of text tabs, the active one
//                  underlined on the row's hairline
//   AddViewMenu  — List, Table, Board or Timeline, each with one line saying what it is
//   ViewToolbar  — one compact row of the active View's own controls (Milestone
//                  21E): Filter, Sort, Group (a Board's columns, a Timeline's
//                  axis and lanes), Search, Properties (what the View shows)
//                  and the View's settings (name, kind, order, delete); each
//                  opens a small popover under its control, one at a time.
// Everything here is configuration; nothing edits an item or a value, and
// deleting a View says so. Search is the one thing not saved: a quick find
// on names for this sitting, cleared when the control closes.

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

const VIEW_ICON: Record<CollectionViewType, typeof List> = {
  list: List,
  table: Table2,
  board: Columns3,
  timeline: GitCommitHorizontal,
};
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
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-view-tab="${CSS.escape(id)}"]`)
        ?.focus(),
    );

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const to = at + (e.key === "ArrowLeft" ? -1 : 1);
      if (to < 0 || to >= views.length) return;
      e.preventDefault();
      void moveView(views[at], to);
      focusTab(views[at].id);
      return;
    }
    const to =
      e.key === "ArrowRight"
        ? at + 1
        : e.key === "ArrowLeft"
          ? at - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? views.length - 1
              : -2;
    if (to === -2) return;
    e.preventDefault();
    const target = views[Math.max(0, Math.min(views.length - 1, to))];
    setActiveView(ownerId, target.id);
    focusTab(target.id);
  };

  // The tabs scroll sideways in a strip of their own when there are many;
  // the `+` (and its menu) sits beside the strip, never inside it, so the
  // menu is never clipped.
  return (
    <div className="r2-view-tabs">
      <p id={`${ownerId}-tabs-hint`} className="sr-only">
        Alt and the left or right arrow move a view. Double-click a view for its
        settings.
      </p>
      <div className="r2-view-strip">
        <div
          className="r2-view-switcher"
          role="tablist"
          aria-label="Views"
          aria-describedby={`${ownerId}-tabs-hint`}
        >
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
                data-drop={
                  over === at && dragging !== null && dragging !== v.id
                    ? views.findIndex((x) => x.id === dragging) < at
                      ? "after"
                      : "before"
                    : undefined
                }
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
                <Icon {...ICON_SM} aria-hidden className="r2-view-tab-icon" />
                <span className="r2-view-tab-name">{v.name}</span>
              </button>
            );
          })}
        </div>
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
  timeline: "Along the manuscript, a Date or a Number",
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
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useFloating(menu, { open, anchor: () => button.current, onAway: () => setOpen(false) });

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
        className="r2-view-tab r2-view-tab--add"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={compact ? "Add a view" : undefined}
        title="Add a view: list, table, board or timeline"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        <Plus {...ICON} aria-hidden />
        {!compact && <span className="r2-view-tab-name">Add view</span>}
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          className="r2-view-menu"
          onKeyDown={(e) => {
            const items = [
              ...(e.currentTarget.querySelectorAll<HTMLElement>(
                "[role=menuitem]",
              ) ?? []),
            ];
            const at = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              items[
                (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                  items.length
              ]?.focus();
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
          {VIEW_TYPES.map((type, i) => {
            const Icon = VIEW_ICON[type];
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                autoFocus={i === 0}
                className="r2-view-menu-item"
                onClick={() => void choose(type)}
              >
                <Icon {...ICON} aria-hidden className="r2-view-menu-icon" />
                <span>
                  <span className="r2-view-menu-name">
                    {VIEW_TYPE_LABEL[type]}
                  </span>
                  <span className="r2-view-menu-hint">
                    {VIEW_TYPE_HINT[type]}
                  </span>
                </span>
              </button>
            );
          })}
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

// ── Filters: the pure bits ──────────────────────────────────────────────────

/** The choices an "is" filter on `property` offers: its options, or a Relationship's possible targets. */
function useFilterChoices() {
  const { index } = useRune2Selection();
  return (property: PropertyDefinition): { id: string; name: string }[] => {
    if (property.type !== "relationship") return property.options;
    const spec = targetSpecOf(property);
    return spec
      ? candidates(index, spec).map((c) => ({ id: c.id, name: c.title }))
      : [];
  };
}

/**
 * A new filter on `property`: its first choice for a choice or Relationship
 * (when it has one), a threshold of 0 for a number, today for a date, and
 * otherwise "not empty" (a read-only field has no empty filter).
 */
function newFilter(
  property: PropertyDefinition,
  choices: { id: string }[],
): ViewFilter | null {
  for (const op of filterOpsFor(property)) {
    const next = withOp(
      { property: property.id, op: "is_not_empty" },
      property,
      op,
      choices,
    );
    if (next && (op !== "is" || choices.length)) return next;
  }
  return null;
}

/** `filter` with a new op (keeping or choosing a value as the op needs), or null when none fits. */
function withOp(
  filter: ViewFilter,
  property: PropertyDefinition,
  op: ViewFilterOp,
  choices: { id: string }[],
): ViewFilter | null {
  const kept = "value" in filter ? filter.value : undefined;
  switch (op) {
    case "is":
    case "is_not": {
      const value =
        typeof kept === "string" && choices.some((c) => c.id === kept)
          ? kept
          : choices[0]?.id;
      return value ? { property: filter.property, op, value } : null;
    }
    case "contains":
      return {
        property: filter.property,
        op,
        value: filter.op === "contains" ? filter.value : "",
      };
    case "gt":
    case "lt": {
      if (property.type === "date") {
        const value =
          typeof kept === "string" && /^\d{4}-\d{2}-\d{2}$/.test(kept)
            ? kept
            : new Date().toISOString().slice(0, 10);
        return { property: filter.property, op, value };
      }
      return {
        property: filter.property,
        op,
        value: typeof kept === "number" ? kept : 0,
      };
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
  const [draft, setDraft] = useState(
    "value" in filter ? String(filter.value) : "",
  );
  if (!("value" in filter)) return null;
  if (filter.op === "is" || filter.op === "is_not") {
    return (
      <select
        className="r2-field r2-field--sm"
        aria-label={property.type === "relationship" ? "Item" : "Option"}
        value={filter.value}
        onChange={(e) => onChange({ ...filter, value: e.target.value })}
      >
        {!choices.some((c) => c.id === filter.value) && (
          <option value={filter.value}>An item in Trash</option>
        )}
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
      if (draft.trim() && draft.trim() !== filter.value)
        onChange({ ...filter, value: draft.trim() });
      else setDraft(filter.value);
      return;
    }
    if (filter.op !== "gt" && filter.op !== "lt") return;
    if (property.type === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(draft) && draft !== filter.value)
        onChange({ ...filter, value: draft });
      else setDraft(String(filter.value));
      return;
    }
    const n = parseNumberInput(draft);
    if (n !== null && n !== filter.value) onChange({ ...filter, value: n });
    else setDraft(String(filter.value));
  };
  return (
    <input
      className="r2-field r2-field--sm r2-view-filter-input"
      aria-label={
        filter.op === "contains"
          ? "Text"
          : property.type === "date"
            ? "Date"
            : "Number"
      }
      type={
        property.type === "date" && filter.op !== "contains" ? "date" : "text"
      }
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

// ── The toolbar ─────────────────────────────────────────────────────────────

type Tool =
  "filter" | "sort" | "group" | "axis" | "search" | "properties" | "settings";

/** An owner's request to open one of the toolbar's popovers (a tab double-clicked: settings; a Board without a grouping: its columns). */
export type ToolRequest = { tool: "settings" | "group" | "axis"; n: number };

const SHOWN_LABEL: Record<CollectionViewType, string> = {
  list: "Details",
  table: "Columns",
  board: "On cards",
  timeline: "On markers",
};

/**
 * One control of the toolbar and the popover under it. The popover is a
 * small dialog (fields, not a menu): Escape closes it and returns focus;
 * a click elsewhere closes it (the toolbar handles that, since one is open
 * at a time). `active`: the control is doing something (a sort is set, two
 * filters are on), shown in ink.
 */
function Tool({
  id,
  icon: Icon,
  label,
  title,
  active,
  open,
  onToggle,
  onClose,
  align = "start",
  wide,
  children,
}: {
  id: string;
  icon: typeof List;
  label: ReactNode;
  title: string;
  active?: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: (refocus: boolean) => void;
  align?: "start" | "end";
  wide?: boolean;
  children: ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  // Hung from the control's right edge so it opens into the page; whole in the window.
  useFloating(pop, { open, anchor: () => button.current, align: "end", gap: 4 });

  // Opened: the first field takes focus, so the keyboard carries straight on.
  useLayoutEffect(() => {
    if (!open) return;
    pop.current
      ?.querySelector<HTMLElement>("input, select, button, [tabindex]")
      ?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div className="r2-tool-wrap">
      <button
        ref={button}
        type="button"
        className="r2-tool"
        data-active={active || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={title}
        onClick={onToggle}
      >
        <Icon {...ICON} aria-hidden />
        <span className="r2-tool-label">{label}</span>
      </button>
      {open && (
        <div
          ref={pop}
          id={id}
          role="dialog"
          aria-label={title}
          className="r2-popover r2-tool-pop"
          data-align={align}
          data-wide={wide || undefined}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onClose(true);
              button.current?.focus();
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function ViewToolbar({
  view,
  views,
  properties,
  naturalOrder = "Order created",
  itemNoun = "entry",
  search,
  onSearch,
  schemaOpen,
  onToggleSchema,
  schemaLabel = "Edit properties",
  request,
  children,
}: {
  view: SavedView;
  views: SavedView[];
  properties: PropertyDefinition[];
  /** How `sort: null` reads: "Order created" (Entries), "Manuscript order" (Scenes). */
  naturalOrder?: string;
  /** "entry", "scene": what the View shows, for its delete question. */
  itemNoun?: string;
  /** The quick find on names, this sitting only. */
  search: string;
  onSearch: (query: string) => void;
  /** The owner's property settings (what properties exist), opened inline under the bar. */
  schemaOpen: boolean;
  onToggleSchema: () => void;
  schemaLabel?: string;
  /** The owner asking for one popover to open (its `n` bumped each time). */
  request?: ToolRequest;
  /** Owner-specific actions at the end of the row ("Read"). */
  children?: ReactNode;
}) {
  const { updateView, moveView, deleteView } = useViewStore();
  const choicesOf = useFilterChoices();
  const [notice, setNotice] = useNotice(6000);
  const [open, setOpen] = useState<Tool | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const ids = useId();
  const config = view.config;
  const known = new Set(properties.map((p) => p.id));
  const byId = new Map(properties.map((p) => [p.id, p]));
  const shown = shownProperties(view, properties);
  const hidden = hiddenProperties(view, properties);
  const groupable = groupableProperties(properties);
  const sortable = sortableProperties(properties);
  const axes = axisProperties(properties);
  const manuscript = isSceneView(view);
  const filters = config.filters.filter((f) => known.has(f.property));
  const sortedBy =
    config.sort &&
    (config.sort.by === "title" ? "Name" : byId.get(config.sort.by)?.name);
  const groupedBy = config.group_by ? byId.get(config.group_by) : undefined;
  const axis =
    config.axis === MANUSCRIPT_AXIS
      ? "Manuscript"
      : config.axis
        ? byId.get(config.axis)?.name
        : undefined;

  const toggle = (tool: Tool) => setOpen((o) => (o === tool ? null : tool));
  const close = () => setOpen(null);

  // A tab double-clicked: its settings. A Board asking for its grouping, a
  // Timeline for its axis: that popover.
  const seenRequest = useRef(request?.n ?? 0);
  useEffect(() => {
    if (request && request.n !== seenRequest.current) {
      seenRequest.current = request.n;
      setOpen(request.tool);
    }
  }, [request]);

  // A click anywhere else closes the open popover (the search field stays
  // while it holds a query).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return;
      setOpen((o) => (o === "search" && search ? o : null));
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, search]);

  const save = async (next: CollectionViewConfig) => {
    const error = await updateView(view, { config: next });
    if (error) setNotice("That change couldn’t be saved.");
  };

  const tool = (key: Tool) => ({
    open: open === key,
    onToggle: () => toggle(key),
    onClose: close,
  });

  return (
    <div
      ref={root}
      className="r2-toolbar"
      role="group"
      aria-label={`Controls for the ${view.name} view`}
    >
      {/* Filter */}
      <Tool
        id={`${ids}-filter`}
        icon={ListFilter}
        label={filters.length > 0 ? `Filter · ${filters.length}` : "Filter"}
        title="Which items this view shows"
        active={filters.length > 0}
        wide
        {...tool("filter")}
      >
        <p className="r2-tool-pop-title">Filter</p>
        {filters.length > 0 && (
          <ul className="r2-view-filters">
            {config.filters.map((f, i) => {
              const property = byId.get(f.property);
              if (!property) return null;
              const choices = choicesOf(property);
              const replace = (next: ViewFilter | null) =>
                next &&
                void save({
                  ...config,
                  filters: config.filters.map((x, j) => (j === i ? next : x)),
                });
              return (
                <li key={i} className="r2-view-inline">
                  <select
                    className="r2-field r2-field--sm"
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
                    className="r2-field r2-field--sm"
                    aria-label="Condition"
                    value={f.op}
                    onChange={(e) =>
                      replace(
                        withOp(
                          f,
                          property,
                          e.target.value as ViewFilterOp,
                          choices,
                        ),
                      )
                    }
                  >
                    {filterOpsFor(property)
                      .filter(
                        (op) =>
                          (op !== "is" && op !== "is_not") ||
                          choices.length > 0 ||
                          f.op === op,
                      )
                      .map((op) => (
                        <option key={op} value={op}>
                          {filterOpLabel(property, op)}
                        </option>
                      ))}
                  </select>
                  {/* A fresh field per filter kind, so a draft never carries over. */}
                  <FilterValue
                    key={`${f.property}-${f.op}`}
                    filter={f}
                    property={property}
                    choices={choices}
                    onChange={replace}
                  />
                  <button
                    type="button"
                    className="r2-icon-button"
                    aria-label="Remove this filter"
                    onClick={() =>
                      void save({
                        ...config,
                        filters: config.filters.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <X {...ICON} aria-hidden />
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
                const first = properties
                  .map((p) => newFilter(p, choicesOf(p)))
                  .find((f) => f !== null);
                if (first)
                  void save({ ...config, filters: [...config.filters, first] });
              }}
            >
              <Plus {...ICON} aria-hidden />
              Add a filter
            </button>
          )
        ) : (
          <p className="r2-view-muted">
            Filters use properties. Add one to the{" "}
            {manuscript ? "scenes" : "collection"} first.
          </p>
        )}
      </Tool>

      {/* Sort: a Timeline is placed by its axis; its sort only orders ties, so it has none here. */}
      {view.type !== "timeline" && (
        <Tool
          id={`${ids}-sort`}
          icon={ArrowUpDown}
          label={sortedBy ? `Sort · ${sortedBy}` : "Sort"}
          title="The order of the items"
          active={!!config.sort}
          {...tool("sort")}
        >
          <p className="r2-tool-pop-title">Sort by</p>
          <div className="r2-view-inline">
            <select
              className="r2-field r2-field--sm"
              aria-label="Sort by"
              value={config.sort?.by ?? ""}
              onChange={(e) =>
                void save({
                  ...config,
                  sort: e.target.value
                    ? {
                        by: e.target.value,
                        direction: config.sort?.direction ?? "asc",
                      }
                    : null,
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
              <span className="r2-tool-seg" role="group" aria-label="Direction">
                <button
                  type="button"
                  aria-pressed={config.sort.direction === "asc"}
                  onClick={() =>
                    config.sort &&
                    void save({
                      ...config,
                      sort: { ...config.sort, direction: "asc" },
                    })
                  }
                >
                  <ArrowUp {...ICON_SM} aria-hidden />
                  Ascending
                </button>
                <button
                  type="button"
                  aria-pressed={config.sort.direction === "desc"}
                  onClick={() =>
                    config.sort &&
                    void save({
                      ...config,
                      sort: { ...config.sort, direction: "desc" },
                    })
                  }
                >
                  <ArrowDown {...ICON_SM} aria-hidden />
                  Descending
                </button>
              </span>
            )}
          </div>
        </Tool>
      )}

      {/* A Timeline's axis */}
      {view.type === "timeline" && (
        <Tool
          id={`${ids}-axis`}
          icon={GitCommitHorizontal}
          label={axis ? `Along · ${axis}` : "Along"}
          title="What the items are placed along"
          active={!!axis}
          {...tool("axis")}
        >
          <p className="r2-tool-pop-title">Along</p>
          {manuscript || axes.length > 0 ? (
            <select
              className="r2-field r2-field--sm"
              aria-label="Along"
              value={config.axis ?? ""}
              onChange={(e) =>
                void save({ ...config, axis: e.target.value || null })
              }
            >
              {!config.axis && <option value="">Choose an axis</option>}
              {manuscript && (
                <option value={MANUSCRIPT_AXIS}>Manuscript position</option>
              )}
              {axes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type === "date" ? "date" : "number"})
                </option>
              ))}
            </select>
          ) : (
            <p className="r2-view-muted">
              Add a Date or Number property to place{" "}
              {itemNoun === "scene" ? "scenes" : "entries"} along.
            </p>
          )}
        </Tool>
      )}

      {/* A Board's columns, a Timeline's lanes */}
      {(view.type === "board" || view.type === "timeline") && (
        <Tool
          id={`${ids}-group`}
          icon={Layers2}
          label={
            groupedBy
              ? `${view.type === "board" ? "Columns" : "Lanes"} · ${groupedBy.name}`
              : view.type === "board"
                ? "Columns"
                : "Lanes"
          }
          title={
            view.type === "board"
              ? "The property the columns are by"
              : "The property the lanes are by"
          }
          active={!!groupedBy}
          {...tool("group")}
        >
          <p className="r2-tool-pop-title">
            {view.type === "board" ? "Columns by" : "Lanes by"}
          </p>
          {groupable.length > 0 ? (
            <select
              className="r2-field r2-field--sm"
              aria-label={view.type === "board" ? "Columns by" : "Lanes by"}
              value={config.group_by ?? ""}
              onChange={(e) =>
                void save({ ...config, group_by: e.target.value || null })
              }
            >
              {view.type === "board" ? (
                config.group_by === null && (
                  <option value="">Choose a property</option>
                )
              ) : (
                <option value="">No lanes</option>
              )}
              {groupable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="r2-view-muted">
              Add a Status, Select or Relationship property to{" "}
              {view.type === "board" ? "group by" : "make lanes"}.
            </p>
          )}
        </Tool>
      )}

      {/* Search: an inline field, not saved. */}
      <div
        className="r2-tool-wrap"
        data-search={open === "search" || search ? "" : undefined}
      >
        {open === "search" || search ? (
          <span className="r2-tool-search">
            <Search {...ICON} aria-hidden />
            <input
              autoFocus
              type="search"
              className="r2-tool-search-input"
              aria-label="Find by name"
              placeholder="Find by name…"
              maxLength={200}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  onSearch("");
                  setOpen(null);
                }
              }}
              onBlur={() => {
                if (!search) setOpen((o) => (o === "search" ? null : o));
              }}
            />
            <button
              type="button"
              className="r2-icon-button r2-icon-button--xs"
              aria-label="Clear the search"
              onClick={() => {
                onSearch("");
                setOpen(null);
              }}
            >
              <X {...ICON_SM} aria-hidden />
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="r2-tool"
            title="Find by name"
            aria-label="Find by name"
            onClick={() => setOpen("search")}
          >
            <Search {...ICON} aria-hidden />
          </button>
        )}
      </div>

      {/* Properties the View shows */}
      <Tool
        id={`${ids}-props`}
        icon={Rows3}
        label={SHOWN_LABEL[view.type]}
        title={`Which properties this ${VIEW_TYPE_LABEL[view.type].toLowerCase()} shows`}
        align="end"
        {...tool("properties")}
      >
        <p className="r2-tool-pop-title">{SHOWN_LABEL[view.type]}</p>
        {properties.length === 0 ? (
          <p className="r2-view-muted">No properties yet.</p>
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
                    onClick={() =>
                      void save(withPropertyMoved(config, p.id, -1))
                    }
                  >
                    <ArrowUp {...ICON} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="r2-icon-button"
                    aria-label={`Move ${p.name} down`}
                    disabled={i === shown.length - 1}
                    onClick={() =>
                      void save(withPropertyMoved(config, p.id, 1))
                    }
                  >
                    <ArrowDown {...ICON} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="r2-icon-button"
                    aria-pressed
                    aria-label={`Hide ${p.name}`}
                    title="Shown — click to hide"
                    onClick={() =>
                      void save(withPropertyShown(config, p.id, false))
                    }
                  >
                    <Eye {...ICON} aria-hidden />
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
                    onClick={() =>
                      void save(withPropertyShown(config, p.id, true))
                    }
                  >
                    <EyeOff {...ICON} aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="r2-prop-add"
          aria-expanded={schemaOpen}
          onClick={() => {
            close();
            onToggleSchema();
          }}
        >
          <Plus {...ICON} aria-hidden />
          {schemaLabel}
        </button>
      </Tool>

      {/* The View itself */}
      <Tool
        id={`${ids}-settings`}
        icon={Ellipsis}
        label={<span className="sr-only">View settings</span>}
        title="This view: its name, kind and place"
        align="end"
        {...tool("settings")}
      >
        <ViewSettings
          view={view}
          views={views}
          itemNoun={itemNoun}
          onRename={async (name) => {
            const error = await updateView(view, { name });
            if (error) setNotice("The name couldn’t be saved.");
            return !error;
          }}
          onRetype={async (type) => {
            const error = await updateView(view, { type });
            if (error) setNotice("That change couldn’t be saved.");
          }}
          onMove={(to) => void moveView(view, to)}
          onDelete={async () => {
            const error = await deleteView(view);
            if (error) setNotice("The view couldn’t be deleted.");
            else close();
          }}
        />
      </Tool>

      {children}

      {notice && (
        <span role="status" className="r2-toolbar-notice">
          {notice}
        </span>
      )}
    </div>
  );
}

/** One View's own settings: its name, what it shows as, its place in the row, and the way to delete it. */
function ViewSettings({
  view,
  views,
  itemNoun,
  onRename,
  onRetype,
  onMove,
  onDelete,
}: {
  view: SavedView;
  views: SavedView[];
  itemNoun: string;
  onRename: (name: string) => Promise<boolean>;
  onRetype: (type: CollectionViewType) => Promise<void>;
  onMove: (to: number) => void;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(view.name);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const at = views.findIndex((v) => v.id === view.id);

  const rename = async () => {
    const next = name.trim();
    if (!next || next === view.name) {
      setName(view.name);
      return;
    }
    if (!(await onRename(next))) setName(view.name);
  };

  return (
    <div className="r2-view-settings">
      <label htmlFor={`${ids}-name`} className="r2-tool-pop-title">
        View name
      </label>
      <input
        id={`${ids}-name`}
        className="r2-field r2-field--sm r2-view-name"
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void rename()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <label htmlFor={`${ids}-type`} className="r2-tool-pop-title">
        Show as
      </label>
      <select
        id={`${ids}-type`}
        className="r2-field r2-field--sm"
        value={view.type}
        onChange={(e) => void onRetype(e.target.value as CollectionViewType)}
      >
        {VIEW_TYPES.map((t) => (
          <option key={t} value={t}>
            {VIEW_TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      {views.length > 1 && (
        <div className="r2-view-settings-row">
          <span className="r2-schema-actions">
            <button
              type="button"
              className="r2-icon-button"
              aria-label={`Move ${view.name} left`}
              disabled={at <= 0}
              onClick={() => onMove(at - 1)}
            >
              <ArrowLeft {...ICON} aria-hidden />
            </button>
            <button
              type="button"
              className="r2-icon-button"
              aria-label={`Move ${view.name} right`}
              disabled={at >= views.length - 1}
              onClick={() => onMove(at + 1)}
            >
              <ArrowRight {...ICON} aria-hidden />
            </button>
          </span>
          {confirming ? (
            <span className="r2-view-settings-confirm">
              <button
                type="button"
                className="r2-button r2-button--danger r2-button--sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onDelete();
                  setBusy(false);
                  setConfirming(false);
                }}
              >
                Delete view
              </button>
              <button
                type="button"
                className="r2-button r2-button--quiet r2-button--sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="r2-button r2-button--quiet r2-button--sm"
              data-tone="danger"
              onClick={() => setConfirming(true)}
            >
              <Trash2 {...ICON} aria-hidden />
              Delete view
            </button>
          )}
        </div>
      )}
      {confirming && (
        <p className="r2-view-muted">
          Only this way of showing them goes — every {itemNoun} and its values
          stay, and the other views are unchanged.
        </p>
      )}
    </div>
  );
}
