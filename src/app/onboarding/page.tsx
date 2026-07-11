import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import { SupportedDeviceGate } from "@/components/layout/SupportedDeviceGate";
import { isPenNameMissing } from "@/lib/penName";
import { OnboardingClient } from "./OnboardingClient";

export const metadata = {
  title: "Begin Your Story | Rune",
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ count }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("display_name, username, has_written_first_words")
      .eq("id", user.id)
      .single(),
  ]);

  // Every account needs a chosen pen name before entering the writing
  // experience. Only redirect on a confirmed, successful lookup — a failed
  // fetch falls through rather than risking a redirect loop.
  if (!profileError && isPenNameMissing(profile?.display_name)) {
    redirect("/complete-profile");
  }

  // Users with existing projects belong in the app, not onboarding.
  if ((count ?? 0) > 0) {
    redirect("/dashboard");
  }

  // Best-effort — analytics must never block onboarding from rendering.
  try {
    const { error } = await recordAnalyticsEvent({ userId: user.id, eventName: "onboarding_started" });
    if (error) {
      console.error("[onboarding] recordAnalyticsEvent(onboarding_started) failed:", error);
    }
  } catch (err) {
    console.error("[onboarding] onboarding_started analytics threw:", err);
  }

  const authorName =
    profile?.display_name ||
    profile?.username ||
    user.email?.split("@")[0] ||
    null;

  return (
    <>
      {/* Rendered outside the device gate so signup attribution fires
          regardless of whether the phone waiting room is shown. */}
      <RegistrationTracker />
      <SupportedDeviceGate variant="new">
        <OnboardingClient authorName={authorName} />
      </SupportedDeviceGate>
    </>
  );
}
