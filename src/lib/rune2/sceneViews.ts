import type { PropertyValue, SceneProperty, SceneView } from "@/lib/types";
import { valueKey } from "./collectionProperties";
import { EMPTY_VIEW_CONFIG } from "./collectionViews";
import { chapterShowsScenes, type NavEntry } from "./navigatorModel";

// A Manuscript's Scenes as its Scene Views see them (migration 032). Pure —
// no I/O — and derived entirely from the shell's index (titles, placement,
// words, reading-order ordinals), so a View never reads a Scene's prose and
// nothing here is ever stored: manuscript order and Scene numbers ("31.2")
// are worked out afresh from the manuscript structure, and every Scene is
// named by its id.
//
// The View engine (lib/rune2/collectionViews.ts) is shared with Collections.
// A Scene adds two read-only fields, offered to a View like properties
// ("words", "placement": native, never edited, never grouped by); their
// values come from the index, beside the Scene's stored property values.
//
// SCOPE (Milestone 21E.2) and BASE (Milestone 21F, migration 044). Where a
// Scene View is shown decides which Scenes it may arrange — a structural
// scope that is not a filter and that no View can remove or widen:
//   the Manuscript's page — every active placed Scene, then the Unplaced;
//   a Group's page        — every active Scene in the Chapters descended from
//                           that Group, at any depth, in manuscript order;
//                           never an Unplaced Scene (a Group holds none).
// A scope is worked out from the index each time, so a Chapter or Scene that
// moves, goes to Trash or comes back is simply in or out of it; nothing is
// stored about membership. The View's own filters, sort, grouping and search
// then apply within the scope (scopedSceneOrder → arrangeItems).
//
// Each scope is a BASE that owns its own saved Views: the Manuscript's page
// has its Views (group_id null), each Group's page its own (group_id), named,
// ordered and kept apart, over the same canonical Scenes and through the same
// engine. A Base with no saved View shows an unsaved List (sceneFallbackView)
// that its first change saves.

/** The read-only Scene fields' ids, as a View's config names them. */
export const SCENE_WORDS = "words";
export const SCENE_PLACEMENT = "placement";

/**
 * The read-only fields every Scene has, as a Scene View offers them: its word
 * count (number) and its placement (Placed / Unplaced). Shown after the
 * Manuscript's own properties.
 */
export function sceneNativeProperties(manuscriptId: string, projectId: string): SceneProperty[] {
  const base = {
    manuscript_id: manuscriptId,
    project_id: projectId,
    relation_target: null,
    relation_collection_id: null,
    relation_many: false,
    created_at: "",
    updated_at: "",
    native: true as const,
  };
  return [
    { ...base, id: SCENE_WORDS, name: "Words", type: "number", options: [], position: 10_000 },
    {
      ...base,
      id: SCENE_PLACEMENT,
      name: "Placement",
      type: "select",
      options: [
        { id: "placed", name: "Placed" },
        { id: "unplaced", name: "Unplaced" },
      ],
      position: 10_001,
    },
  ];
}

/**
 * Every active Scene in MANUSCRIPT ORDER: placed Scenes in reading order
 * (Groups → Chapters → Scenes, as the navigator shows them), then Unplaced
 * Scenes in their own order — kept after the manuscript, never mixed into it.
 */
export function manuscriptSceneOrder(index: ReadonlyMap<string, NavEntry>): { placed: string[]; unplaced: string[] } {
  const chapters = [...index.values()].filter((e) => e.kind === "chapter").sort((a, b) => a.ordinal - b.ordinal);
  const placed = chapters.flatMap((c) => (c.sceneIds ?? []).filter((id) => index.get(id)?.kind === "scene"));
  const unplaced = [...index.values()]
    .filter((e) => e.kind === "unplacedScene")
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((e) => e.id);
  return { placed, unplaced };
}

/** Where a Scene View is shown: the Manuscript's page, or one Group's. */
export type SceneScope = { kind: "manuscript" } | { kind: "group"; groupId: string };

export const MANUSCRIPT_SCOPE: SceneScope = { kind: "manuscript" };

/** Whether a placed Scene (or a Chapter) stands inside this Group, at any depth. */
export function isInGroup(entry: Pick<NavEntry, "path">, groupId: string): boolean {
  return entry.path.some((p) => p.kind === "group" && p.id === groupId);
}

/**
 * The Scenes a scope holds, in MANUSCRIPT ORDER — the structural scope every
 * View shown there arranges within. The Manuscript's: every active placed
 * Scene, and the Unplaced Scenes apart (as manuscriptSceneOrder). A Group's:
 * the placed Scenes whose Chapter is inside the Group, directly or through
 * Groups within it; `unplaced` is always empty, since a Group cannot hold
 * one. Derived from the index alone: a Scene in Trash is not in the index,
 * and a Chapter moved to another Group carries its Scenes' ancestry with it.
 */
export function scopedSceneOrder(
  index: ReadonlyMap<string, NavEntry>,
  scope: SceneScope
): { placed: string[]; unplaced: string[] } {
  const order = manuscriptSceneOrder(index);
  if (scope.kind === "manuscript") return order;
  return {
    placed: order.placed.filter((id) => {
      const scene = index.get(id);
      return scene !== undefined && isInGroup(scene, scope.groupId);
    }),
    unplaced: [],
  };
}

/**
 * A Group's shape in one line: the Groups, Chapters and Scenes inside it, at
 * any depth (its words are already on its entry). Chapters count whether or
 * not they hold a Scene.
 */
export function groupFacts(
  index: ReadonlyMap<string, NavEntry>,
  groupId: string
): { groups: number; chapters: number; scenes: number } {
  let groups = 0;
  let chapters = 0;
  let scenes = 0;
  for (const e of index.values()) {
    if (!isInGroup(e, groupId)) continue;
    if (e.kind === "group") groups += 1;
    else if (e.kind === "chapter") chapters += 1;
    else if (e.kind === "scene") scenes += 1;
  }
  return { groups, chapters, scenes };
}

/**
 * The View a scope opens in before the writer picks one: its first View.
 * `views` is that Base's own Views in their order (044).
 */
export function defaultViewFor<V extends { id: string; type: string }>(views: readonly V[], scope: SceneScope): V {
  void scope;
  return views[0];
}

/** The Base a saved Scene View belongs to, as a scope. */
export function viewScope(view: { group_id?: string | null }): SceneScope {
  return view.group_id ? { kind: "group", groupId: view.group_id } : MANUSCRIPT_SCOPE;
}

/** The id a Base's Views are kept under: the Manuscript's id, or the Group's. */
export function baseOwnerId(manuscriptId: string, scope: SceneScope): string {
  return scope.kind === "group" ? scope.groupId : manuscriptId;
}

/** A placed Scene's Chapter, from the index. */
function chapterOf(index: ReadonlyMap<string, NavEntry>, scene: NavEntry): NavEntry | null {
  if (scene.kind !== "scene") return null;
  const chapter = index.get(scene.path[scene.path.length - 1]?.id ?? "");
  return chapter?.kind === "chapter" ? chapter : null;
}

/**
 * A Scene's derived number: "31.2" — the second Scene now in the 31st
 * Chapter — or just "31" for a Chapter the writer hasn't divided into Scenes.
 * An Unplaced Scene has no number (null). Presentation only: it changes when
 * the manuscript changes, and is never stored or used as identity.
 */
export function sceneNumber(index: ReadonlyMap<string, NavEntry>, sceneId: string): string | null {
  const scene = index.get(sceneId);
  const chapter = scene && chapterOf(index, scene);
  if (!scene || !chapter) return null;
  return chapterShowsScenes({ scenes: chapter.sceneIds ?? [] }) ? `${chapter.ordinal}.${scene.ordinal}` : `${chapter.ordinal}`;
}

/**
 * How a Scene View names a Scene: a Chapter's only Scene by its Chapter (as
 * the navigator shows it), any other by its own title ("Scene 2" when
 * unnamed); `context` is its Chapter's title when that isn't already the
 * name, or "Unplaced".
 */
export function sceneViewLabel(
  index: ReadonlyMap<string, NavEntry>,
  sceneId: string
): { title: string; named: boolean; context: string | null } | null {
  const scene = index.get(sceneId);
  if (!scene || (scene.kind !== "scene" && scene.kind !== "unplacedScene")) return null;
  if (scene.kind === "unplacedScene") return { title: scene.title, named: scene.named, context: "Unplaced" };
  const chapter = chapterOf(index, scene);
  if (chapter && !chapterShowsScenes({ scenes: chapter.sceneIds ?? [] })) {
    return { title: chapter.title, named: chapter.named, context: null };
  }
  return { title: scene.title, named: scene.named, context: chapter?.title ?? null };
}

/** The read-only fields' values for these Scenes, by valueKey, to sit beside their stored values. */
export function sceneNativeValues(
  index: ReadonlyMap<string, NavEntry>,
  sceneIds: readonly string[]
): Map<string, PropertyValue> {
  const values = new Map<string, PropertyValue>();
  for (const id of sceneIds) {
    const scene = index.get(id);
    if (!scene) continue;
    values.set(valueKey(id, SCENE_WORDS), scene.words);
    values.set(valueKey(id, SCENE_PLACEMENT), scene.kind === "unplacedScene" ? "unplaced" : "placed");
  }
  return values;
}

/** The id of the unsaved List a Base shows while it has no saved Scene View. */
export function sceneFallbackViewId(ownerId: string): string {
  return `list:${ownerId}`;
}

/**
 * A Base with no saved Scene View shows this one: a List in manuscript order
 * with the Manuscript's first three properties. Unsaved — the first change
 * to it saves it as that Base's real View. The Manuscript's is called
 * "Manuscript order"; a Group's simply "List".
 */
export function sceneFallbackView(
  manuscriptId: string,
  projectId: string,
  properties: readonly SceneProperty[],
  scope: SceneScope = MANUSCRIPT_SCOPE
): SceneView {
  return {
    id: sceneFallbackViewId(baseOwnerId(manuscriptId, scope)),
    manuscript_id: manuscriptId,
    project_id: projectId,
    group_id: scope.kind === "group" ? scope.groupId : null,
    name: scope.kind === "group" ? "List" : "Manuscript order",
    type: "list",
    position: 1,
    config: {
      ...EMPTY_VIEW_CONFIG,
      properties: properties
        .filter((p) => !p.native)
        .sort((a, b) => a.position - b.position)
        .slice(0, 3)
        .map((p) => p.id),
    },
    created_at: "",
    updated_at: "",
  };
}

/**
 * Where an arranged list of Scenes starts its Unplaced part — shown under its
 * own heading, apart from the manuscript — or -1 when it has none, or when a
 * sort has mixed them (then each Unplaced Scene says so itself).
 */
export function unplacedStart(
  index: ReadonlyMap<string, NavEntry>,
  arranged: readonly string[],
  sorted: boolean
): number {
  if (sorted) return -1;
  return arranged.findIndex((id) => index.get(id)?.kind === "unplacedScene");
}
