import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SupportedDeviceGate } from "@/components/layout/SupportedDeviceGate";
import NetworkProvider from "@/components/providers/NetworkProvider";
import { Rune2Session } from "@/components/rune2/Rune2Session";
import { isPenNameMissing } from "@/lib/penName";
import type { PricingCohort } from "@/lib/pricing";
import type { Profile } from "@/lib/types";
import "./rune2.css";

// Rune 2.0 — a separate shell, deliberately outside the (app) route group so
// nothing of the legacy AppShell, Sidebar or theme chrome renders here. It
// keeps the same entry rules as (app): signed in (the proxy also enforces
// this), a pen name chosen, and a supported (non-phone) device. It also runs
// the same editor infrastructure: the profile/cohort stores the save engine
// reads, and NetworkProvider (online state + background sync of the offline
// queue).

export const metadata: Metadata = {
  title: "Rune 2.0",
};

export default async function Rune2Layout({ children }: { children: ReactNode }) {
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
    <>
      <NetworkProvider />
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
    </>
  );
}
