import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPenNameValidationError } from "@/lib/penName";
import { readProfileState } from "@/lib/accountGate";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import CompleteProfileClient from "./CompleteProfileClient";

export const metadata: Metadata = {
  title: "Choose your pen name",
};

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const state = await readProfileState(supabase, user.id, "display_name");

  // Only an account whose profile exists with a pen name has nothing to do
  // here — send it on to Projects (which sends an account still needing
  // onboarding on to it). A missing profile is exactly what this page is
  // for; if the lookup itself failed, fail safely by rendering the form.
  if (state.status === "complete") redirect("/projects");

  // The pen name chosen at signup (kept in the account's metadata), offered
  // as the starting value — the writer still confirms it.
  const signupPenName = user.user_metadata?.display_name;
  const initialPenName =
    typeof signupPenName === "string" && getPenNameValidationError(signupPenName) === null ? signupPenName.trim() : "";

  return (
    <>
      {/* Catches registered=1 for the rare case a brand-new signup still
          lands here (e.g. a pre-existing incomplete account was reused). */}
      <RegistrationTracker />
      <CompleteProfileClient initialPenName={initialPenName} />
    </>
  );
}
