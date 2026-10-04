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
import { hasBetaAccess } from "@/lib/beta";
import { claimBetaAccess } from "@/lib/betaAccess";
import { needsOnboarding, readOnboardingRow } from "@/lib/onboarding";
import { accountOf } from "@/lib/rune2/account";
import { hasChosenAppearance } from "@/lib/rune2/preferences";
import { buildThemeCss } from "@/lib/rune2/themes";
import type { PricingCohort } from "@/lib/pricing";
import type { Profile } from "@/lib/types";
import "./rune2.css";

// The Rune application: Projects (/projects), a Project (/projects/:id),
// Settings (/settings) and onboarding (/onboarding). Outside the legacy (app)
// route group, so nothing of the Rune 1.x frame renders here. Entry rules:
// signed in (the proxy also enforces this), a profile with a pen name (an
// account without one — even with no profile row at all — goes to
// /complete-profile), then beta access (Beta Completion E: an account without
// it goes to the front door's closed-beta state — the database refuses it a
// Project either way), and a supported (non-phone) device. It
// runs the editor infrastructure every page may need: the profile/cohort
// stores the save engine reads, NetworkProvider (online state + background
// sync of the offline queue), and the writer's account-wide preferences
// (RunePreferences), seeded here from the server so the first paint is right.
// The themes and writing surfaces (lib/rune2/themes.ts) arrive as one
// stylesheet with the page itself, before any Rune root paints.
//
// Theme continuity (Beta Completion E): an account still in onboarding that
// has not chosen an appearance is painted in System — the front door's theme
// — from this first server paint (the device gate's placeholder included)
// until the appearance step, so the journey never flashes Light. Only an
// account without a stored appearance is asked about; every other load costs
// nothing extra.

const THEME_CSS = buildThemeCss();

export const metadata: Metadata = {
  title: "Rune",
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
  // Then beta access. Only a definite answer turns the writer away; a failed check lets them in (lib/betaAccess.ts).
  const access = await claimBetaAccess(supabase, user.id);
  if (access !== null && !hasBetaAccess(access)) redirect("/");

  const unchosenAppearance = (await inOnboardingWithoutAppearance(supabase, user.id, profile)) ? "system" : undefined;

  return (
    <RunePreferencesProvider
      initial={profile?.preferences ?? null}
      account={accountOf(user, profile)}
      unchosenAppearance={unchosenAppearance}
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

/** Whether the writer is still in onboarding and has never chosen an appearance (lib/onboarding.ts decides the first). */
async function inOnboardingWithoutAppearance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  profile: Profile | null
): Promise<boolean> {
  if (hasChosenAppearance(profile?.preferences)) return false;
  const [{ data: row }, { count }] = await Promise.all([
    supabase.from("account_onboarding").select("path, project_id, completed_at").eq("user_id", userId).maybeSingle(),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return needsOnboarding(readOnboardingRow(row), {
    projectsEver: count ?? 0,
    hasWritten: Boolean(profile?.has_written_first_words),
  });
}
