"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getPenNameValidationError, normalizePenName } from "@/lib/penName";
import { PURCHASE_INTENT_COOKIE, parsePurchaseIntent } from "@/lib/purchaseIntent";

type CompletePenNameResult = {
  error: string | null;
  redirectTo?: string;
};

// Authenticated remediation write: saves the missing pen name for the
// current session's own profile row. Uses the normal RLS-bound server
// client (never the service-role key) and always scopes the update to the
// caller's own auth.uid(), so a client-supplied identity can never reach
// this function — there isn't one to supply.
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

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ display_name: penName })
    .eq("id", user.id);

  if (profileError) {
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

  const cookieStore = await cookies();
  const hasPendingScribeIntent =
    parsePurchaseIntent(cookieStore.get(PURCHASE_INTENT_COOKIE)?.value) !== null;
  if (hasPendingScribeIntent) {
    return { error: null, redirectTo: "/auth/continue" };
  }

  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return { error: null, redirectTo: (count ?? 0) > 0 ? "/dashboard" : "/onboarding" };
}
