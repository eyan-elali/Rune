export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { getUserUnlockables } from "@/lib/actions/unlockables";
import { SettingsClient } from "./SettingsClient";
import type { Profile } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, userUnlockables] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single(),
    getUserUnlockables(user!.id),
  ]);

  const unlockedIds = new Set(userUnlockables.map((u) => u.unlockable_id));

  return (
    <SettingsClient
      profile={profile as Profile | null}
      email={user?.email ?? ""}
      unlockedIds={unlockedIds}
    />
  );
}
