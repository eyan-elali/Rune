import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SupportedDeviceGate } from "@/components/layout/SupportedDeviceGate";
import NetworkProvider from "@/components/providers/NetworkProvider";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import { HintsProvider } from "@/components/rune2/Hint";
import { RunePreferencesProvider, RuneRoot } from "@/components/rune2/RunePreferences";
import { Rune2Session } from "@/components/rune2/Rune2Session";
import { COMPLETE_PROFILE_PATH, needsProfileCompletion, readProfileState } from "@/lib/accountGate";
import { accountOf } from "@/lib/rune2/account";
import { buildThemeCss } from "@/lib/rune2/themes";
import type { PricingCohort } from "@/lib/pricing";
import type { Profile } from "@/lib/types";
import "./rune2.css";

// The Rune application: Projects (/projects), a Project (/projects/:id),
// Settings (/settings) and onboarding (/onboarding). Outside the legacy (app)
// route group, so nothing of the Rune 1.x frame renders here. Entry rules:
// signed in (the proxy also enforces this), a profile with a pen name (an
// account without one — even with no profile row at all — goes to
// /complete-profile), and a supported (non-phone) device. There is no access
// list: since Early Access (migration 056) every account with a profile may
// use Sutura. It
// runs the editor infrastructure every page may need: the profile/cohort
// stores the save engine reads, NetworkProvider (online state + background
// sync of the offline queue), and the writer's account-wide preferences
// (RunePreferences), seeded here from the server so the first paint is right.
// The themes and writing surfaces (lib/rune2/themes.ts) arrive as one
// stylesheet with the page itself, before any Rune root paints.
//
// Theme continuity: the public pages and sign-in are always Sutura Light
// (PublicFrame), and an account that has not chosen an appearance paints the
// default, Light — so sign-up flows into onboarding in one appearance, with
// no flash of the operating system's dark mode, until the writer chooses.

const THEME_CSS = buildThemeCss();

export const metadata: Metadata = {
  title: "Sutura",
};

export default async function RuneLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileState, { data: entitlement }] = await Promise.all([
    readProfileState<Profile>(supabase, user.id),
    supabase
      .from("user_pricing_entitlements")
      .select("pricing_cohort")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  // The profile comes first (lib/accountGate.ts): no profile, or no pen name, is never let in.
  if (needsProfileCompletion(profileState)) redirect(COMPLETE_PROFILE_PATH);
  const profile = profileState.status === "complete" ? profileState.profile : null;

  return (
    <RunePreferencesProvider
      initial={profile?.preferences ?? null}
      account={accountOf(user, profile)}
    >
      <style id="r2-themes" dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      <NetworkProvider />
      {/* Clears a new signup's ?registered=1. The pixel event itself is sent only on the
          public front door (lib/meta-pixel MARKETING_PATHS), so here it is a no-op. */}
      <RegistrationTracker />
      <Rune2Session
        profile={profile as Profile | null}
        pricingCohort={(entitlement?.pricing_cohort as PricingCohort | undefined) ?? null}
      />
      <SupportedDeviceGate
        variant="returning"
        preferences={profile?.preferences as Record<string, unknown> | null}
        // Until the device is known (the server's paint), the writer's own
        // theme — never the Rune 1.x splash, which would flash another palette.
        placeholder={<RuneRoot className="r2-gate" aria-hidden />}
      >
        <HintsProvider initial={profile?.preferences ?? null}>{children}</HintsProvider>
      </SupportedDeviceGate>
    </RunePreferencesProvider>
  );
}
