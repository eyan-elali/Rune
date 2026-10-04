import type { ManuscriptGroup } from "@/lib/types";

// Manuscript structure order (migration 022), in one place.
//
// Every Group and Chapter has a parent — a Group, or the Manuscript itself
// (null) — and a position among that parent's children, Groups and Chapters
// together. Reading order is depth-first: a parent's children by position,
// and everything inside a Group before the Group's next sibling.
//
//   Part I            (group, top level, position 1)
//     Chapter 1       (chapter in Part I, position 1)
//     Chapter 2       (chapter in Part I, position 2)
//   Chapter 3         (chapter, top level, position 2)
//
// Chapter positions are therefore NOT a manuscript-wide order: sort Chapters
// with orderChaptersInManuscript, never by position alone.

type GroupLike = Pick<ManuscriptGroup, "id" | "parent_group_id" | "position">;
type ChapterLike = { id: string; position: number; group_id?: string | null };

export type OutlineNode<G extends GroupLike, C extends ChapterLike> =
  | { kind: "group"; group: G; depth: number; children: OutlineNode<G, C>[] }
  | { kind: "chapter"; chapter: C; depth: number };

/** A parent's children, Groups and Chapters together, in sibling order. */
function childrenOf<G extends GroupLike, C extends ChapterLike>(
  parentId: string | null,
  groups: G[],
  chapters: C[]
): ({ kind: "group"; item: G } | { kind: "chapter"; item: C })[] {
  return [
    ...groups
      .filter((g) => (g.parent_group_id ?? null) === parentId)
      .map((item) => ({ kind: "group" as const, item })),
    ...chapters
      .filter((c) => (c.group_id ?? null) === parentId)
      .map((item) => ({ kind: "chapter" as const, item })),
  ].sort(
    (a, b) =>
      a.item.position - b.item.position ||
      // Positions are unique among siblings; this only makes bad data deterministic.
      (a.kind === b.kind ? 0 : a.kind === "group" ? -1 : 1) ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0)
  );
}

/**
 * The Manuscript as a tree, in reading order. A Group or Chapter whose parent
 * is missing from `groups` (never in valid data) is shown at the top level, so
 * nothing is ever hidden.
 */
export function buildManuscriptOutline<G extends GroupLike, C extends ChapterLike>(
  groups: G[],
  chapters: C[]
): OutlineNode<G, C>[] {
  const known = new Set(groups.map((g) => g.id));
  const parentOf = (id: string | null | undefined) => (id && known.has(id) ? id : null);
  const gs = groups.map((g) => ({ ...g, parent_group_id: parentOf(g.parent_group_id) }));
  const cs = chapters.map((c) => ({ ...c, group_id: parentOf(c.group_id) }));
  const original = {
    group: new Map(groups.map((g) => [g.id, g])),
    chapter: new Map(chapters.map((c) => [c.id, c])),
  };
  const visited = new Set<string>();

  function walk(parentId: string | null, depth: number): OutlineNode<G, C>[] {
    return childrenOf(parentId, gs, cs).flatMap((child): OutlineNode<G, C>[] => {
      if (child.kind === "chapter") {
        return [{ kind: "chapter", chapter: original.chapter.get(child.item.id)!, depth }];
      }
      if (visited.has(child.item.id)) return []; // a cycle (the database refuses them)
      visited.add(child.item.id);
      return [
        {
          kind: "group",
          group: original.group.get(child.item.id)!,
          depth,
          children: walk(child.item.id, depth + 1),
        },
      ];
    });
  }

  return walk(null, 0);
}

/** Every Chapter in manuscript reading order. No Chapter is ever dropped. */
export function orderChaptersInManuscript<C extends ChapterLike>(
  chapters: C[],
  groups: GroupLike[]
): C[] {
  const ordered: C[] = [];
  const visit = (nodes: OutlineNode<GroupLike, C>[]) => {
    for (const node of nodes) {
      if (node.kind === "chapter") ordered.push(node.chapter);
      else visit(node.children);
    }
  };
  visit(buildManuscriptOutline(groups, chapters));
  // Only reachable through a Group cycle; keep the prose anyway.
  const seen = new Set(ordered.map((c) => c.id));
  const stranded = chapters.filter((c) => !seen.has(c.id)).sort((a, b) => a.position - b.position);
  return [...ordered, ...stranded];
}

/** The ids of a Group and every Group inside it, at any depth. */
export function groupAndDescendantIds(groupId: string, groups: GroupLike[]): Set<string> {
  const ids = new Set([groupId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of groups) {
      if (g.parent_group_id && ids.has(g.parent_group_id) && !ids.has(g.id)) {
        ids.add(g.id);
        grew = true;
      }
    }
  }
  return ids;
}
