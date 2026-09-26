import { chapterShowsScenes, type NavEntry } from "@/lib/rune2/navigatorModel";

// What the Rune 2.0 writing surface opens for a navigator selection. Prose
// always lives in Scenes, and every Scene is edited by its own editor
// instance (architecture §7: one Scene per editor instance); this decides
// which Scenes are shown, in what order, and how the surface names them.
// Groups and the Manuscript itself are structure, not prose: no target.

export type WritingScene = {
  id: string;
  /**
   * The quiet boundary label above the Scene, shown only when the Chapter
   * exposes its Scene structure: the Scene's display label — its title, or
   * for an unnamed Scene its current position ("Scene 2"). Null: no label.
   */
  mark: string | null;
};

export type WritingTarget =
  | {
      kind: "scenes";
      /** "chapter": the whole Chapter, continuous. "scene": one Scene, focused. */
      view: "chapter" | "scene";
      scenes: WritingScene[];
      /** Whether Scene boundaries are drawn (a Chapter with visible Scene structure). */
      marks: boolean;
      /** The surface's heading: the Chapter's title for the Chapter, else the Scene's. */
      title: string;
      /** A quiet line above the heading (a focused Scene's Chapter, or Unplaced). */
      eyebrow: string | null;
      /** Where "+ Scene" appends a new Scene; null where it doesn't apply (Unplaced). */
      addSceneTo: string | null;
    }
  | { kind: "emptyChapter"; chapterId: string; title: string };

/**
 * - A Chapter opens as the whole Chapter: every placed Scene, in order, as
 *   one continuous surface. A Chapter that hides its Scene structure (see
 *   chapterShowsScenes) shows its one Scene with no boundary at all.
 * - A Scene opens alone, focused, under its Chapter.
 * - An Unplaced Scene opens alone.
 * - A Chapter with no Scenes is an empty Chapter.
 */
export function writingTargetFor(
  selected: NavEntry | null,
  index: Map<string, NavEntry>
): WritingTarget | null {
  if (!selected) return null;

  switch (selected.kind) {
    case "group":
      return null;

    case "unplacedScene":
      return {
        kind: "scenes",
        view: "scene",
        scenes: [{ id: selected.id, mark: null }],
        marks: false,
        title: selected.title,
        eyebrow: "Unplaced",
        addSceneTo: null,
      };

    case "scene": {
      const chapter = selected.path[selected.path.length - 1];
      return {
        kind: "scenes",
        view: "scene",
        scenes: [{ id: selected.id, mark: null }],
        marks: false,
        title: selected.title,
        eyebrow: chapter?.title ?? null,
        addSceneTo: chapter?.id ?? null,
      };
    }

    case "chapter": {
      const sceneIds = selected.sceneIds ?? [];
      if (sceneIds.length === 0) {
        return { kind: "emptyChapter", chapterId: selected.id, title: selected.title };
      }
      const marks = chapterShowsScenes({ scenes: sceneIds });
      return {
        kind: "scenes",
        view: "chapter",
        scenes: sceneIds.map((id) => ({ id, mark: marks ? sceneMark(index.get(id)) : null })),
        marks,
        title: selected.title,
        eyebrow: null,
        addSceneTo: selected.id,
      };
    }
  }
}

function sceneMark(entry: NavEntry | undefined): string | null {
  return entry?.title ?? null;
}
