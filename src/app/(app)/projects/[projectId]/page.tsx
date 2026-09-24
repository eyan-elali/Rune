import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChapterList } from "@/components/projects/ChapterList";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import type { SubscriptionTier } from "@/lib/subscription";
import { calculateProjectWordCount } from "@/lib/manuscript";
import { getChaptersWithScenes } from "@/lib/manuscriptQueries";

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: project }, { data: chapters }, { data: profileTier }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    getChaptersWithScenes(supabase, projectId),
    supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user!.id)
      .single(),
  ]);

  if (!project) notFound();

  const subscriptionTier = (profileTier?.subscription_tier ?? "free") as SubscriptionTier;

  const typedChapters = chapters ?? [];
  const completedCount = typedChapters.filter((c) => c.is_completed).length;
  const wordCount = calculateProjectWordCount(typedChapters);

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
    </div>
  );
}
