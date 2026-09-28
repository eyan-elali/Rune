import type { CollectionProperty, CollectionPropertyType, EntryPropertyValue, PropertyValue } from "@/lib/types";

// Collection properties (migration 026; Relationship from 028) as the shell presents them: labels,
// how a value reads, which values a Collection's list shows beside an Entry,
// and which type changes keep every value. Pure — no I/O — so the list, the
// Entry and the tests share one set of rules. The database is authoritative
// for what a valid value is (workspace_property_value_valid); these helpers
// only read and summarise what it stored.

export const PROPERTY_TYPES: readonly CollectionPropertyType[] = [
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "checkbox",
  "relationship",
];

export const PROPERTY_TYPE_LABEL: Record<CollectionPropertyType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi-select",
  status: "Status",
  date: "Date",
  checkbox: "Checkbox",
  relationship: "Relationship",
};

/** Types whose values are choices from the property's own options. */
export function isChoiceType(type: CollectionPropertyType): boolean {
  return type === "select" || type === "multi_select" || type === "status";
}

/**
 * The types a property may change to without losing a value — the same rule
 * update_workspace_collection_property enforces: select ↔ status, and a
 * single choice may become a multi-select. Always includes its own type.
 */
export function convertibleTypes(type: CollectionPropertyType): CollectionPropertyType[] {
  if (type === "select") return ["select", "status", "multi_select"];
  if (type === "status") return ["status", "select", "multi_select"];
  return [type];
}

/** A Collection's properties in their order. */
export function propertiesOf(properties: readonly CollectionProperty[], collectionId: string): CollectionProperty[] {
  return properties.filter((p) => p.collection_id === collectionId).sort((a, b) => a.position - b.position);
}

/** Key for one Entry's value of one property. */
export function valueKey(entryId: string, propertyId: string): string {
  return `${entryId}:${propertyId}`;
}

/** Every stored value by valueKey. */
export function indexValues(values: readonly EntryPropertyValue[]): Map<string, PropertyValue> {
  return new Map(values.map((v) => [valueKey(v.entry_id, v.property_id), v.value]));
}

/** How many Entries hold a value for a property (what deleting it would remove). */
export function countValues(values: ReadonlyMap<string, PropertyValue>, propertyId: string): number {
  let n = 0;
  for (const key of values.keys()) if (key.endsWith(`:${propertyId}`)) n++;
  return n;
}

/** How many Entries use a property's option (what removing the option would clear). */
export function countOptionUses(
  values: ReadonlyMap<string, PropertyValue>,
  propertyId: string,
  optionId: string
): number {
  let n = 0;
  for (const [key, value] of values) {
    if (!key.endsWith(`:${propertyId}`)) continue;
    if (Array.isArray(value) ? value.includes(optionId) : value === optionId) n++;
  }
  return n;
}

/** The names of the options a value chose, in the property's option order; unknown ids are skipped. */
export function chosenOptions(property: CollectionProperty, value: PropertyValue | undefined) {
  if (value === undefined) return [];
  const ids = Array.isArray(value) ? value : [value];
  return property.options.filter((o) => ids.includes(o.id));
}

/** "YYYY-MM-DD" as a quiet, locale-aware date ("12 Mar 2024"). Never shifted by the time zone. */
export function formatDateValue(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** How a line names a Relationship's target by id; unknown (gone) targets are left out. */
export type TitleOf = (id: string) => string | undefined;

/**
 * A value as one line of text, or null when there is nothing to show. A
 * checked checkbox reads as the property's name ("POV"), so a list line stays
 * words rather than symbols. A Relationship reads as its targets' current
 * titles (`titleOf`), never a stored copy.
 */
export function formatValue(
  property: CollectionProperty,
  value: PropertyValue | undefined,
  titleOf: TitleOf = () => undefined
): string | null {
  if (value === undefined || value === null) return null;
  switch (property.type) {
    case "text":
      return typeof value === "string" && value.trim() ? value.trim() : null;
    case "number":
      return typeof value === "number" ? value.toLocaleString() : null;
    case "date":
      return typeof value === "string" ? formatDateValue(value) : null;
    case "checkbox":
      return value === true ? property.name : null;
    case "select":
    case "status":
    case "multi_select": {
      const names = chosenOptions(property, value).map((o) => o.name);
      return names.length ? names.join(", ") : null;
    }
    case "relationship": {
      const names = (Array.isArray(value) ? value : []).flatMap((id) => titleOf(id) ?? []);
      return names.length ? names.join(", ") : null;
    }
  }
}

/**
 * One Entry's values for `properties`, in that order, as short phrases —
 * empty ones left out, text kept to one short phrase so the line never
 * becomes a paragraph. What a List View's line and a Board card show.
 */
export function valueLine(
  properties: readonly CollectionProperty[],
  values: ReadonlyMap<string, PropertyValue>,
  entryId: string,
  titleOf?: TitleOf
): string[] {
  return properties.flatMap((p) => {
    const text = formatValue(p, values.get(valueKey(entryId, p.id)), titleOf);
    if (!text) return [];
    return [p.type === "text" && text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text];
  });
}

/**
 * The values a Collection's list showed beside one Entry before saved Views
 * (027): its properties marked shown_in_list, in order (see valueLine).
 */
export function listSummary(
  properties: readonly CollectionProperty[],
  values: ReadonlyMap<string, PropertyValue>,
  entryId: string
): string[] {
  return valueLine(
    properties.filter((p) => p.shown_in_list),
    values,
    entryId
  );
}

/**
 * A number typed by the writer, or null when it isn't one. Accepts the
 * locale's grouping commas ("12,000") and a leading minus.
 */
export function parseNumberInput(raw: string): number | null {
  const s = raw.trim().replace(/[,\s_]/g, "");
  if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
