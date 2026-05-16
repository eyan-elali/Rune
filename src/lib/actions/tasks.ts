"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

export async function createTask(
  text: string,
  due_date?: string
): Promise<ActionResult<Task>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      text,
      ...(due_date ? { due_date } : {}),
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/dashboard");
  return { data: data as Task, error: null };
}

export async function getTasks(): Promise<ActionResult<Task[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as Task[], error: null };
}

export async function updateTask(
  id: string,
  fields: Partial<Pick<Task, "text" | "completed" | "due_date">>
): Promise<ActionResult<Task>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("tasks")
    .update(fields)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/dashboard");
  return { data: data as Task, error: null };
}

export async function deleteTask(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { error: null };
}
