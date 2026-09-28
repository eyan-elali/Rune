import type {
  CollectionProperty,
  CollectionViewConfig,
  CollectionViewType,
  PropertyValue,
  ViewFilter,
  ViewFilterOp,
  WorkspaceCollectionView,
} from "@/lib/types";
import { chosenOptions, valueKey } from "./collectionProperties";

// Saved Collection Views (migration 027) as the shell presents them: which
// Entries a View shows and in what order, which properties it shows, and a
// Board's lanes. Pure — no I/O — so List, Table, Board and the tests share one
// set of rules. A View only arranges; every View reads the same Entries and
// the same values, so an edit made in one is already in all the others.
//
// The database keeps each config pointing only at the Collection's current
// properties; these helpers still skip anything unknown, so a screen showing
// a moment-old config never breaks.

export const VIEW_TYPES: readonly CollectionViewType[] = ["list", "table", "board"];

export const VIEW_TYPE_LABEL: Record<CollectionViewType, string> = {
  list: "List",
  table: "Table",
  board: "Board",
};

export const EMPTY_VIEW_CONFIG: CollectionViewConfig = { properties: [], sort: null, filters: [], group_by: null };

/** A Collection's Views in their order. */
export function viewsOf(views: readonly WorkspaceCollectionView[], collectionId: string): WorkspaceCollectionView[] {
  return views.filter((v) => v.collection_id === collectionId).sort((a, b) => a.position - b.position);
}

/** The id of the stand-in List a Collection shows before migration 027. */
export function fallbackViewId(collectionId: string): string {
  return `list:${collectionId}`;
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
export function shownProperties(view: WorkspaceCollectionView, properties: readonly CollectionProperty[]): CollectionProperty[] {
  const byId = new Map(properties.map((p) => [p.id, p]));
  return view.config.properties.flatMap((id) => {
    const p = byId.get(id);
    return p ? [p] : [];
  });
}

/** The Collection's properties the View doesn't show, in the Collection's order. */
export function hiddenProperties(view: WorkspaceCollectionView, properties: readonly CollectionProperty[]): CollectionProperty[] {
  const shown = new Set(view.config.properties);
  return properties.filter((p) => !shown.has(p.id));
}

// ── Filters ─────────────────────────────────────────────────────────────────

/** The filters a property offers: choices "is"/"is not"; a checkbox checked/unchecked; anything empty/not empty. */
export function filterOpsFor(property: CollectionProperty): ViewFilterOp[] {
  if (property.type === "select" || property.type === "status" || property.type === "multi_select") {
    return ["is", "is_not", "is_empty", "is_not_empty"];
  }
  if (property.type === "checkbox") return ["is_not_empty", "is_empty"];
  return ["is_not_empty", "is_empty"];
}

/** How a filter reads: "is", "is not", "is empty", "is checked"… */
export function filterOpLabel(property: CollectionProperty, op: ViewFilterOp): string {
  if (property.type === "checkbox") return op === "is_not_empty" ? "is checked" : "is not checked";
  if (property.type === "multi_select" && (op === "is" || op === "is_not")) return op === "is" ? "includes" : "doesn’t include";
  switch (op) {
    case "is":
      return "is";
    case "is_not":
      return "is not";
    case "is_empty":
      return "is empty";
    case "is_not_empty":
      return "is not empty";
  }
}

/** Whether a value passes one filter. A value naming an unknown option counts as empty. */
export function matchesFilter(filter: ViewFilter, property: CollectionProperty, value: PropertyValue | undefined): boolean {
  const isChoice = property.type === "select" || property.type === "status" || property.type === "multi_select";
  const ids = isChoice ? chosenOptions(property, value).map((o) => o.id) : [];
  const empty = isChoice ? ids.length === 0 : value === undefined;
  switch (filter.op) {
    case "is_empty":
      return empty;
    case "is_not_empty":
      return !empty;
    case "is":
      return ids.includes(filter.value);
    case "is_not":
      return !ids.includes(filter.value);
  }
}

// ── Sort ────────────────────────────────────────────────────────────────────

/** Properties a View can sort by (title aside): every type but multi-select. */
export function sortableProperties(properties: readonly CollectionProperty[]): CollectionProperty[] {
  return properties.filter((p) => p.type !== "multi_select");
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** A comparable key for a value, or null when empty (empties sort last either way). */
function sortKey(property: CollectionProperty, value: PropertyValue | undefined): string | number | null {
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
      return null;
  }
}

function compareKeys(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

// ── Arranging Entries ───────────────────────────────────────────────────────

export type ArrangeInput = {
  /** The Collection's Entries in creation order. */
  entryIds: readonly string[];
  properties: readonly CollectionProperty[];
  values: ReadonlyMap<string, PropertyValue>;
  /** An Entry's title as shown ("Untitled" included). */
  titleOf: (entryId: string) => string;
};

/**
 * The Entries a View shows, in its order: those passing every filter, sorted
 * by its sort (ties, and no sort, keep creation order; empty values last).
 */
export function arrangeEntries(view: WorkspaceCollectionView, input: ArrangeInput): string[] {
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
  if (sort.by !== "title" && (!property || property.type === "multi_select")) return kept;
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

// ── Board ───────────────────────────────────────────────────────────────────

/** Properties a Board can group by: one value each — select and status. */
export function groupableProperties(properties: readonly CollectionProperty[]): CollectionProperty[] {
  return properties.filter((p) => p.type === "select" || p.type === "status");
}

export type BoardLane = {
  /** The option id, or null for the lane of Entries with no value. */
  optionId: string | null;
  name: string;
  entryIds: string[];
};

/** The name of the lane of Entries without a value: "No status", "No Affiliation". */
export function emptyLaneName(property: CollectionProperty): string {
  return property.type === "status" ? "No status" : `No ${property.name}`;
}

/**
 * A Board's lanes for arranged Entries: the empty lane first, then one per
 * option in the property's order. An Entry whose value names an unknown
 * option is in the empty lane. null when the View groups by nothing usable.
 */
export function boardLanes(
  view: WorkspaceCollectionView,
  properties: readonly CollectionProperty[],
  values: ReadonlyMap<string, PropertyValue>,
  arranged: readonly string[]
): { property: CollectionProperty; lanes: BoardLane[] } | null {
  const property = properties.find((p) => p.id === view.config.group_by);
  if (!property || (property.type !== "select" && property.type !== "status")) return null;
  const empty: BoardLane = { optionId: null, name: emptyLaneName(property), entryIds: [] };
  const lanes = property.options.map((o): BoardLane => ({ optionId: o.id, name: o.name, entryIds: [] }));
  const byOption = new Map(lanes.map((l) => [l.optionId, l]));
  for (const id of arranged) {
    const value = values.get(valueKey(id, property.id));
    const lane = (typeof value === "string" && byOption.get(value)) || empty;
    lane.entryIds.push(id);
  }
  return { property, lanes: [empty, ...lanes] };
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

/** A new View's name: List/Table by type, a Board by what it groups ("By Status"). */
export function newViewName(type: CollectionViewType, groupBy: CollectionProperty | undefined): string {
  if (type === "board" && groupBy) return `By ${groupBy.name}`;
  return VIEW_TYPE_LABEL[type];
}
