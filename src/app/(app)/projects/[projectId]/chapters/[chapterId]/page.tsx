import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getScenes, getAccountWordTotal } from "@/lib/actions/scenes";
import { getChapters } from "@/lib/actions/chapters";
import { getUnplacedSceneSummaries } from "@/lib/manuscriptQueries";
import { isNetworkError } from "@/lib/networkError";
import { EditorShell } from "@/components/editor/EditorShell";
import { OfflineEditorFallback } from "@/components/editor/OfflineEditorFallback";

interface ChapterEditorPageProps {
  params: Promise<{ projectId: string; chapterId: string }>;
  searchParams: Promise<{ tutorial?: string }>;
}

export default async function ChapterEditorPage({
  params,
  searchParams,
}: ChapterEditorPageProps) {
  const { projectId, chapterId } = await params;
  const { tutorial } = await searchParams;
  const showTutorial = tutorial === "editor" || tutorial === "returning";
  const forceTutorial = tutorial === "returning";
  const supabase = await createClient();

  const [chapterResult, projectResult, scenesResult, chaptersResult, accountWordTotal, unplacedResult] =
    await Promise.all([
      supabase.from("chapters").select("*").eq("id", chapterId).single(),
      supabase.from("projects").select("*").eq("id", projectId).single(),
      getScenes(chapterId),
      getChapters(projectId),
      getAccountWordTotal(),
      getUnplacedSceneSummaries(supabase, projectId),
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

  return (
    <div className="min-h-0 h-full">
      <EditorShell
        projectId={projectId}
        initialPages={scenesResult.data ?? []}
        chapter={chapter}
        project={project}
        allChapters={chaptersResult.data ?? []}
        unplacedCount={unplacedResult.data.length}
        showTutorial={showTutorial}
        forceTutorial={forceTutorial}
        accountWordTotal={accountWordTotal}
      />
    </div>
  );
}
