import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountWordTotal, getUnplacedScenes } from "@/lib/actions/scenes";
import { getChapters } from "@/lib/actions/chapters";
import { isNetworkError } from "@/lib/networkError";
import { EditorShell } from "@/components/editor/EditorShell";
import { OfflineEditorFallback } from "@/components/editor/OfflineEditorFallback";

interface UnplacedScenesPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ scene?: string }>;
}

/**
 * The Project's Unplaced Scenes in the manuscript editor: the same editor,
 * autosave and offline protection as a Chapter, with no narrative order. With
 * none yet, the editor offers to start one here.
 */
export default async function UnplacedScenesPage({
  params,
  searchParams,
}: UnplacedScenesPageProps) {
  const { projectId } = await params;
  const { scene } = await searchParams;
  const supabase = await createClient();

  const [projectResult, scenesResult, chaptersResult, accountWordTotal] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    getUnplacedScenes(projectId),
    getChapters(projectId),
    getAccountWordTotal(),
  ]);

  const { data: project, error: projectError } = projectResult;

  if (!project) {
    if (isNetworkError(projectError)) {
      return (
        <div className="min-h-0 h-full">
          <OfflineEditorFallback projectId={projectId} chapterId={null} />
        </div>
      );
    }
    notFound();
  }

  const scenes = scenesResult.data ?? [];

  return (
    <div className="min-h-0 h-full">
      <EditorShell
        projectId={projectId}
        chapter={null}
        initialPages={scenes}
        initialSelectedId={scene}
        project={project}
        allChapters={chaptersResult.data ?? []}
        unplacedCount={scenes.length}
        accountWordTotal={accountWordTotal}
      />
    </div>
  );
}
