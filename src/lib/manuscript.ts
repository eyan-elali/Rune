export type SceneStat = {
  word_count: number;
};

export type ChapterWithSceneStats = {
  /** The Chapter's placed Scenes. Unplaced Scenes never belong to a Chapter. */
  scenes?: SceneStat[] | null;
};

/** Ordered manuscript words in one Chapter: every placed Scene counts. */
export function calculateChapterWordCount(chapter: ChapterWithSceneStats): number {
  return (chapter.scenes ?? []).reduce((sum, s) => sum + (s.word_count ?? 0), 0);
}

/**
 * The ordered manuscript total: every placed Scene of every Chapter.
 * Unplaced Scenes are excluded. This is NOT the free-limit account total
 * (account_word_total counts every Scene, placed or Unplaced).
 */
export function calculateProjectWordCount(chapters: ChapterWithSceneStats[]): number {
  return chapters.reduce((sum, c) => sum + calculateChapterWordCount(c), 0);
}
