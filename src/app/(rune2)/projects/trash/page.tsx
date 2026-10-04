import type { Metadata } from "next";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAttachmentStorage } from "@/lib/attachments/storage";
import { sweepProjectStoragePurges } from "@/lib/projectLifecycle";
import { accountOf } from "@/lib/rune2/account";
import { ProjectTrash, type TrashedProjectSummary } from "@/components/rune2/ProjectTrash";

export const metadata: Metadata = { title: "Trash" };

// Project Trash (Beta Completion A, migration 049): the Projects the writer
// moved to Trash, most recent first, each whole. Restore brings one back as it
// was; Delete permanently is offered only here, behind a typed confirmation.
export default async function ProjectTrashPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: rows, error }, { data: profile }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, word_count, trashed_at")
      .eq("user_id", user.id)
      .not("trashed_at", "is", null)
      .order("trashed_at", { ascending: false }),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  // Attachment bytes an earlier permanent deletion could not remove yet: retried
  // after the response, never delaying the page or failing it.
  after(async () => {
    try {
      await sweepProjectStoragePurges(await createClient(), supabaseAttachmentStorage());
    } catch {
      // Retried on the next visit.
    }
  });

  const projects: TrashedProjectSummary[] = (rows ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    words: (p.word_count as number | null) ?? 0,
    trashedAt: p.trashed_at as string,
  }));

  return <ProjectTrash account={accountOf(user, profile)} projects={projects} loadError={error ? error.message : null} />;
}
