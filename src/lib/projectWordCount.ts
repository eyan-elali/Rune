import { revalidatePath } from "next/cache";
import { calculateProjectWordCount } from "@/lib/manuscript";
import { getChaptersWithScenes } from "@/lib/manuscriptQueries";

/**
 * Recalculates a project's ordered manuscript total — every placed Scene in
 * every Chapter; Unplaced Scenes are excluded — and persists it to
 * projects.word_count, then invalidates the project detail page and profile
 * page caches.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recalculateProjectWordCount(supabase: any, projectId: string): Promise<void> {
  const { data: chapters, error } = await getChaptersWithScenes(supabase, projectId);
  // A failed read must never overwrite the stored total with a partial one.
  if (error) return;

  await supabase
    .from("projects")
    .update({ word_count: calculateProjectWordCount(chapters) })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/profile");
}
