import { chapterShowsScenes, type NavEntry } from "@/lib/rune2/navigatorModel";

// What the Rune 2.0 writing surface opens for a navigator selection. Prose
// always lives in Scenes, and every Scene is edited by its own editor
// instance (architecture §7: one Scene per editor instance); this decides
// which Scenes are shown, in what order, and how the surface names them.
// Groups and the Manuscript itself are structure, not prose: no target.
// Nor is a Workspace Page: it has its own editor (WorkspacePageView).

export type WritingScene = {
  id: string;
  /**
   * The Scene's name where a Chapter shows several Scenes — its title, or for
   * an unnamed Scene its current position ("Scene 2"). The surface never
   * displays it (a Chapter reads as one piece; breaks are whitespace alone);
   * it names the Scene's section for assistive technology. Null: no name.
   */
  mark: string | null;
};

export type WritingTarget =
  | {
      kind: "scenes";
      /** "chapter": the whole Chapter, continuous. "scene": one Scene, focused. */
      view: "chapter" | "scene";
      scenes: WritingScene[];
      /** Whether the surface holds several Scenes of one Chapter (breaks between them). */
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
    // Structure, not prose; a Workspace Page is not manuscript prose at all.
    case "group":
    case "workspacePage":
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
