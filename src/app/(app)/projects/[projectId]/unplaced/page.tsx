import Link from "next/link";
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
 * autosave and offline protection as a Chapter, with no narrative order.
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

  if (scenes.length === 0) {
    return (
      <div className="flex h-full min-h-96 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-rune-serif text-lg" style={{ color: "var(--text-primary)" }}>
          No Unplaced Scenes
        </p>
        <p className="max-w-sm text-sm" style={{ color: "var(--color-mist)" }}>
          A page you move out of a chapter waits here, outside your manuscript&rsquo;s
          word count and export, until you place it again.
        </p>
        <Link
          href={`/projects/${projectId}`}
          className="mt-2 text-sm underline-offset-4 hover:underline"
          style={{ color: "var(--color-gold)" }}
        >
          Back to {project.title}
        </Link>
      </div>
    );
  }

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
