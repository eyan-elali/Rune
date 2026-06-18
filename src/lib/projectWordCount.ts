import { revalidatePath } from "next/cache";

/**
 * Canonical-aware word count recalculation for a project.
 * For each chapter: if a canonical page exists, count only that page's words;
 * otherwise sum all page word counts. Persists the result to projects.word_count
 * and invalidates the project detail page and profile page caches.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recalculateProjectWordCount(supabase: any, projectId: string): Promise<void> {
  const { data: projectChapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId);

  if (!projectChapters?.length) {
    await supabase
      .from("projects")
      .update({ word_count: 0 })
      .eq("id", projectId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/profile");
    return;
  }

  const chapterIds = projectChapters.map((c: { id: string }) => c.id);

  const { data: allPages } = await supabase
    .from("pages")
    .select("chapter_id, word_count, is_canonical")
    .in("chapter_id", chapterIds);

  let totalWords = 0;

  if (allPages) {
    for (const chapId of chapterIds) {
      const chapterPages: Array<{
        chapter_id: string;
        word_count: number;
        is_canonical: boolean;
      }> = allPages.filter(
        (p: { chapter_id: string }) => p.chapter_id === chapId
      );
      const canonical = chapterPages.find((p) => p.is_canonical);
      if (canonical) {
        totalWords += canonical.word_count ?? 0;
      } else {
        totalWords += chapterPages.reduce(
          (sum, p) => sum + (p.word_count ?? 0),
          0
        );
      }
    }
  }

  await supabase
    .from("projects")
    .update({ word_count: totalWords })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/profile");
}
