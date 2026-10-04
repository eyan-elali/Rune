"use server";

import { createClient } from "@/lib/supabase/server";
import { getPenNameValidationError, normalizePenName } from "@/lib/penName";

type CompletePenNameResult = {
  error: string | null;
  redirectTo?: string;
};

// The required profile step (/complete-profile): saves the pen name for the
// current session's own account through complete_profile (migration 053),
// which also creates the profile if the account has none — never with a
// placeholder name. Idempotent, so a refresh or a second submit leaves one
// profile. Uses the normal server client (never the service-role key); the
// database scopes it to auth.uid(), so a client-supplied identity can never
// reach this function — there isn't one to supply.
export async function completePenName(rawPenName: string): Promise<CompletePenNameResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const validationError = getPenNameValidationError(rawPenName);
  if (validationError) {
    return { error: validationError };
  }

  const penName = normalizePenName(rawPenName);

  const { data: saved, error: profileError } = await supabase.rpc("complete_profile", { p_display_name: penName });

  if (profileError || (saved as { display_name?: unknown } | null)?.display_name !== penName) {
    console.error("[completePenName] profile update failed", { succeeded: false });
    return { error: "Something went wrong. Please try again." };
  }

  // Some parts of Rune still read user_metadata.display_name (e.g. the
  // signup flow writes it there); keep it in sync with the profile row.
  const { error: metadataError } = await supabase.auth.updateUser({
    data: { display_name: penName },
  });
  if (metadataError) {
    console.error("[completePenName] auth metadata sync failed", { succeeded: false });
  }

  // Projects sends an account that still needs onboarding on to it (lib/onboarding.ts).
  return { error: null, redirectTo: "/projects" };
}

/**
 * Changes the signed-in writer's pen name (Settings): the same rules and the
 * same two writes as completePenName, without its onboarding routing.
 * Returns the stored pen name.
 */
export async function updatePenName(rawPenName: string): Promise<{ data: string; error: null } | { data: null; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const validationError = getPenNameValidationError(rawPenName);
  if (validationError) return { data: null, error: validationError };
  const penName = normalizePenName(rawPenName);

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: penName })
    .eq("id", user.id)
    .select("display_name")
    .single();
  if (error || !data) {
    console.error("[updatePenName] profile update failed", { succeeded: false });
    return { data: null, error: "Your pen name couldn’t be saved. Try again." };
  }

  const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: penName } });
  if (metadataError) console.error("[updatePenName] auth metadata sync failed", { succeeded: false });

  return { data: data.display_name as string, error: null };
}
