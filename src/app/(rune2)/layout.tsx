import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SupportedDeviceGate } from "@/components/layout/SupportedDeviceGate";
import NetworkProvider from "@/components/providers/NetworkProvider";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import { RunePreferencesProvider } from "@/components/rune2/RunePreferences";
import { Rune2Session } from "@/components/rune2/Rune2Session";
import { isPenNameMissing } from "@/lib/penName";
import type { PricingCohort } from "@/lib/pricing";
import type { Profile } from "@/lib/types";
import "./rune2.css";

// The Rune application: Projects (/projects), a Project (/projects/:id) and
// Settings (/settings). Outside the legacy (app) route group, so nothing of
// the Rune 1.x frame renders here. Entry rules: signed in (the proxy also
// enforces this), a pen name chosen, and a supported (non-phone) device. It
// runs the editor infrastructure every page may need: the profile/cohort
// stores the save engine reads, NetworkProvider (online state + background
// sync of the offline queue), and the writer's account-wide preferences
// (RunePreferences), seeded here from the server so the first paint is right.

export const metadata: Metadata = {
  title: "Rune",
};

export default async function RuneLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error }, { data: entitlement }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("user_pricing_entitlements")
      .select("pricing_cohort")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!error && profile && isPenNameMissing(profile.display_name)) {
    redirect("/complete-profile");
  }

  return (
    <RunePreferencesProvider initial={profile?.preferences ?? null}>
      <NetworkProvider />
      {/* A new signup's CompleteRegistration pixel (?registered=1), outside the device gate. */}
      <RegistrationTracker />
      <Rune2Session
        profile={profile as Profile | null}
        pricingCohort={(entitlement?.pricing_cohort as PricingCohort | undefined) ?? null}
      />
      <SupportedDeviceGate
        variant="returning"
        preferences={profile?.preferences as Record<string, unknown> | null}
      >
        {children}
      </SupportedDeviceGate>
    </RunePreferencesProvider>
  );
}
