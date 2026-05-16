"use server";

import { createClient } from "@/lib/supabase/server";
import type { UserPreferences } from "@/lib/types";

type ActionResult = { error: string | null };

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function updateProfile(fields: {
  display_name?: string;
  username?: string;
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { error: "Not authenticated" };

  if (fields.username) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", fields.username.trim())
      .neq("id", user.id)
      .maybeSingle();
    if (existing) return { error: "Username is already taken" };
  }

  const update: Record<string, string> = {};
  if (fields.display_name !== undefined) update.display_name = fields.display_name.trim();
  if (fields.username !== undefined) update.username = fields.username.trim();

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  return { error: error?.message ?? null };
}

export async function updatePreferences(
  preferences: Partial<UserPreferences>
): Promise<ActionResult> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single();

  const merged = {
    ...(profile?.preferences as Record<string, unknown> ?? {}),
    ...preferences,
  };

  const { error } = await supabase
    .from("profiles")
    .update({ preferences: merged })
    .eq("id", user.id);

  return { error: error?.message ?? null };
}

export async function exportUserData(): Promise<{
  data: unknown;
  error: string | null;
}> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id);

  const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
  let chapters: unknown[] = [];
  let pages: unknown[] = [];

  if (projectIds.length > 0) {
    const { data: chapterData } = await supabase
      .from("chapters")
      .select("*")
      .in("project_id", projectIds);
    chapters = chapterData ?? [];

    const chapterIds = (chapterData ?? []).map((c: { id: string }) => c.id);
    if (chapterIds.length > 0) {
      const { data: pageData } = await supabase
        .from("pages")
        .select("*")
        .in("chapter_id", chapterIds);
      pages = pageData ?? [];
    }
  }

  return {
    data: {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      projects: projects ?? [],
      chapters,
      pages,
    },
    error: null,
  };
}

// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only, no NEXT_PUBLIC_ prefix)
export async function deleteAccount(): Promise<ActionResult> {
  const { user } = await getAuthUser();
  if (!user) return { error: "Not authenticated" };

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return { error: "Account deletion is not configured. Please contact support." };
  }

  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await admin.auth.admin.deleteUser(user.id);
  return { error: error?.message ?? null };
}
