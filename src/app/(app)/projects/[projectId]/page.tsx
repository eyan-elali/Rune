import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChapterList } from "@/components/projects/ChapterList";
import { ManuscriptExportButton } from "@/components/projects/ManuscriptExportButton";
import { NewDraftButton } from "@/components/projects/NewDraftButton";
import { ChapterGoalControl } from "@/components/projects/ChapterGoalControl";
import type { Chapter } from "@/lib/types";

type ChapterWithStats = Chapter & {
  pages: { id: string; word_count: number; is_canonical: boolean }[];
};

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const supabase = await createClient();

  // Fetch project
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  // Fetch chapters with page stats
  const { data: chapters } = await supabase
    .from("chapters")
    .select("*, pages(id, word_count, is_canonical)")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  const typedChapters = (chapters ?? []) as ChapterWithStats[];
  const completedCount = typedChapters.filter((c) => c.is_completed).length;

  return (
    <div className="px-10 py-10">
      {/* Project header */}
      <div className="mb-8">
        {project.cover_color && (
          <div
            className="mb-5 h-1 w-12 rounded-full"
            style={{ background: project.cover_color }}
          />
        )}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="font-rune-serif text-3xl"
              style={{ color: "var(--text-primary)" }}
            >
              {project.title}
            </h1>
            {project.description && (
              <p className="mt-2 max-w-prose text-sm text-rune-mist">
                {project.description}
              </p>
            )}
            <p className="mt-4 text-xs text-rune-mist/40">
              {project.word_count.toLocaleString()} words total ·{" "}
              {typedChapters.length}{" "}
              {typedChapters.length === 1 ? "chapter" : "chapters"}
            </p>
          </div>
          <div className="flex items-start gap-4">
            <ChapterGoalControl project={project} completedCount={completedCount} />
            <div className="flex items-center gap-2">
              <NewDraftButton projectId={project.id} projectTitle={project.title} />
              <ManuscriptExportButton project={project} />
            </div>
          </div>
        </div>
      </div>

      {/* Chapter list */}
      <section aria-label="Chapters">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-rune-mist/60">
          Chapters
        </h2>
        <ChapterList chapters={typedChapters} projectId={projectId} />
      </section>
    </div>
  );
}
