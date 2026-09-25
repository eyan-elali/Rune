export type SceneStat = {
  word_count: number;
};

export type ChapterWithSceneStats = {
  /** The Chapter's placed Scenes. Unplaced Scenes never belong to a Chapter. */
  scenes?: SceneStat[] | null;
};

// The manuscript-counting rules, in one place (the SQL twin of the ordered
// total is ordered_manuscript_word_total(), migration 020, which the database
// stores in projects.word_count):
//
//   * Chapter total: every Scene placed in the Chapter.
//   * ordered manuscript total: every placed Scene of every Chapter.
//     Unplaced Scenes are excluded.
//   * account / free-limit total: every Scene, placed or Unplaced — only
//     account_word_total() in the database, never computed here.
//
// Writing activity (Today's Words, sessions, streaks, XP) is counted from
// writing_sessions, not from any of these.

/** Words in the given Scenes, whatever their placement (e.g. the Unplaced list). */
export function sumSceneWords(scenes: SceneStat[] | null | undefined): number {
  return (scenes ?? []).reduce((sum, s) => sum + (s.word_count ?? 0), 0);
}

/** Ordered manuscript words in one Chapter: every placed Scene counts. */
export function calculateChapterWordCount(chapter: ChapterWithSceneStats): number {
  return sumSceneWords(chapter.scenes);
}

/**
 * The ordered manuscript total: every placed Scene of every Chapter.
 * Unplaced Scenes are excluded. This is NOT the free-limit account total
 * (account_word_total counts every Scene, placed or Unplaced).
 */
export function calculateProjectWordCount(chapters: ChapterWithSceneStats[]): number {
  return chapters.reduce((sum, c) => sum + calculateChapterWordCount(c), 0);
}
