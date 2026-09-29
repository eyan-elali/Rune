"use server";

import { createClient } from "@/lib/supabase/server";
import { getManuscriptIdForProject } from "@/lib/manuscriptQueries";
import { SCENE_NOTE_MAX, type SceneRevisionNote } from "@/lib/rune2/sceneNotes";

// Scene revision notes (migration 038). Reads go through RLS (the owner's
// notes of active Scenes only; a trashed Scene's note is hidden until it is
// restored). The one write is save_scene_revision_note: owner-checked,
// version-checked, and it never writes the Scene — so a note never changes
// the Scene's version, word count, history, writing sessions or the
// manuscript total. Nothing here reads or returns prose.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

const COLUMNS = "scene_id, body, version, updated_at";

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** One Scene's note, or null when it has none. */
export async function getSceneNote(sceneId: string): Promise<ActionResult<SceneRevisionNote | null>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("scene_revision_notes")
    .select(COLUMNS)
    .eq("scene_id", sceneId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as SceneRevisionNote | null) ?? null, error: null };
}

/** Every note of the Project's active Scenes (placed or Unplaced), any order. */
export async function listSceneNotes(projectId: string): Promise<ActionResult<SceneRevisionNote[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: null, error: "Project not found" };

  const { data, error } = await supabase
    .from("scene_revision_notes")
    .select(COLUMNS)
    .eq("manuscript_id", manuscriptId);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as SceneRevisionNote[], error: null };
}

export type SaveSceneNoteResult =
  /** Saved; `note` null: the note was blank and is removed. */
  | { status: "ok"; note: SceneRevisionNote | null }
  /** The note changed since `baseVersion` was read; nothing was written. `note`: what is stored now. */
  | { status: "conflict"; note: SceneRevisionNote | null }
  | { status: "error"; error: string };

/**
 * Saves a Scene's note. `baseVersion` is the version the writer's copy was
 * read at (0: there was no note); null writes regardless (the writer chose
 * to keep their text over a newer one). A blank body removes the note.
 */
export async function saveSceneNote(
  sceneId: string,
  body: string,
  baseVersion: number | null
): Promise<SaveSceneNoteResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };
  if (body.length > SCENE_NOTE_MAX) return { status: "error", error: "A revision note can be at most 20,000 characters" };

  const { data, error } = await supabase.rpc("save_scene_revision_note", {
    p_scene_id: sceneId,
    p_body: body,
    p_base_version: baseVersion,
  });
  if (error) return { status: "error", error: error.message };
  const result = data as SaveSceneNoteResult;
  if (result.status === "error") return result;
  return { status: result.status, note: result.note ?? null };
}
