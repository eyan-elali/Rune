import { buildManuscriptOutline, type OutlineNode } from "@/lib/manuscriptStructure";

// Scene History and Manuscript Milestones (migration 036): the shapes the
// database returns, and the pure rules the History and Milestone views use.
// Nothing here is a live object: a revision is an earlier text of a Scene, a
// Milestone a named, read-only picture of the whole manuscript.

export type RevisionReason = "checkpoint" | "restore" | "milestone";

/** One earlier text of a Scene, without its content. */
export type SceneRevisionSummary = {
  id: string;
  title: string;
  word_count: number;
  /** When this text was last saved. The time the writer knows it by. */
  saved_at: string;
  /** When it was put in history. */
  created_at: string;
  reason: RevisionReason;
  /** It holds the Scene's current text: nothing to restore. */
  current: boolean;
  /** Names of the Milestones that include it. */
  milestones: string[];
};

export type SceneHistory = {
  scene: { id: string; title: string; version: number; word_count: number; updated_at: string };
  revisions: SceneRevisionSummary[];
};

export type SceneRevision = {
  id: string;
  scene_id: string | null;
  title: string;
  content: Record<string, unknown> | null;
  word_count: number;
  saved_at: string;
  created_at: string;
  reason: RevisionReason;
};

export type MilestoneSummary = {
  id: string;
  name: string;
  created_at: string;
  manuscript_words: number;
  unplaced_words: number;
  scene_count: number;
};

export type MilestoneGroup = { id: string; title: string | null; parent_group_id: string | null; position: number };
export type MilestoneChapter = { id: string; title: string; group_id: string | null; position: number };

export type MilestoneScene = {
  scene_id: string;
  /** Null: the Scene was Unplaced. */
  chapter_id: string | null;
  position: number;
  revision_id: string;
  title: string;
  content: Record<string, unknown> | null;
  word_count: number;
};

export type MilestoneSnapshot = {
  milestone: MilestoneSummary & { structure: { groups: MilestoneGroup[]; chapters: MilestoneChapter[] } };
  scenes: MilestoneScene[];
};

export const MILESTONE_NAME_MAX = 120;

/** Why a revision exists, in the writer's words; null for an ordinary checkpoint. */
export function revisionNote(revision: Pick<SceneRevisionSummary, "reason" | "milestones">): string | null {
  if (revision.milestones.length > 0) return revision.milestones.join(" · ");
  if (revision.reason === "restore") return "Before a restore";
  return null;
}

/**
 * When a text was saved, as a writer says it: "Today, 9:42 PM",
 * "Yesterday, 9:42 PM", "Tue 23 Sep, 9:42 PM", or with the year when it is
 * not this year's.
 */
export function historyTime(iso: string, now: Date = new Date(), locale?: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  const date = at.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${date}, ${time}`;
}

export function wordsLabel(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "word" : "words"}`;
}

/** A Milestone name as it would be stored, or why it can't be. */
export function milestoneName(raw: string): { name: string; error: null } | { name: null; error: string } {
  const name = raw.trim();
  if (!name) return { name: null, error: "Give the milestone a name" };
  if (name.length > MILESTONE_NAME_MAX) return { name: null, error: `Keep the name to ${MILESTONE_NAME_MAX} characters` };
  return { name, error: null };
}

export type MilestoneChapterWithScenes = MilestoneChapter & { scenes: MilestoneScene[] };
export type MilestoneOutlineNode = OutlineNode<MilestoneGroup, MilestoneChapterWithScenes>;

/**
 * A Milestone in reading order, as the manuscript was: its Groups and
 * Chapters as a tree (the one ordering rule, lib/manuscriptStructure.ts),
 * each Chapter with its Scenes by position; then its Unplaced Scenes, by
 * position, apart. A Scene whose Chapter is missing from the snapshot (never
 * in valid data) is shown with the Unplaced Scenes, so no text is hidden.
 */
export function milestoneReadingOrder(snapshot: MilestoneSnapshot): {
  outline: MilestoneOutlineNode[];
  unplaced: MilestoneScene[];
} {
  const { groups, chapters } = snapshot.milestone.structure;
  const byPosition = (a: MilestoneScene, b: MilestoneScene) =>
    a.position - b.position || (a.scene_id < b.scene_id ? -1 : a.scene_id > b.scene_id ? 1 : 0);
  const known = new Set(chapters.map((c) => c.id));
  const withScenes: MilestoneChapterWithScenes[] = chapters.map((c) => ({
    ...c,
    scenes: snapshot.scenes.filter((s) => s.chapter_id === c.id).sort(byPosition),
  }));
  return {
    outline: buildManuscriptOutline(groups, withScenes),
    unplaced: snapshot.scenes.filter((s) => s.chapter_id === null || !known.has(s.chapter_id)).sort(byPosition),
  };
}

