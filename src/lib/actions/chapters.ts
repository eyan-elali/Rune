"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Chapter } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getChapters(projectId: string): Promise<
  ActionResult<
    (Chapter & { pages: { id: string; word_count: number }[] })[]
  >
> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("chapters")
    .select("*, pages(id, word_count)")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: (data as typeof data & { pages: { id: string; word_count: number }[] }[]) ?? [], error: null };
}

export async function createChapter(
  projectId: string,
  title: string,
  position: number
): Promise<ActionResult<Chapter>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("chapters")
    .insert({ project_id: projectId, title: title.trim(), position })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data, error: null };
}

export async function updateChapter(
  id: string,
  fields: Partial<Pick<Chapter, "title" | "position">>,
  projectId: string
): Promise<ActionResult<Chapter>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("chapters")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data, error: null };
}

export async function deleteChapter(
  id: string,
  projectId: string
): Promise<{ error: string | null }> {
  const { supabase } = await getUser();

  const { error } = await supabase.from("chapters").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}
