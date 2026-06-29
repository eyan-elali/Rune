"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProjectNote } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

export async function listProjectNotes(
  projectId: string
): Promise<ActionResult<ProjectNote[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("project_notes")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as ProjectNote[], error: null };
}

export async function createProjectNote(
  projectId: string,
  content: string
): Promise<ActionResult<ProjectNote>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("project_notes")
    .insert({ project_id: projectId, user_id: user.id, content })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  return { data: data as ProjectNote, error: null };
}

export async function completeProjectNote(
  noteId: string
): Promise<ActionResult<ProjectNote>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("project_notes")
    .update({ is_completed: true, is_pinned: false, completed_at: now, updated_at: now })
    .eq("id", noteId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/dashboard");
  return { data: data as ProjectNote, error: null };
}

export async function deleteProjectNote(
  noteId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("project_notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { error: null };
}

export async function pinProjectNote(
  noteId: string,
  projectId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const now = new Date().toISOString();

  // Unpin all other active notes in this project
  await supabase
    .from("project_notes")
    .update({ is_pinned: false, updated_at: now })
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .neq("id", noteId);

  const { error } = await supabase
    .from("project_notes")
    .update({ is_pinned: true, updated_at: now })
    .eq("id", noteId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { error: null };
}

export async function unpinProjectNote(
  noteId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("project_notes")
    .update({ is_pinned: false, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { error: null };
}
