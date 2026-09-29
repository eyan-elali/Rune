import type { ManuscriptOutlineNode, ProjectManuscript } from "@/lib/rune2/projectManuscript";
import type { WorkspaceTreeNode } from "@/lib/rune2/workspaceTree";
import type { CollectionEntrySummary } from "@/lib/types";

// The Rune 2.0 navigator's presentation rules over the Phase 1 manuscript
// structure (lib/rune2/projectManuscript.ts). It never re-models the
// manuscript: it only decides what the navigator shows and gives every
// Group, Chapter and Scene a lookup entry (title, kind, words, ancestry) for
// selection and breadcrumbs. Structure and word counts only — never prose.
// Workspace Pages, Folders, Collections and Collection Entries join the same
// index (indexWorkspace) so selection and tabs treat them like any other object
// by id; they carry no words and are never manuscript objects. A Folder is
// indexed for the navigator and for its items' paths, but is never selected or
// given a tab (see isSelectable). An Entry is not a tree item, but it is an
// object: indexed under its Collection, so it opens in a tab of its own.

export type NavKind =
  | "group"
  | "chapter"
  | "scene"
  | "unplacedScene"
  | "workspacePage"
  | "workspaceFolder"
  | "workspaceCollection"
  | "collectionEntry";

/** Whether an object lives in the Workspace rather than the Manuscript. */
export function isWorkspaceKind(kind: NavKind): boolean {
  return (
    kind === "workspacePage" ||
    kind === "workspaceFolder" ||
    kind === "workspaceCollection" ||
    kind === "collectionEntry"
  );
}

/** Whether an object can be selected, and so open in a tab. A Folder is navigation only. */
export function isSelectable(entry: NavEntry): boolean {
  return entry.kind !== "workspaceFolder";
}

export type NavEntry = {
  kind: NavKind;
  id: string;
  /**
   * Display title: the stored title, or a fallback — "Untitled …", or for an
   * unnamed placed Scene its current position ("Scene 2"). Presentation only.
   */
  title: string;
  /** Whether the writer has given it a title (false: `title` is a fallback). */
  named: boolean;
  /**
   * 1-based reading-order position: a Chapter among all the Manuscript's
   * Chapters, a placed Scene within its Chapter, an Unplaced Scene within
   * Unplaced Scenes. Derived, never identity. Groups and Workspace items:
   * within their parent. An Entry: within its Collection.
   */
  ordinal: number;
  /** Placed Scenes' words (Group, Chapter, Scene) or the Unplaced Scene's own. 0 for a Workspace Page. */
  words: number;
  /**
   * Ancestors from the top down: in the Manuscript, Groups then the Chapter;
   * in the Workspace, the Folders an item sits in (and, for an Entry, then
   * its Collection).
   */
  path: { id: string; kind: NavKind; title: string }[];
  /** Groups and Chapters directly inside a Group; Scenes in a Chapter; items directly in a Folder; a Collection's Entries. */
  childCount: number;
  /** A Chapter's placed Scenes, in order (Chapters only). */
  sceneIds?: string[];
  /** A Collection's Entries, in list order (Collections only). */
  entryIds?: string[];
};

/**
 * Whether a Chapter lists its Scenes in the navigator. A Chapter the writer
 * hasn't divided into Scenes — its one initial Scene, or none — reads as just
 * the Chapter (architecture §5, §37–38). The single place this rule lives, so
 * it can become an explicit writer choice later without touching the tree.
 */
export function chapterShowsScenes(chapter: { scenes: readonly unknown[] }): boolean {
  return chapter.scenes.length > 1;
}

export const UNTITLED = {
  group: "Untitled group",
  chapter: "Untitled chapter",
  scene: "Untitled scene",
  page: "Untitled",
  folder: "Untitled folder",
  collection: "Untitled collection",
  entry: "Untitled",
} as const;

export function groupTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.group;
}
export function chapterTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.chapter;
}
export function workspacePageTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.page;
}
export function workspaceFolderTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.folder;
}
export function workspaceCollectionTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.collection;
}
export function collectionEntryTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.entry;
}
export function sceneTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.scene;
}

/**
 * Whether a Scene has a title the writer gave it. Blank is unnamed (new Scenes
 * are created without one), and so is the old stored placeholder
 * "Untitled scene" — never a name anyone chose to show.
 */
export function sceneIsNamed(title: string | null | undefined): boolean {
  const t = title?.trim() ?? "";
  return t !== "" && t !== UNTITLED.scene;
}

/**
 * A Scene's display label. An unnamed placed Scene is named by where it is now
 * ("Scene 2" — the second Scene of its Chapter), so the label follows the
 * Scene when order changes and is never stored. An unnamed Unplaced Scene has
 * no position in the narrative, so it stays "Untitled scene".
 */
export function sceneLabel(title: string | null | undefined, position: number | null): string {
  if (sceneIsNamed(title)) return title!.trim();
  return position === null ? UNTITLED.scene : `Scene ${position}`;
}

/**
 * Every Group, Chapter, placed Scene and Unplaced Scene of the Manuscript, by id.
 * `renamed` overlays titles just changed but not yet re-read from the server,
 * so every surface shows a rename at once.
 */
export function indexManuscript(
  manuscript: ProjectManuscript,
  renamed: Readonly<Record<string, string>> = {}
): Map<string, NavEntry> {
  const index = new Map<string, NavEntry>();
  const stored = (id: string, title: string | null) => (id in renamed ? renamed[id] : title);
  let chapterOrdinal = 0;

  const visit = (nodes: ManuscriptOutlineNode[], path: NavEntry["path"]): number =>
    nodes.reduce((total, node, i) => {
      if (node.kind === "group") {
        const raw = stored(node.group.id, node.group.title);
        const title = groupTitle(raw);
        const entry: NavEntry = {
          kind: "group",
          id: node.group.id,
          title,
          named: Boolean(raw?.trim()),
          ordinal: i + 1,
          words: 0,
          path,
          childCount: node.children.length,
        };
        index.set(entry.id, entry);
        entry.words = visit(node.children, [...path, { id: entry.id, kind: "group", title }]);
        return total + entry.words;
      }

      const { chapter } = node;
      const raw = stored(chapter.id, chapter.title);
      const title = chapterTitle(raw);
      const words = chapter.scenes.reduce((n, s) => n + s.word_count, 0);
      index.set(chapter.id, {
        kind: "chapter",
        id: chapter.id,
        title,
        named: Boolean(raw?.trim()),
        ordinal: ++chapterOrdinal,
        words,
        path,
        childCount: chapter.scenes.length,
        sceneIds: chapter.scenes.map((s) => s.id),
      });
      const scenePath = [...path, { id: chapter.id, kind: "chapter" as const, title }];
      chapter.scenes.forEach((scene, at) => {
        const rawScene = stored(scene.id, scene.title);
        index.set(scene.id, {
          kind: "scene",
          id: scene.id,
          title: sceneLabel(rawScene, at + 1),
          named: sceneIsNamed(rawScene),
          ordinal: at + 1,
          words: scene.word_count,
          path: scenePath,
          childCount: 0,
        });
      });
      return total + words;
    }, 0);

  visit(manuscript.outline, []);

  manuscript.unplaced.forEach((scene, at) => {
    const raw = stored(scene.id, scene.title);
    index.set(scene.id, {
      kind: "unplacedScene",
      id: scene.id,
      title: sceneLabel(raw, null),
      named: sceneIsNamed(raw),
      ordinal: at + 1,
      words: scene.word_count,
      path: [],
      childCount: 0,
    });
  });

  return index;
}

/**
 * Every Workspace Page, Folder and Collection, by id, from the Workspace tree:
 * each with its position among its siblings and the Folders it sits in — and
 * every Collection Entry (`entries`, in list order) under its Collection.
 * `renamed` overlays titles just changed but not yet re-read, as for the
 * Manuscript.
 */
export function indexWorkspace(
  tree: readonly WorkspaceTreeNode[],
  renamed: Readonly<Record<string, string>> = {},
  entries: readonly CollectionEntrySummary[] = []
): Map<string, NavEntry> {
  const index = new Map<string, NavEntry>();
  const stored = (id: string, title: string | null) => (id in renamed ? renamed[id] : title);
  const entriesOf = new Map<string, CollectionEntrySummary[]>();
  for (const e of entries) {
    const list = entriesOf.get(e.collection_id) ?? [];
    list.push(e);
    entriesOf.set(e.collection_id, list);
  }

  const visit = (nodes: readonly WorkspaceTreeNode[], path: NavEntry["path"]) =>
    nodes.forEach((node, at) => {
      const raw = stored(node.id, node.title);
      if (node.kind === "collection") {
        const title = workspaceCollectionTitle(raw);
        const own = entriesOf.get(node.id) ?? [];
        index.set(node.id, {
          kind: "workspaceCollection",
          id: node.id,
          title,
          named: Boolean(raw?.trim()),
          ordinal: at + 1,
          words: 0,
          path,
          childCount: own.length,
          entryIds: own.map((e) => e.id),
        });
        const entryPath = [...path, { id: node.id, kind: "workspaceCollection" as const, title }];
        own.forEach((e, i) => {
          const rawEntry = stored(e.id, e.title);
          index.set(e.id, {
            kind: "collectionEntry",
            id: e.id,
            title: collectionEntryTitle(rawEntry),
            named: Boolean(rawEntry?.trim()),
            ordinal: i + 1,
            words: 0,
            path: entryPath,
            childCount: 0,
          });
        });
        return;
      }
      const kind = node.kind === "folder" ? "workspaceFolder" : "workspacePage";
      const title = node.kind === "folder" ? workspaceFolderTitle(raw) : workspacePageTitle(raw);
      index.set(node.id, {
        kind,
        id: node.id,
        title,
        named: Boolean(raw?.trim()),
        ordinal: at + 1,
        words: 0,
        path,
        childCount: node.children.length,
      });
      visit(node.children, [...path, { id: node.id, kind, title }]);
    });
  visit(tree, []);
  return index;
}

// ── Moving manuscript structure ─────────────────────────────────────────────
//
// Where each Chapter and Scene sits, so the navigator can offer only the moves
// that change something (Move up / down / to…, ⌥↑ / ⌥↓, drag and drop). The
// moves themselves are single database functions (move_chapter, place_scene);
// these rules only decide what to ask for.

/**
 * A Chapter's or Scene's place: its parent (a Chapter's Group, null = the top
 * level; a Scene's Chapter, null = Unplaced Scenes), that parent's children in
 * order (a Chapter's siblings are Groups and Chapters together), and its index.
 */
export type ManuscriptPlace = { parentId: string | null; siblings: string[]; index: number };

export function manuscriptPlaces(
  manuscript: Pick<ProjectManuscript, "outline" | "unplaced">
): Map<string, ManuscriptPlace> {
  const places = new Map<string, ManuscriptPlace>();
  const visit = (nodes: ManuscriptOutlineNode[], parentId: string | null) => {
    const siblings = nodes.map((n) => (n.kind === "group" ? n.group.id : n.chapter.id));
    nodes.forEach((node, index) => {
      if (node.kind === "group") {
        places.set(node.group.id, { parentId, siblings, index });
        visit(node.children, node.group.id);
        return;
      }
      places.set(node.chapter.id, { parentId, siblings, index });
      const scenes = node.chapter.scenes.map((s) => s.id);
      scenes.forEach((id, at) => places.set(id, { parentId: node.chapter.id, siblings: scenes, index: at }));
    });
  };
  visit(manuscript.outline, null);
  const unplaced = manuscript.unplaced.map((s) => s.id);
  unplaced.forEach((id, at) => places.set(id, { parentId: null, siblings: unplaced, index: at }));
  return places;
}

/**
 * The index (among the others, `moving` left out) that puts `moving` just
 * before or after `target` in `siblings` — `moving` may already be among them.
 */
export function indexBeside(
  siblings: readonly string[],
  moving: string,
  target: string,
  side: "before" | "after"
): number {
  const others = siblings.filter((id) => id !== moving);
  const at = others.indexOf(target);
  return side === "before" ? at : at + 1;
}

/** Where a Chapter can go: the top level (groupId null) and every Group, in reading order, except where it is. */
export function chapterDestinations(
  outline: ManuscriptOutlineNode[],
  currentParentId: string | null
): { groupId: string | null; depth: number }[] {
  const out: { groupId: string | null; depth: number }[] = [{ groupId: null, depth: 0 }];
  const visit = (nodes: ManuscriptOutlineNode[]) =>
    nodes.forEach((n) => {
      if (n.kind !== "group") return;
      out.push({ groupId: n.group.id, depth: n.depth + 1 });
      visit(n.children);
    });
  visit(outline);
  return out.filter((d) => d.groupId !== currentParentId);
}

/** Where a Scene can go: every Chapter in reading order, then Unplaced Scenes (null), except where it is. */
export function sceneDestinations(
  outline: ManuscriptOutlineNode[],
  currentChapterId: string | null
): { chapterId: string | null; depth: number }[] {
  const out: { chapterId: string | null; depth: number }[] = [];
  const visit = (nodes: ManuscriptOutlineNode[]) =>
    nodes.forEach((n) => (n.kind === "group" ? visit(n.children) : out.push({ chapterId: n.chapter.id, depth: n.depth })));
  visit(outline);
  out.push({ chapterId: null, depth: 0 });
  return out.filter((d) => d.chapterId !== currentChapterId);
}
