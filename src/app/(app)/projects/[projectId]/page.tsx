import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChapterList } from "@/components/projects/ChapterList";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { canAccessFeature, type SubscriptionTier } from "@/lib/subscription";
import { calculateProjectWordCount } from "@/lib/manuscript";
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

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: project }, { data: chapters }, { data: profileTier }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase
      .from("chapters")
      .select("*, pages(id, word_count, is_canonical)")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user!.id)
      .single(),
  ]);

  if (!project) notFound();

  const subscriptionTier = (profileTier?.subscription_tier ?? "free") as SubscriptionTier;
  const canSeeChapterGoals = canAccessFeature(subscriptionTier, "chapterGoals");

  const typedChapters = (chapters ?? []) as ChapterWithStats[];
  const completedCount = typedChapters.filter((c) => c.is_completed).length;
  const wordCount = calculateProjectWordCount(typedChapters);

  return (
    <div className="px-10 py-10">
      <ProjectHeader
        project={project}
        subscriptionTier={subscriptionTier}
        canSeeChapterGoals={canSeeChapterGoals}
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
