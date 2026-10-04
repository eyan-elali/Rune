import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import { Onboarding } from "@/components/rune2/Onboarding";
import { needsOnboarding, onboardingStep, readOnboardingRow } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Welcome" };

// Onboarding (Beta Completion E): a short transition into Rune, once per
// account — Welcome, how the writer is starting (a new Project or an import),
// what Rune is (the Manuscript, and the Workspace around it), an optional
// appearance, and arrival. The (rune2) layout has already required sign-in,
// beta access and a pen name.
//
// Where the account is comes from the server (account_onboarding, 052): a
// refresh resumes where the journey was, a completed journey (or an account
// from before onboarding existed) goes to Projects, and once a Project is
// made the journey resumes after it — never a second Project.

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: rowData }, { count: projectsEver }, { data: profile }] = await Promise.all([
    supabase.from("account_onboarding").select("path, project_id, completed_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("profiles").select("has_written_first_words").eq("id", user.id).maybeSingle(),
  ]);
  const row = readOnboardingRow(rowData);
  if (!needsOnboarding(row, { projectsEver: projectsEver ?? 0, hasWritten: Boolean(profile?.has_written_first_words) })) {
    redirect("/projects");
  }

  let project: { id: string; title: string } | null = null;
  if (row?.project_id) {
    const { data } = await supabase.from("projects").select("id, title").eq("id", row.project_id).maybeSingle();
    if (data) project = { id: data.id as string, title: (data.title as string) || "Untitled" };
  }

  if (!row) {
    // Once per account (deduplicated by the analytics write); never blocks the page.
    try {
      await recordAnalyticsEvent({ userId: user.id, eventName: "onboarding_started" });
    } catch {
      // Ignored.
    }
  }

  return <Onboarding initialStep={onboardingStep(row, project !== null)} project={project} />;
}
