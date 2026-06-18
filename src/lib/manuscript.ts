export type PageStat = {
  word_count: number;
  is_canonical: boolean;
};

export type ChapterWithPageStats = {
  pages?: PageStat[] | null;
};

export function calculateChapterWordCount(chapter: ChapterWithPageStats): number {
  const pages = chapter.pages ?? [];
  const canonical = pages.find((p) => p.is_canonical);
  if (canonical) return canonical.word_count ?? 0;
  return pages.reduce((sum, p) => sum + (p.word_count ?? 0), 0);
}

export function calculateProjectWordCount(chapters: ChapterWithPageStats[]): number {
  return chapters.reduce((sum, c) => sum + calculateChapterWordCount(c), 0);
}
