import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
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

  const [{ count }, { data: profile }] = await Promise.all([
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

  return <OnboardingClient authorName={authorName} />;
}
