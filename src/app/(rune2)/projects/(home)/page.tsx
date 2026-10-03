import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectsHome, type ProjectSummary } from "@/components/rune2/ProjectsHome";
import { accountOf } from "@/lib/rune2/account";

export const metadata: Metadata = { title: "Projects" };

// Projects: the application's home (Beta Completion A). Active Projects only,
// most recently worked in first; Trash is counted for its link.
//
// A brand-new account — no Project ever, active or in Trash, and no words
// written — is sent to onboarding, as the Rune 1.x Dashboard did, so the
// signup journey is unchanged. Any other account with no active Project sees
// the empty state.

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; trashed?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: rows, error }, { count: trashedCount }, { data: profile }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, word_count, updated_at")
      .eq("user_id", user.id)
      .is("trashed_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("trashed_at", "is", null),
    supabase.from("profiles").select("display_name, has_written_first_words").eq("id", user.id).maybeSingle(),
  ]);

  const { registered, trashed } = await searchParams;
  if (!error && rows?.length === 0 && trashedCount === 0 && profile && !profile.has_written_first_words) {
    redirect(registered === "1" ? "/onboarding?registered=1" : "/onboarding");
  }

  const projects: ProjectSummary[] = (rows ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    words: (p.word_count as number | null) ?? 0,
    updatedAt: p.updated_at as string,
  }));

  // A Project moved to Trash from inside it lands here with ?trashed=<id>, for Undo.
  let trashedNow: { id: string; title: string } | null = null;
  if (trashed && /^[0-9a-f-]{36}$/i.test(trashed)) {
    const { data } = await supabase
      .from("projects")
      .select("id, title")
      .eq("id", trashed)
      .not("trashed_at", "is", null)
      .maybeSingle();
    if (data) trashedNow = { id: data.id as string, title: data.title as string };
  }

  return (
    <ProjectsHome
      account={accountOf(user, profile)}
      projects={projects}
      trashedCount={trashedCount ?? 0}
      loadError={error ? error.message : null}
      trashedNow={trashedNow}
    />
  );
}
