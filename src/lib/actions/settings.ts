"use server";

import { createClient } from "@/lib/supabase/server";
import { getProjectIdsByManuscript } from "@/lib/manuscriptQueries";
import type { UserPreferences } from "@/lib/types";
import { readRunePreferences, validatePreferenceChange, type RunePreferences } from "@/lib/rune2/preferences";

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

/**
 * Saves account-wide Rune preferences (lib/rune2/preferences.ts): only those
 * keys, only valid values, merged into the writer's other preferences.
 * Returns what is stored afterwards, so a caller never assumes a write it
 * cannot see.
 */
export async function updateRunePreferences(
  change: Partial<RunePreferences>
): Promise<{ data: RunePreferences; error: null } | { data: null; error: string }> {
  const checked = validatePreferenceChange(change);
  if (checked.error !== null) return { data: null, error: checked.error };

  const { supabase, user } = await getAuthUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single();
  if (readError || !profile) return { data: null, error: "Your preferences couldn’t be read. Nothing was changed." };

  const merged = { ...((profile.preferences as Record<string, unknown> | null) ?? {}), ...checked.patch };
  const { data: saved, error } = await supabase
    .from("profiles")
    .update({ preferences: merged })
    .eq("id", user.id)
    .select("preferences")
    .single();
  if (error || !saved) return { data: null, error: "Your preference couldn’t be saved. Try again." };

  return { data: readRunePreferences(saved.preferences), error: null };
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
  let manuscripts: unknown[] = [];
  let manuscriptGroups: unknown[] = [];
  let chapters: unknown[] = [];
  let scenes: unknown[] = [];

  if (projectIds.length > 0) {
    const { data: manuscriptData } = await supabase
      .from("manuscripts")
      .select("*")
      .in("project_id", projectIds);
    manuscripts = manuscriptData ?? [];

    const manuscriptIds = (manuscriptData ?? []).map((m: { id: string }) => m.id);
    if (manuscriptIds.length > 0) {
      // Parts, Books, Acts… (chapters.group_id refers to these).
      const { data: groupData } = await supabase
        .from("manuscript_groups")
        .select("*")
        .in("manuscript_id", manuscriptIds);
      manuscriptGroups = groupData ?? [];

      const { data: chapterData } = await supabase
        .from("chapters")
        .select("*")
        .in("manuscript_id", manuscriptIds);
      chapters = chapterData ?? [];

      // Every Scene the writer owns, placed and Unplaced.
      const { data: sceneData } = await supabase
        .from("scenes")
        .select("*")
        .in("manuscript_id", manuscriptIds);
      scenes = sceneData ?? [];
    }
  }

  return {
    data: {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      projects: projects ?? [],
      manuscripts,
      manuscript_groups: manuscriptGroups,
      chapters,
      scenes,
    },
    error: null,
  };
}

export async function getRecentEditorChapter(): Promise<{
  projectId: string;
  chapterId: string;
} | null> {
  const { supabase, user } = await getAuthUser();
  if (!user) return null;

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id);

  const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
  if (!projectIds.length) return null;

  const { data: projectIdByManuscript } = await getProjectIdsByManuscript(supabase, projectIds);
  if (projectIdByManuscript.size === 0) return null;

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, manuscript_id")
    .in("manuscript_id", [...projectIdByManuscript.keys()])
    .order("updated_at", { ascending: false })
    .limit(1);

  const chapter = chapters?.[0];
  const projectId = chapter ? projectIdByManuscript.get(chapter.manuscript_id) : undefined;
  if (!chapter || !projectId) return null;
  return { projectId, chapterId: chapter.id };
}

export async function markFirstWordsSaved(): Promise<ActionResult> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({ has_written_first_words: true })
    .eq("id", user.id);

  return { error: error?.message ?? null };
}

// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only, no NEXT_PUBLIC_ prefix)
export async function deleteAccount(): Promise<ActionResult> {
  const { supabase, user } = await getAuthUser();
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

  // Snapshot the profile before the cascade wipes everything
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, xp, level, subscription_tier")
    .eq("id", user.id)
    .maybeSingle();

  // analytics_excluded_users cascades away with the profile below, so this
  // is the only chance to durably record whether the account was a Pulse
  // exclusion (founder/test) at the time of deletion — see migration 010.
  const { data: exclusion } = await admin
    .from("analytics_excluded_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  await admin.from("deleted_accounts").insert({
    original_user_id: user.id,
    email: user.email ?? null,
    username: profile?.username ?? null,
    display_name: profile?.display_name ?? null,
    xp: profile?.xp ?? null,
    level: profile?.level ?? null,
    subscription_tier: profile?.subscription_tier ?? null,
    was_excluded_account: Boolean(exclusion),
  });

  // The account's attachment bytes live outside the database, so the cascade
  // below cannot reach them: remove them first (every Project's, and any an
  // earlier Project deletion left recorded). Best effort: a failure is logged
  // (no keys, no content) and never blocks the deletion the writer asked for;
  // bytes left behind then sit under the deleted Projects' key prefixes.
  await removeAccountAttachmentBytes(admin, user.id);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  return { error: error?.message ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function removeAccountAttachmentBytes(admin: any, userId: string): Promise<void> {
  try {
    const { data: projects } = await admin.from("projects").select("id").eq("user_id", userId);
    const projectIds = ((projects ?? []) as { id: string }[]).map((p) => p.id);
    const keys: string[] = [];
    if (projectIds.length > 0) {
      const { data: rows } = await admin
        .from("workspace_attachments")
        .select("storage_key, display_key")
        .in("project_id", projectIds);
      for (const r of (rows ?? []) as { storage_key: string; display_key: string | null }[]) {
        keys.push(r.storage_key);
        if (r.display_key) keys.push(r.display_key);
      }
    }
    const { data: purges } = await admin.from("project_storage_purges").select("id, storage_keys").eq("user_id", userId);
    for (const p of (purges ?? []) as { storage_keys: string[] }[]) keys.push(...p.storage_keys);
    if (keys.length === 0) return;

    const { supabaseAttachmentStorage } = await import("@/lib/attachments/storage");
    const storage = supabaseAttachmentStorage();
    for (let i = 0; i < keys.length; i += 500) await storage.remove(keys.slice(i, i + 500));
    await admin.from("project_storage_purges").delete().eq("user_id", userId);
  } catch {
    console.error("[deleteAccount] attachment bytes could not all be removed", { succeeded: false });
  }
}
