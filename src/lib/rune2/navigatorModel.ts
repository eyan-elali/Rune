import type { ManuscriptOutlineNode, ProjectManuscript } from "@/lib/rune2/projectManuscript";

// The Rune 2.0 navigator's presentation rules over the Phase 1 manuscript
// structure (lib/rune2/projectManuscript.ts). It never re-models the
// manuscript: it only decides what the navigator shows and gives every
// Group, Chapter and Scene a lookup entry (title, kind, words, ancestry) for
// selection and breadcrumbs. Structure and word counts only — never prose.

export type NavKind = "group" | "chapter" | "scene" | "unplacedScene";

export type NavEntry = {
  kind: NavKind;
  id: string;
  /** Display title: the stored title, or an "Untitled …" fallback. */
  title: string;
  /** Placed Scenes' words (Group, Chapter, Scene) or the Unplaced Scene's own. */
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
} as const;

export function groupTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.group;
}
export function chapterTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.chapter;
}
export function sceneTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED.scene;
}

/** Every Group, Chapter, placed Scene and Unplaced Scene of the Manuscript, by id. */
export function indexManuscript(manuscript: ProjectManuscript): Map<string, NavEntry> {
  const index = new Map<string, NavEntry>();

  const visit = (nodes: ManuscriptOutlineNode[], path: NavEntry["path"]): number =>
    nodes.reduce((total, node) => {
      if (node.kind === "group") {
        const title = groupTitle(node.group.title);
        const entry: NavEntry = {
          kind: "group",
          id: node.group.id,
          title,
          words: 0,
          path,
          childCount: node.children.length,
        };
        index.set(entry.id, entry);
        entry.words = visit(node.children, [...path, { id: entry.id, kind: "group", title }]);
        return total + entry.words;
      }

      const { chapter } = node;
      const title = chapterTitle(chapter.title);
      const words = chapter.scenes.reduce((n, s) => n + s.word_count, 0);
      index.set(chapter.id, {
        kind: "chapter",
        id: chapter.id,
        title,
        words,
        path,
        childCount: chapter.scenes.length,
        sceneIds: chapter.scenes.map((s) => s.id),
      });
      const scenePath = [...path, { id: chapter.id, kind: "chapter" as const, title }];
      for (const scene of chapter.scenes) {
        index.set(scene.id, {
          kind: "scene",
          id: scene.id,
          title: sceneTitle(scene.title),
          words: scene.word_count,
          path: scenePath,
          childCount: 0,
        });
      }
      return total + words;
    }, 0);

  visit(manuscript.outline, []);

  for (const scene of manuscript.unplaced) {
    index.set(scene.id, {
      kind: "unplacedScene",
      id: scene.id,
      title: sceneTitle(scene.title),
      words: scene.word_count,
      path: [],
      childCount: 0,
    });
  }

  return index;
}
