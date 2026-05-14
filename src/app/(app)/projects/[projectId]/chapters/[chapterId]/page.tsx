import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPages } from "@/lib/actions/pages";
import { EditorShell } from "@/components/editor/EditorShell";

interface ChapterEditorPageProps {
  params: Promise<{ projectId: string; chapterId: string }>;
}

export default async function ChapterEditorPage({
  params,
}: ChapterEditorPageProps) {
  const { projectId, chapterId } = await params;
  const supabase = await createClient();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, project_id")
    .eq("id", chapterId)
    .single();

  if (!chapter) notFound();

  const { data: pages } = await getPages(chapterId);
  const initialPages = pages ?? [];

  return (
    <div className="min-h-0 h-full">
      <EditorShell
        projectId={projectId}
        chapterId={chapterId}
        initialPages={initialPages}
      />
    </div>
  );
}
