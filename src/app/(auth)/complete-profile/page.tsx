import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isPenNameMissing } from "@/lib/penName";
import { PURCHASE_INTENT_COOKIE, parsePurchaseIntent } from "@/lib/purchaseIntent";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import CompleteProfileClient from "./CompleteProfileClient";

export const metadata: Metadata = {
  title: "Choose your pen name — Rune",
};

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  // A user who already has a valid pen name has nothing to do here — send
  // them on to wherever they'd normally land. If the lookup itself failed,
  // fail safely by rendering the form rather than guessing.
  if (!profileError && !isPenNameMissing(profile?.display_name)) {
    const cookieStore = await cookies();
    const hasPendingScribeIntent =
      parsePurchaseIntent(cookieStore.get(PURCHASE_INTENT_COOKIE)?.value) !== null;
    if (hasPendingScribeIntent) {
      redirect("/auth/continue");
    }
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    redirect((count ?? 0) > 0 ? "/dashboard" : "/onboarding");
  }

  return (
    <>
      {/* Catches registered=1 for the rare case a brand-new signup still
          lands here (e.g. a pre-existing incomplete account was reused). */}
      <RegistrationTracker />
      <CompleteProfileClient />
    </>
  );
}
