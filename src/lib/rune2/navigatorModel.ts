import type { ManuscriptOutlineNode, ProjectManuscript } from "@/lib/rune2/projectManuscript";
import type { WorkspacePageSummary } from "@/lib/types";

// The Rune 2.0 navigator's presentation rules over the Phase 1 manuscript
// structure (lib/rune2/projectManuscript.ts). It never re-models the
// manuscript: it only decides what the navigator shows and gives every
// Group, Chapter and Scene a lookup entry (title, kind, words, ancestry) for
// selection and breadcrumbs. Structure and word counts only — never prose.
// Workspace Pages join the same index (indexWorkspace) so selection and tabs
// treat them like any other object by id; they carry no words and no path,
// and are never manuscript objects.

export type NavKind = "group" | "chapter" | "scene" | "unplacedScene" | "workspacePage";

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
   * Unplaced Scenes. Derived, never identity. Groups: within their parent.
   */
  ordinal: number;
  /** Placed Scenes' words (Group, Chapter, Scene) or the Unplaced Scene's own. 0 for a Workspace Page. */
  words: number;
  /** Ancestors from the top of the Manuscript down (Groups, then the Chapter). */
  path: { id: string; kind: NavKind; title: string }[];
  /** Groups and Chapters directly inside a Group; Scenes in a Chapter. */
  childCount: number;
  /** A Chapter's placed Scenes, in order (Chapters only). */
  sceneIds?: string[];
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
 * Every Workspace Page, by id — a flat list in creation order for now (the
 * Workspace tree comes later). `renamed` overlays titles just changed but not
 * yet re-read, as for the Manuscript.
 */
export function indexWorkspace(
  pages: readonly WorkspacePageSummary[],
  renamed: Readonly<Record<string, string>> = {}
): Map<string, NavEntry> {
  const index = new Map<string, NavEntry>();
  pages.forEach((page, at) => {
    const raw = page.id in renamed ? renamed[page.id] : page.title;
    index.set(page.id, {
      kind: "workspacePage",
      id: page.id,
      title: workspacePageTitle(raw),
      named: Boolean(raw?.trim()),
      ordinal: at + 1,
      words: 0,
      path: [],
      childCount: 0,
    });
  });
  return index;
}
