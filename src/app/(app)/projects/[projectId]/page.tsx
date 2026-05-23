import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ChapterList } from "@/components/projects/ChapterList";
import { ManuscriptExportButton } from "@/components/projects/ManuscriptExportButton";
import { NewDraftButton } from "@/components/projects/NewDraftButton";
import { ChapterGoalControl } from "@/components/projects/ChapterGoalControl";
import { canAccessFeature, type SubscriptionTier } from "@/lib/subscription";
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

  // Fetch project, chapters, and subscription tier in parallel
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

  const subscriptionTier = (profileTier?.subscription_tier ?? 'free') as SubscriptionTier;
  const canSeeChapterGoals = canAccessFeature(subscriptionTier, 'chapterGoals');

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
            {canSeeChapterGoals ? (
              <ChapterGoalControl project={project} completedCount={completedCount} />
            ) : (
              <div
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "var(--color-mist)" }}
                aria-label="Chapter goals locked — Scribe &amp; above"
              >
                <Lock size={13} aria-hidden style={{ color: "var(--color-mist)", opacity: 0.6 }} />
                <span style={{ opacity: 0.7 }}>Chapter goals — Scribe &amp; above</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <NewDraftButton projectId={project.id} projectTitle={project.title} />
              <ManuscriptExportButton project={project} />
            </div>
          </div>
        </div>
      </div>

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
