import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPages } from "@/lib/actions/pages";
import { getChapters } from "@/lib/actions/chapters";
import { EditorShell } from "@/components/editor/EditorShell";

interface ChapterEditorPageProps {
  params: Promise<{ projectId: string; chapterId: string }>;
}

export default async function ChapterEditorPage({
  params,
}: ChapterEditorPageProps) {
  const { projectId, chapterId } = await params;
  const supabase = await createClient();

  const [{ data: chapter }, { data: project }, pagesResult, chaptersResult] =
    await Promise.all([
      supabase.from("chapters").select("*").eq("id", chapterId).single(),
      supabase.from("projects").select("*").eq("id", projectId).single(),
      getPages(chapterId),
      getChapters(projectId),
    ]);

  if (!chapter || !project) notFound();

  return (
    <div className="min-h-0 h-full">
      <EditorShell
        projectId={projectId}
        chapterId={chapterId}
        initialPages={pagesResult.data ?? []}
        chapter={chapter}
        project={project}
        allChapters={chaptersResult.data ?? []}
      />
    </div>
  );
}
