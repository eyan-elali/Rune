import type { CollectionProperty, ObjectReferenceRow, ReferenceObjectType } from "@/lib/types";
import { chapterShowsScenes, type NavEntry } from "./navigatorModel";
import { valueKey } from "./collectionProperties";
import { inScope, searchObjects, searchProject, type SearchObject, type SearchScope } from "./projectSearch";

// References between creative objects (migration 028) as the shell presents
// them: forward references, the Relationship values they carry, backlinks
// derived from them, and how a referenced object is named, found and opened.
// Pure — no I/O — so the property editors, the Inspector and the tests share
// one set of rules. Every end is a canonical id; every title is read from the
// object's index entry, so a rename is everywhere at once and nothing here
// ever holds a copy of a title.
//
// Backlinks are never stored: an object's backlinks are the references whose
// target it is (backlinksOf), so they change the moment a reference does.

export type ObjectRef = { type: ReferenceObjectType; id: string };

export type Reference = {
  id: string;
  source: ObjectRef;
  target: ObjectRef;
  /** null: a generic reference; otherwise the Relationship property it is a value of. */
  propertyId: string | null;
  position: number;
};

export const REFERENCE_TYPE_LABEL: Record<ReferenceObjectType, string> = {
  entry: "Entry",
  page: "Page",
  scene: "Scene",
};

function end(type: ReferenceObjectType, entry: string | null, document: string | null, scene: string | null): ObjectRef {
  return { type, id: (type === "entry" ? entry : type === "page" ? document : scene) ?? "" };
}

/** A stored row as a reference. */
export function toReference(row: ObjectReferenceRow): Reference {
  return {
    id: row.id,
    source: end(row.source_type, row.source_entry_id, row.source_document_id, row.source_scene_id),
    target: end(row.target_type, row.target_entry_id, row.target_document_id, row.target_scene_id),
    propertyId: row.property_id,
    position: row.position,
  };
}

/**
 * The list a reference belongs to — one Relationship value, or a source's
 * generic references. A change always replaces one whole list.
 */
export function listKey(ref: Pick<Reference, "source" | "propertyId">): string {
  return ref.propertyId ? relationListKey(ref.source.id, ref.propertyId) : genericListKey(ref.source.id);
}
export function relationListKey(entryId: string, propertyId: string): string {
  return `rel:${entryId}:${propertyId}`;
}
export function genericListKey(sourceId: string): string {
  return `src:${sourceId}`;
}

const byPosition = (a: Reference, b: Reference) => a.position - b.position;

/**
 * Every Relationship value by valueKey(entryId, propertyId): its targets'
 * ids, in order — the same shape as a multi-select's value, so Views, filters
 * and property editors read it like any other value.
 */
export function relationshipValues(refs: readonly Reference[]): Map<string, string[]> {
  const lists = new Map<string, Reference[]>();
  for (const r of refs) {
    if (!r.propertyId) continue;
    const key = valueKey(r.source.id, r.propertyId);
    const list = lists.get(key) ?? [];
    list.push(r);
    lists.set(key, list);
  }
  return new Map([...lists].map(([k, list]) => [k, list.sort(byPosition).map((r) => r.target.id)]));
}

/** A source's generic references (not its Relationship values), in order. */
export function relatedOf(refs: readonly Reference[], sourceId: string): Reference[] {
  return refs.filter((r) => r.propertyId === null && r.source.id === sourceId).sort(byPosition);
}

export type Backlink = {
  source: ObjectRef;
  /** How the source refers to it: each Relationship property, and null for a generic reference. */
  via: (string | null)[];
};

/**
 * Where an object is referenced from: one Backlink per referring object, in
 * the order `titleOf` sorts them, each saying every way it refers.
 */
export function backlinksOf(
  refs: readonly Reference[],
  targetId: string,
  titleOf: (id: string) => string = () => ""
): Backlink[] {
  const bySource = new Map<string, Backlink>();
  for (const r of refs) {
    if (r.target.id !== targetId) continue;
    const link = bySource.get(r.source.id) ?? { source: r.source, via: [] };
    if (!link.via.includes(r.propertyId)) link.via.push(r.propertyId);
    bySource.set(r.source.id, link);
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...bySource.values()].sort((a, b) => collator.compare(titleOf(a.source.id), titleOf(b.source.id)));
}

// ── Objects ─────────────────────────────────────────────────────────────────

/** The reference type of an object in the shell's index, or null if it can't be referenced. */
export function referenceTypeOf(entry: Pick<NavEntry, "kind">): ReferenceObjectType | null {
  switch (entry.kind) {
    case "collectionEntry":
      return "entry";
    case "workspacePage":
      return "page";
    case "scene":
    case "unplacedScene":
      return "scene";
    default:
      return null;
  }
}

/** Whether a placed Scene is its Chapter's only Scene — the Chapter then stands for it. */
function soleSceneChapter(index: ReadonlyMap<string, NavEntry>, entry: NavEntry): NavEntry | null {
  if (entry.kind !== "scene") return null;
  const chapter = index.get(entry.path[entry.path.length - 1]?.id ?? "");
  if (!chapter || chapter.kind !== "chapter") return null;
  return chapterShowsScenes({ scenes: chapter.sceneIds ?? [] }) ? null : chapter;
}

/**
 * What a referenced object is called and a quiet word on where it lives:
 *   Entry   — "Nerai", in "Characters"
 *   Page    — "Worldbuilding Notes", in "Research" (its Folder) or "Page"
 *   Scene   — "Chapter 8 · Scene 2"; a Chapter's only Scene is the Chapter
 *             ("Chapter 8"); an Unplaced Scene says so.
 * null when the object isn't in the index (not loaded, or gone).
 */
export function describeObject(
  index: ReadonlyMap<string, NavEntry>,
  id: string
): { title: string; hint: string; type: ReferenceObjectType } | null {
  const entry = index.get(id);
  const type = entry && referenceTypeOf(entry);
  if (!entry || !type) return null;
  switch (entry.kind) {
    case "collectionEntry":
      return { title: entry.title, hint: entry.path[entry.path.length - 1]?.title ?? "Entry", type };
    case "workspacePage":
      return { title: entry.title, hint: entry.path.length ? entry.path.map((p) => p.title).join(" / ") : "Page", type };
    case "unplacedScene":
      return { title: entry.title, hint: "Unplaced", type };
    default: {
      const chapter = soleSceneChapter(index, entry);
      if (chapter) return { title: chapter.title, hint: "Manuscript", type };
      const parent = entry.path[entry.path.length - 1]?.title;
      return { title: parent ? `${parent} · ${entry.title}` : entry.title, hint: "Manuscript", type };
    }
  }
}

/**
 * The id to open for a referenced object: itself — except a Chapter's only
 * Scene, which opens as its Chapter (as the navigator shows it), so it never
 * gets a second tab beside the Chapter's.
 */
export function openableId(index: ReadonlyMap<string, NavEntry>, id: string): string {
  const entry = index.get(id);
  return (entry && soleSceneChapter(index, entry)?.id) ?? id;
}

/**
 * The object whose references an index entry shows: its own id — or, for a
 * Chapter shown as one piece of writing, its only Scene's (the Chapter stands
 * for it). null when the object can't hold references (a Group, a Collection,
 * a Chapter divided into Scenes).
 */
export function referenceSubject(index: ReadonlyMap<string, NavEntry>, entry: NavEntry): ObjectRef | null {
  if (entry.kind === "chapter") {
    const ids = entry.sceneIds ?? [];
    return ids.length === 1 && !chapterShowsScenes({ scenes: ids }) ? { type: "scene", id: ids[0] } : null;
  }
  const type = referenceTypeOf(entry);
  return type ? { type, id: entry.id } : null;
}

/** What a Relationship property may point to. */
export type TargetSpec =
  | { type: "entry"; collectionId: string }
  | { type: "page" }
  | { type: "scene" }
  /** Any Entry, Page or Scene (a generic reference). */
  | { type: "any" };

export function targetSpecOf(property: CollectionProperty): TargetSpec | null {
  if (property.type !== "relationship" || !property.relation_target) return null;
  if (property.relation_target === "entry") {
    return property.relation_collection_id ? { type: "entry", collectionId: property.relation_collection_id } : null;
  }
  return { type: property.relation_target };
}

export type Candidate = { id: string; type: ReferenceObjectType; title: string; hint: string };

/** The Project Search scope a picker for `spec` searches: only valid targets, never `exclude`. */
export function targetScope(spec: TargetSpec, exclude: ReadonlySet<string> = new Set()): SearchScope {
  return {
    subjects: spec.type === "any" ? ["entry", "page", "scene"] : [spec.type],
    collectionId: spec.type === "entry" ? spec.collectionId : undefined,
    exclude,
    matchContext: true,
  };
}

/**
 * The objects a picker offers for `spec` — Project Search (lib/rune2/projectSearch.ts)
 * narrowed to valid targets. With no query: every one, in the Project's order
 * (Scenes in reading order, Unplaced after placed). With one: those whose
 * title matches (best first), then those whose place does ("Characters").
 * `exclude`: ids never offered (the object itself). Each is named as a
 * reference to it is shown (describeObject), and its id is the target's.
 */
export function candidates(
  index: ReadonlyMap<string, NavEntry>,
  spec: TargetSpec,
  query = "",
  exclude: ReadonlySet<string> = new Set(),
  objects: readonly SearchObject[] = searchObjects(index)
): Candidate[] {
  const scope = targetScope(spec, exclude);
  const found = query.trim() ? searchProject(objects, query, scope) : objects.filter((o) => inScope(o, scope));
  const out: Candidate[] = [];
  for (const o of found) {
    const d = o.subject && describeObject(index, o.subject.id);
    if (o.subject && d) out.push({ id: o.subject.id, type: o.subject.type, title: d.title, hint: d.hint });
  }
  return out;
}

/** A Relationship's target as a phrase: "Entries in Factions", "Pages", "Scenes". */
export function targetPhrase(property: CollectionProperty, collectionTitle: (id: string) => string): string {
  switch (property.relation_target) {
    case "entry":
      return `Entries in ${collectionTitle(property.relation_collection_id ?? "")}`;
    case "page":
      return "Pages";
    case "scene":
      return "Scenes";
    default:
      return "";
  }
}
