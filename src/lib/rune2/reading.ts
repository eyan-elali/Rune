import type { ManuscriptOutlineNode } from "@/lib/rune2/projectManuscript";
import type { PropertyDefinition, SavedView } from "@/lib/types";
import { chosenOptions } from "./collectionProperties";
import { filterOpLabel, sortableProperties } from "./collectionViews";
import { chapterShowsScenes, groupTitle, type NavEntry } from "./navigatorModel";

// Reading Mode (Milestone 18): the live manuscript — or the Scenes a Scene
// View selects — read continuously, read-only. Pure — no I/O — so the reading
// surface and the tests share one set of rules.
//
// Reading Mode never holds a second copy of prose. A plan names Scenes by
// their canonical ids and says in what order and under which headings they
// are read; the text itself is read from the live Scene rows each time
// Reading Mode opens (actions/reading.ts). Structure comes from the shell's
// index, so a plan is always the manuscript as it stands.
//
//   * The whole manuscript: Groups, Chapters and their placed Scenes in
//     reading order, a break between a Chapter's Scenes. Unplaced Scenes are
//     not part of the manuscript and are not read here.
//   * A Scene View: exactly the Scenes the View shows (its filters), in its
//     order. Without a sort that is manuscript order, read under the same
//     Group and Chapter headings (only those holding a matching Scene), then
//     any matching Unplaced Scenes under their own heading; with a sort, the
//     View's order, each Scene saying where it lives.

export type ReadingSource = { kind: "manuscript" } | { kind: "view"; viewId: string };

const PREFIX = "reading:";
const MANUSCRIPT_KEY = `${PREFIX}manuscript`;
const VIEW_PREFIX = `${PREFIX}view:`;

/** Scene ids per read request (actions/reading.ts): a long manuscript is read in a few requests. */
export const READING_BATCH = 60;

/**
 * A Reading tab's key in the working set. Not an object id: Reading Mode is a
 * way of seeing the manuscript, and has one tab per source at most.
 */
export function readingTabKey(source: ReadingSource): string {
  return source.kind === "manuscript" ? MANUSCRIPT_KEY : `${VIEW_PREFIX}${source.viewId}`;
}

/** The source a tab key reads, or null when the key is not a Reading tab. */
export function readingSourceOf(key: string): ReadingSource | null {
  if (key === MANUSCRIPT_KEY) return { kind: "manuscript" };
  if (key.startsWith(VIEW_PREFIX) && key.length > VIEW_PREFIX.length) {
    return { kind: "view", viewId: key.slice(VIEW_PREFIX.length) };
  }
  return null;
}

export type ReadingBlock =
  /** `title` null: an untitled Group, which has no heading (it still has an anchor). */
  | { kind: "group"; id: string; title: string | null; depth: number }
  | { kind: "chapter"; id: string; title: string; depth: number; sceneCount: number }
  | { kind: "unplacedHeading"; id: typeof UNPLACED_ANCHOR }
  | {
      kind: "scene";
      id: string;
      /** Its Chapter, or null for an Unplaced Scene. */
      chapterId: string | null;
      /** A scene break before it: it follows another Scene of the same run. */
      breakBefore: boolean;
      /** Where it lives, said above it — only where headings don't already say so (a sorted View). */
      context: string | null;
    };

export const UNPLACED_ANCHOR = "unplaced";

export type ReadingNavRow = {
  kind: "group" | "chapter" | "scene" | "unplacedHeading";
  id: string;
  label: string;
  depth: number;
  /** The words read under this row (a Chapter's or Group's: of the Scenes in this plan). */
  words: number;
};

export type ReadingPlan = {
  blocks: ReadingBlock[];
  nav: ReadingNavRow[];
  /** Every Scene read, in reading order — each once. */
  sceneIds: string[];
  /** The words of every Scene read. */
  words: number;
};

/** The whole live manuscript: Groups, Chapters and placed Scenes in reading order. No Unplaced Scene. */
export function manuscriptReadingPlan(
  outline: ManuscriptOutlineNode[],
  index: ReadonlyMap<string, NavEntry>
): ReadingPlan {
  const blocks: ReadingBlock[] = [];
  const nav: ReadingNavRow[] = [];
  const sceneIds: string[] = [];

  const visit = (nodes: ManuscriptOutlineNode[]) => {
    for (const node of nodes) {
      if (node.kind === "group") {
        const entry = index.get(node.group.id);
        blocks.push({
          kind: "group",
          id: node.group.id,
          title: entry?.named ? entry.title : null,
          depth: node.depth,
        });
        nav.push({
          kind: "group",
          id: node.group.id,
          label: entry?.title ?? groupTitle(node.group.title),
          depth: node.depth,
          words: entry?.words ?? 0,
        });
        visit(node.children);
        continue;
      }
      const chapter = index.get(node.chapter.id);
      const ids = node.chapter.scenes.map((s) => s.id).filter((id) => index.get(id)?.kind === "scene");
      blocks.push({
        kind: "chapter",
        id: node.chapter.id,
        title: chapter?.title ?? node.chapter.title,
        depth: node.depth,
        sceneCount: ids.length,
      });
      nav.push({
        kind: "chapter",
        id: node.chapter.id,
        label: chapter?.title ?? node.chapter.title,
        depth: node.depth,
        words: chapter?.words ?? 0,
      });
      const listed = chapterShowsScenes({ scenes: ids });
      ids.forEach((id, i) => {
        blocks.push({ kind: "scene", id, chapterId: node.chapter.id, breakBefore: i > 0, context: null });
        sceneIds.push(id);
        const scene = index.get(id);
        if (listed) nav.push({ kind: "scene", id, label: scene?.title ?? "Scene", depth: node.depth + 1, words: scene?.words ?? 0 });
      });
    }
  };
  visit(outline);

  return { blocks, nav, sceneIds, words: sceneIds.reduce((n, id) => n + (index.get(id)?.words ?? 0), 0) };
}

/**
 * The Scenes a Scene View shows (`arranged`: its filtered, arranged ids), as
 * Reading Mode reads them. `sorted`: whether the View has its own sort — then
 * its order is kept and each Scene says where it lives; otherwise the Scenes
 * are read in manuscript order under their Group and Chapter headings.
 * Anything not an active Scene is left out, and no Scene is read twice.
 */
export function viewReadingPlan(
  arranged: readonly string[],
  index: ReadonlyMap<string, NavEntry>,
  sorted: boolean
): ReadingPlan {
  const seen = new Set<string>();
  const scenes = arranged.filter((id) => {
    const kind = index.get(id)?.kind;
    if ((kind !== "scene" && kind !== "unplacedScene") || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const words = scenes.reduce((n, id) => n + (index.get(id)?.words ?? 0), 0);
  return sorted ? sortedPlan(scenes, index, words) : structuredPlan(scenes, index, words);
}

function sortedPlan(scenes: string[], index: ReadonlyMap<string, NavEntry>, words: number): ReadingPlan {
  const blocks: ReadingBlock[] = [];
  const nav: ReadingNavRow[] = [];
  scenes.forEach((id, i) => {
    const scene = index.get(id)!;
    const chapterId = scene.kind === "scene" ? (scene.path[scene.path.length - 1]?.id ?? null) : null;
    const where = readingLocation(index, id);
    blocks.push({ kind: "scene", id, chapterId, breakBefore: i > 0, context: where });
    nav.push({ kind: "scene", id, label: where ?? scene.title, depth: 0, words: scene.words });
  });
  return { blocks, nav, sceneIds: scenes, words };
}

function structuredPlan(scenes: string[], index: ReadonlyMap<string, NavEntry>, words: number): ReadingPlan {
  const blocks: ReadingBlock[] = [];
  const nav: ReadingNavRow[] = [];
  // Placed Scenes in manuscript order first, then Unplaced ones, apart.
  const placed = scenes.filter((id) => index.get(id)!.kind === "scene");
  const unplaced = scenes.filter((id) => index.get(id)!.kind === "unplacedScene");
  const byChapter = new Map<string, string[]>();
  for (const id of placed) {
    const chapterId = index.get(id)!.path[index.get(id)!.path.length - 1]?.id ?? "";
    byChapter.set(chapterId, [...(byChapter.get(chapterId) ?? []), id]);
  }
  const wordsOf = (ids: readonly string[]) => ids.reduce((n, id) => n + (index.get(id)?.words ?? 0), 0);

  let openPath: string[] = [];
  let lastChapter: string | null = null;
  for (const id of placed) {
    const scene = index.get(id)!;
    const groups = scene.path.slice(0, -1);
    const chapterRef = scene.path[scene.path.length - 1];
    // Headings for every Group entered since the last Scene.
    let common = 0;
    while (common < openPath.length && common < groups.length && openPath[common] === groups[common].id) common++;
    for (let d = common; d < groups.length; d++) {
      const group = index.get(groups[d].id);
      const inside = placed.filter((s) => index.get(s)!.path.some((p) => p.id === groups[d].id));
      blocks.push({ kind: "group", id: groups[d].id, title: group?.named ? group.title : null, depth: d });
      nav.push({ kind: "group", id: groups[d].id, label: group?.title ?? groups[d].title, depth: d, words: wordsOf(inside) });
    }
    openPath = groups.map((g) => g.id);
    if (chapterRef && chapterRef.id !== lastChapter) {
      const chapter = index.get(chapterRef.id);
      const own = byChapter.get(chapterRef.id) ?? [];
      blocks.push({ kind: "chapter", id: chapterRef.id, title: chapter?.title ?? chapterRef.title, depth: groups.length, sceneCount: own.length });
      nav.push({ kind: "chapter", id: chapterRef.id, label: chapter?.title ?? chapterRef.title, depth: groups.length, words: wordsOf(own) });
      lastChapter = chapterRef.id;
      blocks.push({ kind: "scene", id, chapterId: chapterRef.id, breakBefore: false, context: null });
    } else {
      blocks.push({ kind: "scene", id, chapterId: chapterRef?.id ?? null, breakBefore: true, context: null });
    }
    // A Chapter the writer divided into Scenes lists them, as the navigator does.
    if (chapterRef && chapterShowsScenes({ scenes: index.get(chapterRef.id)?.sceneIds ?? [] })) {
      nav.push({ kind: "scene", id, label: scene.title, depth: groups.length + 1, words: scene.words });
    }
  }

  if (unplaced.length > 0) {
    blocks.push({ kind: "unplacedHeading", id: UNPLACED_ANCHOR });
    nav.push({ kind: "unplacedHeading", id: UNPLACED_ANCHOR, label: "Unplaced Scenes", depth: 0, words: wordsOf(unplaced) });
    unplaced.forEach((id, i) => {
      const scene = index.get(id)!;
      blocks.push({ kind: "scene", id, chapterId: null, breakBefore: i > 0, context: null });
      nav.push({ kind: "scene", id, label: scene.title, depth: 1, words: scene.words });
    });
  }

  return { blocks, nav, sceneIds: [...placed, ...unplaced], words };
}

/**
 * Where a Scene lives, as Reading Mode says it: "Chapter 3 · Scene 2", just
 * "Chapter 3" for a Chapter read as one piece, or "Unplaced · Untitled
 * scene". Derived, never stored. null when it isn't an active Scene.
 */
export function readingLocation(index: ReadonlyMap<string, NavEntry>, sceneId: string): string | null {
  const scene = index.get(sceneId);
  if (!scene) return null;
  if (scene.kind === "unplacedScene") return `Unplaced · ${scene.title}`;
  if (scene.kind !== "scene") return null;
  const chapter = index.get(scene.path[scene.path.length - 1]?.id ?? "");
  if (!chapter || chapter.kind !== "chapter") return scene.title;
  return chapterShowsScenes({ scenes: chapter.sceneIds ?? [] }) ? `${chapter.title} · ${scene.title}` : chapter.title;
}

/**
 * The block being read: the last whose top is at or above `y` (the reading
 * line). `tops` are the blocks' offsets, in order (never decreasing). -1
 * before the first.
 */
export function blockAt(tops: readonly number[], y: number): number {
  let lo = 0;
  let hi = tops.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] <= y) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * The Scene being read when block `at` is at the reading line: that Scene, or
 * — on a heading — the first Scene under it (before the next heading); null
 * when no Scene is there (an empty Chapter).
 */
export function sceneAt(blocks: readonly ReadingBlock[], at: number): string | null {
  if (at < 0) return blocks.find((b) => b.kind === "scene")?.id ?? null;
  const block = blocks[at];
  if (!block) return null;
  if (block.kind === "scene") return block.id;
  for (let i = at + 1; i < blocks.length; i++) {
    const next = blocks[i];
    if (next.kind === "scene") return next.id;
    // A Group's first Chapter still belongs to it; another Chapter or the Unplaced heading does not.
    if (next.kind === "unplacedHeading" || (next.kind === "chapter" && block.kind === "chapter")) return null;
  }
  return null;
}

/** The nav row a reading position belongs to: the Scene's row if listed, else its Chapter's, else its Group's. */
export function navRowFor(plan: ReadingPlan, at: number): string | null {
  const listed = new Set(plan.nav.map((r) => r.id));
  for (let i = Math.max(at, 0); i >= 0; i--) {
    const block = plan.blocks[i];
    if (!block) continue;
    if (listed.has(block.id)) return block.id;
  }
  return plan.nav[0]?.id ?? null;
}

/** A reading position to come back to: a block, and how far past its top the reading line was. */
export type ReadingPosition = { anchor: string; offset: number };

// ── Reading a Scene View ─────────────────────────────────────────────────────

/**
 * Whether a View's own sort decides its order (arrangeItems applies it): a
 * sort by title, or by a property the Manuscript still has and that can be
 * sorted. Otherwise its Scenes keep manuscript order — the natural order to
 * read in.
 */
export function viewIsSorted(view: SavedView, properties: readonly PropertyDefinition[]): boolean {
  const sort = view.config.sort;
  if (!sort) return false;
  if (sort.by === "title") return true;
  const property = properties.find((p) => p.id === sort.by);
  return Boolean(property && sortableProperties([property]).length);
}

/**
 * A View's filters in words — "POV is Nerai", "Status is Needs revision" —
 * so the writer always knows which Scenes they are reading. `titleOf` names a
 * Relationship's target. Filters on properties the Manuscript no longer has
 * are skipped, as arrangeItems skips them.
 */
export function describeViewFilters(
  view: SavedView,
  properties: readonly PropertyDefinition[],
  titleOf: (id: string) => string | null
): string[] {
  return view.config.filters.flatMap((f) => {
    const property = properties.find((p) => p.id === f.property);
    if (!property) return [];
    const op = filterOpLabel(property, f.op);
    if (f.op === "is_empty" || f.op === "is_not_empty") return [`${property.name} ${op}`];
    let value: string;
    if (f.op === "is" || f.op === "is_not") {
      value =
        property.type === "relationship"
          ? (titleOf(f.value) ?? "an item no longer here")
          : (chosenOptions(property, f.value)[0]?.name ?? "an option no longer here");
    } else if (f.op === "contains") {
      value = `“${f.value}”`;
    } else if (f.op === "gt" || f.op === "lt") {
      value = typeof f.value === "number" ? f.value.toLocaleString() : String(f.value);
    } else {
      return [];
    }
    return [`${property.name} ${op} ${value}`];
  });
}
