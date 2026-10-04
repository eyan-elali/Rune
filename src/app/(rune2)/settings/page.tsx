import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountOf } from "@/lib/rune2/account";
import { RuneSettings } from "@/components/rune2/RuneSettings";

export const metadata: Metadata = { title: "Settings" };

// Settings (Beta Completion A): the writer's account-wide preferences, what is
// kept on this device, and the account. A Project's own settings live with
// the Project (its title menu, and Projects). The preferences themselves come
// from RunePreferences, seeded by the layout.
//
// Opened from inside a Project (the account control at the foot of its
// navigator), it carries ?from=<project id> and offers the way back to that
// Project — read here, under the writer's own access, so another writer's id
// or a Project in Trash simply offers Projects instead.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from } = await searchParams;
  const fromId = typeof from === "string" && UUID.test(from) ? from : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error }, { count: trashedCount }, { data: fromProject }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("trashed_at", "is", null),
    fromId
      ? supabase.from("projects").select("id, title").eq("id", fromId).is("trashed_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <RuneSettings
      account={accountOf(user, profile)}
      trashedCount={trashedCount ?? 0}
      profileError={error ? error.message : null}
      returnTo={fromProject ? { id: fromProject.id as string, title: (fromProject.title as string) || "Untitled" } : null}
    />
  );
}
