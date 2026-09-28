"use server";

import { createClient } from "@/lib/supabase/server";
import type { ContentMatch } from "@/lib/rune2/projectSearch";

// Project Search, the half the shell can't do alone: text INSIDE the
// Project's Scenes, Pages and Entries (migration 029). Titles are matched in
// the shell from the structure it has already loaded (lib/rune2/projectSearch.ts);
// only prose needs a read. The search is one SECURITY INVOKER function —
// the writer's own Row Level Security, and nothing outside their Project —
// that reads the text and returns ids and a short excerpt. Nothing is written
// and no copy of any prose is kept.
//
// The query may be words from the manuscript: it is never logged.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * The Project's Scenes (placed and Unplaced), Pages and Entries whose text
 * contains `query`, ignoring case. Fewer than CONTENT_QUERY_MIN characters
 * (lib/rune2/projectSearch.ts) searches nothing: those match titles only.
 */
export async function searchProjectContent(projectId: string, query: string): Promise<ActionResult<ContentMatch[]>> {
  if (!UUID.test(projectId)) return { data: null, error: "Project not found" };
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 200) return { data: [], error: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("search_project_content", { p_project_id: projectId, p_query: q });
  if (error) {
    // Before migration 029 (or on any failure) search keeps finding titles.
    // The code only: a message could quote what was searched for.
    console.error(`[rune2] Project content search failed (${error.code ?? "unknown"})`);
    return { data: null, error: "Text search is unavailable" };
  }
  return { data: (data ?? []) as ContentMatch[], error: null };
}
