import type {
  CollectionProperty,
  CollectionViewConfig,
  CollectionViewType,
  PropertyDefinition,
  PropertyValue,
  SavedView,
  SceneView,
  ViewFilter,
  ViewFilterOp,
  WorkspaceCollectionView,
} from "@/lib/types";
import { chosenOptions, valueKey } from "./collectionProperties";

// Saved Views as the shell presents them — a Collection's over its Entries
// (migration 027) and a Manuscript's over its Scenes (032): which items a View
// shows and in what order, which properties it shows, and a Board's lanes.
// Pure — no I/O — so List, Table, Board and the tests share one set of rules,
// whoever owns the View. A View only arranges; every View reads the same items
// and the same values, so an edit made in one is already in all the others.
//
// The engine never knows what an item is. It is given item ids in their
// natural order (a Collection's creation order; a Manuscript's reading order),
// the owner's properties and one map of values. Read-only fields an owner
// offers (a Scene's word count and placement) arrive as `native` properties
// with their values in the same map, so they are shown, sorted and filtered by
// the same code and never edited.
//
// The database keeps each config pointing only at the owner's current fields
// (prune_view_config); these helpers still skip anything unknown, so a screen
// showing a moment-old config never breaks.

export const VIEW_TYPES: readonly CollectionViewType[] = ["list", "table", "board", "timeline"];

export const VIEW_TYPE_LABEL: Record<CollectionViewType, string> = {
  list: "List",
  table: "Table",
  board: "Board",
  timeline: "Timeline",
};

export const EMPTY_VIEW_CONFIG: CollectionViewConfig = { properties: [], sort: null, filters: [], group_by: null };

/** Whether a View is a Manuscript's Scene View (032) rather than a Collection's. */
export function isSceneView(view: SavedView): view is SceneView {
  return "manuscript_id" in view;
}

/** The Collection or Manuscript a View belongs to. */
export function viewOwner(view: SavedView): string {
  return isSceneView(view) ? (view.group_id ?? view.manuscript_id) : view.collection_id;
}

/** A Collection's (or Manuscript's) Views in their order. */
export function viewsOf<V extends SavedView>(views: readonly V[], ownerId: string): V[] {
  return views.filter((v) => viewOwner(v) === ownerId).sort((a, b) => a.position - b.position);
}

/**
 * The View an owner shows: the one the writer last chose (`chosenId`), if it
 * still exists — else the first. Choosing a View changes only this; the Views
 * and their items are untouched.
 */
export function activeView<V extends SavedView>(views: readonly V[], chosenId: string | undefined): V {
  return views.find((v) => v.id === chosenId) ?? views[0];
}

/** The id of the stand-in List a Collection shows before migration 027. */
export function fallbackViewId(collectionId: string): string {
  return `list:${collectionId}`;
}

/** Whether a View is an unsaved stand-in (never written to the database as it is). */
export function isFallbackView(view: SavedView): boolean {
  return view.id.startsWith("list:");
}

/**
 * Before migration 027: the Collection's List as Milestone 9 showed it — its
 * shown_in_list properties, creation order. Never saved.
 */
export function fallbackListView(collectionId: string, properties: readonly CollectionProperty[]): WorkspaceCollectionView {
  return {
    id: fallbackViewId(collectionId),
    collection_id: collectionId,
    project_id: properties[0]?.project_id ?? "",
    name: "List",
    type: "list",
    position: 1,
    config: {
      ...EMPTY_VIEW_CONFIG,
      properties: properties.filter((p) => p.shown_in_list).map((p) => p.id),
    },
    created_at: "",
    updated_at: "",
  };
}

/** The View's shown properties, in its order (unknown ids skipped). */
export function shownProperties<P extends PropertyDefinition>(view: SavedView, properties: readonly P[]): P[] {
  const byId = new Map(properties.map((p) => [p.id, p]));
  return view.config.properties.flatMap((id) => {
    const p = byId.get(id);
    return p ? [p] : [];
  });
}

/** The owner's properties the View doesn't show, in the owner's order. */
export function hiddenProperties<P extends PropertyDefinition>(view: SavedView, properties: readonly P[]): P[] {
  const shown = new Set(view.config.properties);
  return properties.filter((p) => !shown.has(p.id));
}

/** Whether a field is read-only (a Scene's word count or placement): shown, sorted, filtered — never edited or grouped by. */
export function isNative(property: PropertyDefinition): boolean {
  return "native" in property && property.native === true;
}

// ── Filters ─────────────────────────────────────────────────────────────────

/**
 * The filters a property offers:
 *   choices          is / is not (a multi-select: includes), empty, not empty
 *   Relationship     includes / doesn't include one target, empty, not empty
 *   text             contains, empty, not empty
 *   number, date     greater / less than (after / before), empty, not empty
 *   checkbox         checked / not checked
 * A read-only field has no empty filter (a Scene always has a word count and
 * a placement).
 */
export function filterOpsFor(property: PropertyDefinition): ViewFilterOp[] {
  const empties: ViewFilterOp[] = isNative(property) ? [] : ["is_not_empty", "is_empty"];
  switch (property.type) {
    case "select":
    case "status":
    case "multi_select":
      return ["is", "is_not", ...(isNative(property) ? [] : (["is_empty", "is_not_empty"] as ViewFilterOp[]))];
    case "relationship":
      return ["is", "is_not", ...empties];
    case "text":
      return ["contains", ...empties];
    case "number":
    case "date":
      return ["gt", "lt", ...empties];
    case "checkbox":
      return ["is_not_empty", "is_empty"];
  }
}

/** How a filter reads: "is", "is not", "includes", "is after", "is checked"… */
export function filterOpLabel(property: PropertyDefinition, op: ViewFilterOp): string {
  if (property.type === "checkbox") return op === "is_not_empty" ? "is checked" : "is not checked";
  const many = property.type === "multi_select" || (property.type === "relationship" && property.relation_many);
  if (many && (op === "is" || op === "is_not")) return op === "is" ? "includes" : "doesn’t include";
  if (property.type === "date" && (op === "gt" || op === "lt")) return op === "gt" ? "is after" : "is before";
  switch (op) {
    case "is":
      return "is";
    case "is_not":
      return "is not";
    case "is_empty":
      return "is empty";
    case "is_not_empty":
      return "is not empty";
    case "contains":
      return "contains";
    case "gt":
      return "is more than";
    case "lt":
      return "is less than";
  }
}

/** The ids a value names: a choice's known options, a Relationship's targets. */
function idsOf(property: PropertyDefinition, value: PropertyValue | undefined): string[] {
  if (property.type === "relationship") return Array.isArray(value) ? value : [];
  if (property.type === "select" || property.type === "status" || property.type === "multi_select") {
    return chosenOptions(property, value).map((o) => o.id);
  }
  return [];
}

/** Whether a value passes one filter. A value naming an unknown option counts as empty. */
export function matchesFilter(filter: ViewFilter, property: PropertyDefinition, value: PropertyValue | undefined): boolean {
  const ids = idsOf(property, value);
  const listed = property.type === "relationship" || property.type === "select" || property.type === "status" || property.type === "multi_select";
  const empty = listed ? ids.length === 0 : value === undefined;
  switch (filter.op) {
    case "is_empty":
      return empty;
    case "is_not_empty":
      return !empty;
    case "is":
      return ids.includes(filter.value);
    case "is_not":
      return !ids.includes(filter.value);
    case "contains":
      return typeof value === "string" && value.toLowerCase().includes(filter.value.trim().toLowerCase());
    case "gt":
    case "lt": {
      if (property.type === "number") {
        if (typeof value !== "number" || typeof filter.value !== "number") return false;
        return filter.op === "gt" ? value > filter.value : value < filter.value;
      }
      if (property.type === "date") {
        if (typeof value !== "string" || typeof filter.value !== "string") return false;
        return filter.op === "gt" ? value > filter.value : value < filter.value;
      }
      return false;
    }
  }
}

// ── Sort ────────────────────────────────────────────────────────────────────

/** Properties a View can sort by (title aside): one value each — every type but multi-select and Relationship. */
export function sortableProperties<P extends PropertyDefinition>(properties: readonly P[]): P[] {
  return properties.filter((p) => p.type !== "multi_select" && p.type !== "relationship");
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** A comparable key for a value, or null when empty (empties sort last either way). */
function sortKey(property: PropertyDefinition, value: PropertyValue | undefined): string | number | null {
  if (value === undefined) return null;
  switch (property.type) {
    case "number":
      return typeof value === "number" ? value : null;
    case "checkbox":
      return value === true ? 0 : null;
    case "select":
    case "status": {
      const at = property.options.findIndex((o) => o.id === value);
      return at === -1 ? null : at;
    }
    case "text":
    case "date":
      return typeof value === "string" ? value : null;
    case "multi_select":
    case "relationship":
      return null;
  }
}

function compareKeys(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

// ── Arranging items ─────────────────────────────────────────────────────────

export type ArrangeInput = {
  /**
   * The owner's items in their natural order: a Collection's Entries in
   * creation order; a Manuscript's Scenes in manuscript order (placed, in
   * reading order, then Unplaced). `sort: null` keeps this order.
   */
  entryIds: readonly string[];
  properties: readonly PropertyDefinition[];
  values: ReadonlyMap<string, PropertyValue>;
  /** An item's title as shown ("Untitled" included). */
  titleOf: (entryId: string) => string;
};

/**
 * The items a View shows, in its order: those passing every filter, sorted
 * by its sort (ties, and no sort, keep the natural order; empty values last).
 */
export function arrangeEntries(view: SavedView, input: ArrangeInput): string[] {
  const byId = new Map(input.properties.map((p) => [p.id, p]));
  const filters = view.config.filters.flatMap((f) => {
    const property = byId.get(f.property);
    return property ? [{ f, property }] : [];
  });
  const kept = input.entryIds.filter((id) =>
    filters.every(({ f, property }) => matchesFilter(f, property, input.values.get(valueKey(id, property.id))))
  );

  const sort = view.config.sort;
  if (!sort) return kept;
  const property = sort.by === "title" ? null : byId.get(sort.by);
  if (sort.by !== "title" && (!property || !sortableProperties([property]).length)) return kept;
  const sign = sort.direction === "desc" ? -1 : 1;
  const keyed = kept.map((id, at) => ({
    id,
    at,
    key: property ? sortKey(property, input.values.get(valueKey(id, property.id))) : input.titleOf(id),
  }));
  keyed.sort((a, b) => {
    if (a.key === null || b.key === null) {
      if (a.key === b.key) return a.at - b.at;
      return a.key === null ? 1 : -1;
    }
    return sign * compareKeys(a.key, b.key) || a.at - b.at;
  });
  return keyed.map((k) => k.id);
}

/** The same rule under the owner-neutral name. */
export const arrangeItems = arrangeEntries;

// ── Board ───────────────────────────────────────────────────────────────────

/**
 * Properties a Board can group by: select and status (one lane per option),
 * and a Relationship to a Collection's Entries (one lane per Entry). Never a
 * read-only field: moving a card sets the value it is grouped by.
 */
export function groupableProperties<P extends PropertyDefinition>(properties: readonly P[]): P[] {
  return properties.filter(
    (p) =>
      !isNative(p) &&
      (p.type === "select" || p.type === "status" || (p.type === "relationship" && p.relation_target === "entry"))
  );
}

export type BoardLane = {
  /** The option id (or, grouped by a Relationship, the target id), or null for the lane of items with no value. */
  optionId: string | null;
  name: string;
  entryIds: string[];
};

/** The name of the lane of items without a value: "No status", "No POV". */
export function emptyLaneName(property: PropertyDefinition): string {
  return property.type === "status" ? "No status" : `No ${property.name}`;
}

/** A Relationship's possible lanes: the target Collection's Entries, in its order, by current title. */
export type LaneTargets = (property: PropertyDefinition) => { id: string; name: string }[];

/**
 * A Board's lanes for arranged items: the empty lane first, then one per
 * option in the property's order — or, grouped by a Relationship, one per
 * Entry of its Collection (`laneTargets`). An item whose value names nothing
 * known is in the empty lane. An item holding several Relationship targets
 * appears in each of their lanes: it is one item, shown wherever it belongs.
 * null when the View groups by nothing usable.
 */
export function boardLanes(
  view: SavedView,
  properties: readonly PropertyDefinition[],
  values: ReadonlyMap<string, PropertyValue>,
  arranged: readonly string[],
  laneTargets: LaneTargets = () => []
): { property: PropertyDefinition; lanes: BoardLane[] } | null {
  const property = properties.find((p) => p.id === view.config.group_by);
  if (!property || !groupableProperties([property]).length) return null;
  const empty: BoardLane = { optionId: null, name: emptyLaneName(property), entryIds: [] };
  const choices = property.type === "relationship" ? laneTargets(property) : property.options;
  const lanes = choices.map((o): BoardLane => ({ optionId: o.id, name: o.name, entryIds: [] }));
  const byOption = new Map(lanes.map((l) => [l.optionId, l]));
  for (const id of arranged) {
    const value = values.get(valueKey(id, property.id));
    const ids = property.type === "relationship" ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
    const found = ids.flatMap((x) => byOption.get(x) ?? []);
    if (found.length === 0) empty.entryIds.push(id);
    for (const lane of found) lane.entryIds.push(id);
  }
  return { property, lanes: [empty, ...lanes] };
}

/**
 * The value an item takes when its card moves from one lane to another, or
 * undefined when nothing changes. It only ever changes the grouped property's
 * value — never anything else about the item, and never its place in the
 * manuscript or its Collection.
 *   select / status, a one-value Relationship: the target lane's option
 *     (or target), or none in the empty lane;
 *   a several-value Relationship: the lane it left is replaced by the lane it
 *     joins (moving into the empty lane removes only the one it left); its
 *     other targets stay.
 */
export function boardMoveValue(
  property: PropertyDefinition,
  current: PropertyValue | undefined,
  from: string | null,
  to: string | null
): PropertyValue | null | undefined {
  if (from === to) return undefined;
  if (property.type === "relationship") {
    const ids = Array.isArray(current) ? current : [];
    if (!property.relation_many) {
      if (to === null) return ids.length ? null : undefined;
      return ids.length === 1 && ids[0] === to ? undefined : [to];
    }
    const kept = ids.filter((id) => id !== from && id !== to);
    const at = from === null ? kept.length : Math.max(0, ids.indexOf(from));
    const next = to === null ? kept : [...kept.slice(0, at), to, ...kept.slice(at)];
    if (next.length === ids.length && next.every((id, i) => id === ids[i])) return undefined;
    return next.length ? next : null;
  }
  const value = typeof current === "string" ? current : null;
  if (value === to) return undefined;
  return to;
}

// ── Config edits ────────────────────────────────────────────────────────────

/** The config with `propertyId` shown (at the end) or hidden. */
export function withPropertyShown(config: CollectionViewConfig, propertyId: string, shown: boolean): CollectionViewConfig {
  const rest = config.properties.filter((id) => id !== propertyId);
  return { ...config, properties: shown ? [...rest, propertyId] : rest };
}

/** The config with a shown property moved by `delta` places among the shown ones. */
export function withPropertyMoved(config: CollectionViewConfig, propertyId: string, delta: number): CollectionViewConfig {
  const at = config.properties.indexOf(propertyId);
  if (at === -1) return config;
  const to = Math.max(0, Math.min(config.properties.length - 1, at + delta));
  if (to === at) return config;
  const next = config.properties.filter((id) => id !== propertyId);
  next.splice(to, 0, propertyId);
  return { ...config, properties: next };
}

/** A new View's name: List/Table/Timeline by type, a Board by what it groups ("By Status"). */
export function newViewName(type: CollectionViewType, groupBy: PropertyDefinition | undefined): string {
  if (type === "board" && groupBy) return `By ${groupBy.name}`;
  return VIEW_TYPE_LABEL[type];
}

/** The config with a Timeline's axis set (a field id, or null for none). */
export function withAxis(config: CollectionViewConfig, axis: string | null): CollectionViewConfig {
  return { ...config, axis };
}

// ── Table column widths (migration 034) ────────────────────────────────────
//
// One rule for every Table, a Collection's or the Manuscript's: a column is
// its saved width (config.widths, by field id, "title" for the name column),
// else a default for its type — never "as wide as the table allows". The
// database accepts 80–640 px; the app clamps to the same range, so a stored
// width is always shown as stored.

export const COLUMN_MIN_WIDTH = 80;
export const COLUMN_MAX_WIDTH = 640;
/** The name column's key in config.widths. */
export const TITLE_COLUMN = "title";

const DEFAULT_WIDTH: Record<string, number> = {
  text: 220,
  number: 104,
  select: 150,
  status: 150,
  multi_select: 200,
  date: 136,
  checkbox: 96,
  relationship: 200,
};

export function clampColumnWidth(width: number): number {
  return Math.round(Math.min(COLUMN_MAX_WIDTH, Math.max(COLUMN_MIN_WIDTH, width)));
}

/** A column's width when the View has none saved for it. */
export function defaultColumnWidth(field: PropertyDefinition | typeof TITLE_COLUMN): number {
  if (field === TITLE_COLUMN) return 260;
  if (isNative(field)) return field.type === "number" ? 96 : 120;
  return DEFAULT_WIDTH[field.type] ?? 180;
}

/** A column's width in this View: saved (clamped), else the default. */
export function columnWidth(view: SavedView, field: PropertyDefinition | typeof TITLE_COLUMN): number {
  const key = field === TITLE_COLUMN ? TITLE_COLUMN : field.id;
  const saved = view.config.widths?.[key];
  return typeof saved === "number" && Number.isFinite(saved) ? clampColumnWidth(saved) : defaultColumnWidth(field);
}

/** The config with one column's width set (clamped) — or, with null, back to its default. */
export function withColumnWidth(config: CollectionViewConfig, key: string, width: number | null): CollectionViewConfig {
  const widths = { ...(config.widths ?? {}) };
  if (width === null) delete widths[key];
  else widths[key] = clampColumnWidth(width);
  return { ...config, widths };
}
