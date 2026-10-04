"use client";

import { useLayoutEffect } from "react";
import { useProfileStore } from "@/store/profileStore";
import type { PricingCohort } from "@/lib/pricing";
import type { Profile } from "@/lib/types";

// Hydrates the client stores the manuscript editor's engine reads
// (useSceneEditor): the writer's id, tier, pricing cohort and preferences.
// The legacy AppShell does the same for (app); Rune 2.0 has no AppShell.
// Without it the engine has no user id and would not save.
export function Rune2Session({
  profile,
  pricingCohort,
}: {
  profile: Profile | null;
  pricingCohort: PricingCohort | null;
}) {
  const setProfile = useProfileStore((s) => s.setProfile);
  const setPricingCohort = useProfileStore((s) => s.setPricingCohort);

  useLayoutEffect(() => {
    if (profile) setProfile(profile);
  }, [profile, setProfile]);

  useLayoutEffect(() => {
    setPricingCohort(pricingCohort);
  }, [pricingCohort, setPricingCohort]);

  return null;
}
