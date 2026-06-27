import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPages } from "@/lib/actions/pages";
import { getChapters } from "@/lib/actions/chapters";
import { EditorShell } from "@/components/editor/EditorShell";
import { OfflineEditorFallback } from "@/components/editor/OfflineEditorFallback";

interface ChapterEditorPageProps {
  params: Promise<{ projectId: string; chapterId: string }>;
}

function isNetworkError(err: { message?: string; status?: number; code?: string } | null): boolean {
  if (!err) return false;
  if ("status" in err && err.status === 0) return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed")
  );
}

export default async function ChapterEditorPage({
  params,
}: ChapterEditorPageProps) {
  const { projectId, chapterId } = await params;
  const supabase = await createClient();

  const [chapterResult, projectResult, pagesResult, chaptersResult, userResult] =
    await Promise.all([
      supabase.from("chapters").select("*").eq("id", chapterId).single(),
      supabase.from("projects").select("*").eq("id", projectId).single(),
      getPages(chapterId),
      getChapters(projectId),
      supabase.auth.getUser(),
    ]);

  const { data: chapter, error: chapterError } = chapterResult;
  const { data: project, error: projectError } = projectResult;

  if (!chapter || !project) {
    if (isNetworkError(chapterError) || isNetworkError(projectError)) {
      return (
        <div className="min-h-0 h-full">
          <OfflineEditorFallback projectId={projectId} chapterId={chapterId} />
        </div>
      );
    }
    notFound();
  }

  // Determine first-time onboarding state.
  // Only show the cinematic onboarding experience when we can confirm the user
  // has not yet saved their first words. Defaults to false on any error (offline etc.)
  const userId = userResult.data.user?.id;
  let isOnboarding = false;
  if (userId) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("has_written_first_words")
      .eq("id", userId)
      .single();

    if (!isNetworkError(profileError)) {
      isOnboarding = profileData?.has_written_first_words === false;
    }
  }

  return (
    <div className="min-h-0 h-full">
      <EditorShell
        projectId={projectId}
        chapterId={chapterId}
        initialPages={pagesResult.data ?? []}
        chapter={chapter}
        project={project}
        allChapters={chaptersResult.data ?? []}
        isOnboarding={isOnboarding}
      />
    </div>
  );
}
