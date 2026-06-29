import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  if ((count ?? 0) > 0) {
    // Returning writer who has already written their first words → dashboard.
    // `!== false` catches true, null, and undefined — all mean "not actively onboarding".
    if (profile?.has_written_first_words !== false) {
      redirect("/dashboard");
    }

    // User has a project but has_written_first_words is still false.
    // This happens when they refresh during onboarding before the first save.
    // Redirect them to their existing project's editor so they continue rather than
    // creating a second project.
    const { data: firstProject } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (firstProject) {
      const { data: firstChapter } = await supabase
        .from("chapters")
        .select("id")
        .eq("project_id", firstProject.id)
        .order("position", { ascending: true })
        .limit(1)
        .single();

      if (firstChapter) {
        redirect(`/projects/${firstProject.id}/chapters/${firstChapter.id}`);
      }
    }

    redirect("/dashboard");
  }

  const authorName =
    profile?.display_name ||
    profile?.username ||
    user.email?.split("@")[0] ||
    null;

  return <OnboardingClient authorName={authorName} />;
}
