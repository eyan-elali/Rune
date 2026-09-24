import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChapterList } from "@/components/projects/ChapterList";
import { UnplacedSceneList } from "@/components/projects/UnplacedSceneList";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import type { SubscriptionTier } from "@/lib/subscription";
import { calculateProjectWordCount } from "@/lib/manuscript";
import { getChaptersWithScenes, getUnplacedSceneSummaries } from "@/lib/manuscriptQueries";

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: project }, { data: chapters }, { data: profileTier }, { data: unplaced }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    getChaptersWithScenes(supabase, projectId),
    supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user!.id)
      .single(),
    getUnplacedSceneSummaries(supabase, projectId),
  ]);

  if (!project) notFound();

  const subscriptionTier = (profileTier?.subscription_tier ?? "free") as SubscriptionTier;

  const typedChapters = chapters ?? [];
  const completedCount = typedChapters.filter((c) => c.is_completed).length;
  // The ordered manuscript total: placed Scenes only. Unplaced words are shown
  // separately below, never added to it.
  const wordCount = calculateProjectWordCount(typedChapters);
  const unplacedWords = unplaced.reduce((sum, s) => sum + (s.word_count ?? 0), 0);

  return (
    <div className="px-10 py-10">
      <ProjectHeader
        project={project}
        subscriptionTier={subscriptionTier}
        canSeeChapterGoals={true}
        completedCount={completedCount}
        wordCount={wordCount}
        totalChapters={typedChapters.length}
      />

      {/* Chapter list */}
      <section aria-label="Chapters">
        <h2 className="!mb-3 text-xs font-medium uppercase tracking-widest text-rune-mist/60">
          Chapters
        </h2>
        <ChapterList chapters={typedChapters} projectId={projectId} />
      </section>

      {/* Unplaced Scenes — only once the writer has moved something out of a chapter. */}
      {unplaced.length > 0 && (
        <section aria-labelledby="unplaced-heading" className="mt-12">
          <div className="mb-3 flex items-baseline gap-3">
            <h2
              id="unplaced-heading"
              className="text-xs font-medium uppercase tracking-widest text-rune-mist/60"
            >
              Unplaced Scenes
            </h2>
            <span className="text-xs tabular-nums text-rune-mist/40">
              {unplacedWords.toLocaleString()} words · not counted in your manuscript or export
            </span>
          </div>
          <UnplacedSceneList
            scenes={unplaced}
            chapters={typedChapters.map((c) => ({ id: c.id, title: c.title }))}
            projectId={projectId}
          />
        </section>
      )}
    </div>
  );
}
