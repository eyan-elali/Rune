"use server";

import { createClient } from "@/lib/supabase/server";
import { getManuscriptIdForProject } from "@/lib/manuscriptQueries";
import { READING_BATCH } from "@/lib/rune2/reading";

// Reading Mode (Milestone 18): the canonical prose of some of a Project's
// Scenes, read-only. It reads the live Scene rows — never a copy — so what
// the writer reads is what the Scene holds now, and it writes nothing: no
// Scene, no cache, no writing credit. RLS hides Scenes in Trash, and only
// Scenes of this Project's Manuscript are returned, whatever ids are asked
// for. Order is the caller's: Reading Mode arranges Scenes itself, from the
// manuscript structure or a Scene View (lib/rune2/reading.ts).

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

export type ReadingScene = {
  id: string;
  content: Record<string, unknown> | null;
  word_count: number;
  version: number;
  updated_at: string;
};

export async function getReadingScenes(
  projectId: string,
  sceneIds: string[]
): Promise<ActionResult<ReadingScene[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };
  if (sceneIds.length === 0) return { data: [], error: null };
  if (sceneIds.length > READING_BATCH) return { data: null, error: "Too many scenes in one request" };

  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: null, error: "Project not found" };

  const { data, error } = await supabase
    .from("scenes")
    .select("id, content, word_count, version, updated_at")
    .eq("manuscript_id", manuscriptId)
    .in("id", sceneIds);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as ReadingScene[], error: null };
}

/**
 * Every active Scene's current version (placed and Unplaced), no prose — so
 * Reading Mode, shown again after an edit, re-reads only the Scenes that
 * changed since it last read them.
 */
export async function getReadingVersions(
  projectId: string
): Promise<ActionResult<{ id: string; version: number }[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: null, error: "Project not found" };

  const { data, error } = await supabase.from("scenes").select("id, version").eq("manuscript_id", manuscriptId);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as { id: string; version: number }[], error: null };
}
