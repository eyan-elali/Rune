import { revalidatePath } from "next/cache";

/**
 * Invalidates the caches that display a project's ordered manuscript total —
 * the Project and the Projects list — after a change to its Scenes.
 *
 * It does not write projects.word_count. The database maintains that column
 * (trigger scenes_refresh_project_word_count, migration 020) in the same
 * transaction as every Scene insert, save, move and deletion, from
 * ordered_manuscript_word_total(): every placed Scene, Unplaced Scenes
 * excluded. The app used to read the Scenes and write the total in separate
 * requests, which could overwrite a newer total with a stale one.
 */
export function revalidateProjectTotals(projectId: string): void {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}
