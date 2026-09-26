import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { WorkspacePageSummary } from "@/lib/types";

// The Rune 2.0 shell's view of one Project's Workspace: its Pages, as a flat
// list in creation order (the Workspace tree comes later). Titles and dates
// only — never a Page's content, which its editor loads by id.

export type ProjectWorkspace = { pages: WorkspacePageSummary[] };

/** Cached per request so the shell layout and its pages share one read. */
export const loadProjectWorkspace = cache(async (projectId: string): Promise<ProjectWorkspace> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_documents")
    .select("id, title, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  // The Workspace must never keep the writer from the Manuscript: if it can't
  // be read (e.g. before migration 023 is applied), the shell opens without it.
  if (error) {
    console.error(`[rune2] Could not load the workspace: ${error.message}`);
    return { pages: [] };
  }
  return { pages: (data ?? []) as WorkspacePageSummary[] };
});
