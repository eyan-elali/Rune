import { chapterShowsScenes, type NavEntry } from "@/lib/rune2/navigatorModel";

// What the Rune 2.0 writing surface opens for a navigator selection. The
// editable document is always one Scene (architecture §7: one Scene per
// editor instance); this decides which Scene, and how the surface names it.
// Groups and the Manuscript itself are structure, not prose: no target.

export type WritingTarget =
  | {
      kind: "scene";
      sceneId: string;
      /** The surface's heading: the Chapter's title when writing "the Chapter". */
      title: string;
      /** A quiet line above the heading (the Chapter of a visible Scene, or Unplaced). */
      eyebrow: string | null;
      /** A quiet line below the heading, e.g. which Scene of the Chapter is open. */
      note: string | null;
    }
  | { kind: "emptyChapter"; chapterId: string; title: string };

/**
 * - A Scene or Unplaced Scene opens itself.
 * - A Chapter that hides its Scene structure opens its one Scene, presented
 *   as the Chapter.
 * - A Chapter with several visible Scenes opens its first Scene, keeping the
 *   Chapter as the heading (temporary — Milestone 3 replaces this with the
 *   continuous Chapter surface).
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
      return { kind: "scene", sceneId: selected.id, title: selected.title, eyebrow: "Unplaced", note: null };

    case "scene": {
      const chapter = selected.path[selected.path.length - 1];
      return {
        kind: "scene",
        sceneId: selected.id,
        title: selected.title,
        eyebrow: chapter?.title ?? null,
        note: null,
      };
    }

    case "chapter": {
      const sceneIds = selected.sceneIds ?? [];
      if (sceneIds.length === 0) {
        return { kind: "emptyChapter", chapterId: selected.id, title: selected.title };
      }
      const first = index.get(sceneIds[0]);
      const note = chapterShowsScenes({ scenes: sceneIds })
        ? `Scene 1 of ${sceneIds.length}${first ? ` · ${first.title}` : ""}`
        : null;
      return { kind: "scene", sceneId: sceneIds[0], title: selected.title, eyebrow: null, note };
    }
  }
}
