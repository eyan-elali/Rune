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
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error }, { count: trashedCount }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("trashed_at", "is", null),
  ]);

  return (
    <RuneSettings account={accountOf(user, profile)} trashedCount={trashedCount ?? 0} profileError={error ? error.message : null} />
  );
}
