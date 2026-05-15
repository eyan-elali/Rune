import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

const cardStyle = {
  background: "var(--color-sepia)",
  border: "1px solid var(--color-border)",
} as const;

type RecentPageCard = {
  pageId: string;
  chapterId: string;
  chapterTitle: string;
  projectId: string;
  projectTitle: string;
  wordCount: number;
};

function FocusCard({
  href,
  label,
  title,
  meta,
  className,
}: {
  href: string;
  label: string;
  title: string;
  meta: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-lg p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${className ?? ""}`}
      style={cardStyle}
    >
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        {label}
      </p>
      <h3 className="font-rune-serif text-lg leading-snug text-rune-parchment group-hover:text-rune-gold transition-colors duration-150 line-clamp-2">
        {title}
      </h3>
      <p className="mt-auto pt-3 text-xs" style={{ color: "var(--color-mist)" }}>
        {meta}
      </p>
    </Link>
  );
}

function EmptyFocusCard({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col rounded-lg p-5"
      style={{
        ...cardStyle,
        borderStyle: "dashed",
      }}
    >
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        {label}
      </p>
      <p className="font-rune-serif text-sm text-rune-parchment/40">Nothing here yet</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: rawProjects }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, xp, level")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("projects")
      .select("id, title, word_count, cover_color, updated_at")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false }),
  ]);

  const displayName =
    profile?.display_name ?? user?.email?.split("@")[0] ?? "Writer";
  const projects = (rawProjects as Project[] | null) ?? [];
  const totalWords = projects.reduce((sum, p) => sum + (p.word_count ?? 0), 0);
  const recentProject = projects[0] ?? null;

  let recentPageCards: RecentPageCard[] = [];

  if (projects.length > 0) {
    const projectIds = projects.map((p) => p.id);
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id")
      .in("project_id", projectIds);

    const chapterIds = chapters?.map((c) => c.id) ?? [];

    if (chapterIds.length > 0) {
      const { data: recentPages } = await supabase
        .from("pages")
        .select(
          `
          id,
          word_count,
          chapters (
            id,
            title,
            projects (
              id,
              title
            )
          )
        `
        )
        .in("chapter_id", chapterIds)
        .order("updated_at", { ascending: false })
        .limit(2);

      if (recentPages) {
        for (const row of recentPages) {
          const chapterRaw = row.chapters;
          const chapter = Array.isArray(chapterRaw) ? chapterRaw[0] : chapterRaw;
          if (!chapter) continue;

          const projectRaw = chapter.projects;
          const project = Array.isArray(projectRaw) ? projectRaw[0] : projectRaw;
          if (!project) continue;

          recentPageCards.push({
            pageId: row.id,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            projectId: project.id,
            projectTitle: project.title,
            wordCount: row.word_count ?? 0,
          });
        }
      }
    }
  }

  // Continue Writing: most recently updated chapter
  type RecentWork = {
    chapterId: string;
    chapterTitle: string;
    projectId: string;
    projectTitle: string;
    coverColor: string | null;
  };
  let recentWork: RecentWork | null = null;

  if (projects.length > 0) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, title, project_id, updated_at")
      .in(
        "project_id",
        projects.map((p) => p.id)
      )
      .order("updated_at", { ascending: false })
      .limit(1);

    if (chapters && chapters.length > 0) {
      const chap = chapters[0];
      const proj = projects.find((p) => p.id === chap.project_id);
      if (proj) {
        recentWork = {
          chapterId: chap.id,
          chapterTitle: chap.title,
          projectId: chap.project_id,
          projectTitle: proj.title,
          coverColor: proj.cover_color,
        };
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <div className="mb-10">
        <h1 className="font-rune-serif text-4xl text-rune-parchment">
          Welcome back, {displayName}.
        </h1>
        <p className="mt-2 font-rune-serif text-lg text-rune-mist">
          The page is waiting.
        </p>
      </div>

      {recentWork && (
        <section className="mb-10" aria-label="Continue Writing">
          <h2
            className="!mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Continue Writing
          </h2>
          <div
            className="flex items-center gap-6 rounded-lg p-6"
            style={{
              background: "var(--color-sepia)",
              border: "1px solid var(--color-border)",
              borderLeftColor: recentWork.coverColor ?? "var(--color-gold)",
              borderLeftWidth: "4px",
            }}
          >
            <div className="min-w-0 flex-1">
              <p
                className="mb-0.5 text-xs uppercase tracking-wider"
                style={{ color: "var(--color-mist)" }}
              >
                {recentWork.projectTitle}
              </p>
              <h3 className="truncate font-rune-serif text-xl text-rune-parchment">
                {recentWork.chapterTitle}
              </h3>
            </div>
            <Link
              href={`/projects/${recentWork.projectId}/chapters/${recentWork.chapterId}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors duration-150"
              style={{
                background: "var(--color-gold)",
                color: "var(--color-ink)",
              }}
            >
              Continue Writing
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      )}

      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Stats">
        <div
          className="flex items-center gap-4 rounded-lg p-5"
          style={cardStyle}
        >
          <span className="text-2xl" aria-hidden>
            🏆
          </span>
          <div>
            <p className="font-rune-serif text-xl text-rune-parchment">
              {totalWords.toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: "var(--color-mist)" }}>
              words written
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-4 rounded-lg p-5"
          style={cardStyle}
        >
          <span className="text-2xl" aria-hidden>
            📖
          </span>
          <div>
            <p className="font-rune-serif text-xl text-rune-parchment">
              {projects.length}
            </p>
            <p className="text-xs" style={{ color: "var(--color-mist)" }}>
              {projects.length === 1 ? "project" : "projects"}
            </p>
          </div>
        </div>

        {profile && (
          <div
            className="flex items-center gap-4 rounded-lg p-5"
            style={cardStyle}
          >
            <span className="text-2xl" aria-hidden>
              ✦
            </span>
            <div>
              <p className="font-rune-serif text-xl text-rune-parchment">
                Level {profile.level}
              </p>
              <p className="text-xs" style={{ color: "var(--color-mist)" }}>
                {profile.xp.toLocaleString()} XP
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="mb-10" aria-label="Current Focus">
        <h2
          className="!mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Current Focus
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {recentProject ? (
            <FocusCard
              href={`/projects/${recentProject.id}`}
              label="Recent Project"
              title={recentProject.title}
              meta={`${recentProject.word_count.toLocaleString()} words`}
            />
          ) : (
            <EmptyFocusCard label="Recent Project" />
          )}

          {recentPageCards[0] ? (
            <FocusCard
              href={`/projects/${recentPageCards[0].projectId}/chapters/${recentPageCards[0].chapterId}`}
              label={recentPageCards[0].projectTitle}
              title={recentPageCards[0].chapterTitle}
              meta={`${recentPageCards[0].wordCount.toLocaleString()} words`}
            />
          ) : (
            <EmptyFocusCard label="Recent Page" />
          )}

          {recentPageCards[1] ? (
            <FocusCard
              href={`/projects/${recentPageCards[1].projectId}/chapters/${recentPageCards[1].chapterId}`}
              label={recentPageCards[1].projectTitle}
              title={recentPageCards[1].chapterTitle}
              meta={`${recentPageCards[1].wordCount.toLocaleString()} words`}
            />
          ) : (
            <EmptyFocusCard label="Recent Page" />
          )}
        </div>
      </section>
    </div>
  );
}
