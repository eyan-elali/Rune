export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import {
  checkAndGrantUnlockables,
  getUserUnlockables,
} from "@/lib/actions/unlockables";
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

  const newlyGranted = await checkAndGrantUnlockables(user!.id);
  const unlockedIds = new Set([
    ...userUnlockables.map((u) => u.unlockable_id),
    ...newlyGranted,
  ]);

  return (
    <SettingsClient
      profile={profile as Profile | null}
      email={user?.email ?? ""}
      unlockedIds={unlockedIds}
    />
  );
}
