import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

// ── Small server-rendered project card ─────────────────────────────────────
function ProjectTile({ project }: { project: Project }) {
  const bandColor = project.cover_color ?? "#3d4451";
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
      style={{
        background: "var(--color-sepia)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="h-1.5 w-full shrink-0 rounded-t-lg" style={{ background: bandColor }} />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-rune-serif text-sm leading-snug text-rune-parchment/90 group-hover:text-rune-gold transition-colors duration-150 line-clamp-2">
          {project.title}
        </h3>
        {project.description && (
          <p className="line-clamp-1 text-xs text-rune-mist/70 leading-relaxed">
            {project.description}
          </p>
        )}
        <p className="mt-auto pt-2 text-xs text-rune-mist/50">
          {project.word_count.toLocaleString()} words
        </p>
      </div>
    </Link>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
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
      .select("id, title, description, word_count, cover_color, updated_at")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false }),
  ]);

  const displayName =
    profile?.display_name ?? user?.email?.split("@")[0] ?? "Writer";
  const projects = (rawProjects as Project[] | null) ?? [];
  const totalWords = projects.reduce((sum, p) => sum + (p.word_count ?? 0), 0);
  const recentProjects = projects.slice(0, 6);

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
      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <div className="mb-10">
        <h1 className="font-rune-serif text-4xl text-rune-parchment">
          Welcome back, {displayName}.
        </h1>
        <p className="mt-2 font-rune-serif text-lg text-rune-mist">
          The page is waiting.
        </p>
      </div>

      {/* ── Continue Writing ─────────────────────────────────────────── */}
      {recentWork && (
        <section className="mb-10" aria-label="Continue Writing">
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Continue Writing
          </h2>
          <div
            className="flex items-center gap-6 rounded-lg p-6"
            style={{
              background: "var(--color-sepia)",
              borderLeft: `4px solid ${recentWork.coverColor ?? "var(--color-gold)"}`,
              border: "1px solid var(--color-border)",
              borderLeftColor: recentWork.coverColor ?? "var(--color-gold)",
              borderLeftWidth: "4px",
            }}
          >
            <div className="flex-1 min-w-0">
              <p
                className="mb-0.5 text-xs uppercase tracking-wider"
                style={{ color: "var(--color-mist)" }}
              >
                {recentWork.projectTitle}
              </p>
              <h3 className="font-rune-serif text-xl text-rune-parchment truncate">
                {recentWork.chapterTitle}
              </h3>
            </div>
            <Link
              href={`/projects/${recentWork.projectId}/chapters/${recentWork.chapterId}`}
              className="shrink-0 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors duration-150"
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

      {/* ── Stats row ────────────────────────────────────────────────── */}
      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Stats">
        {/* Total words trophy */}
        <div
          className="flex items-center gap-4 rounded-lg p-5"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span className="text-2xl" aria-hidden>🏆</span>
          <div>
            <p className="font-rune-serif text-xl text-rune-parchment">
              {totalWords.toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: "var(--color-mist)" }}>
              words written
            </p>
          </div>
        </div>

        {/* Project count */}
        <div
          className="flex items-center gap-4 rounded-lg p-5"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span className="text-2xl" aria-hidden>📖</span>
          <div>
            <p className="font-rune-serif text-xl text-rune-parchment">
              {projects.length}
            </p>
            <p className="text-xs" style={{ color: "var(--color-mist)" }}>
              {projects.length === 1 ? "project" : "projects"}
            </p>
          </div>
        </div>

        {/* Level */}
        {profile && (
          <div
            className="flex items-center gap-4 rounded-lg p-5"
            style={{
              background: "var(--color-sepia)",
              border: "1px solid var(--color-border)",
            }}
          >
            <span className="text-2xl" aria-hidden>✦</span>
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

      {/* ── Projects grid ────────────────────────────────────────────── */}
      <section aria-label="Your projects">
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Your Projects
          </h2>
          <Link
            href="/projects"
            className="text-xs transition-colors"
            style={{ color: "var(--color-gold)" }}
          >
            View all →
          </Link>
        </div>

        {recentProjects.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {recentProjects.map((project) => (
              <ProjectTile key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center rounded-lg py-16 text-center"
            style={{
              background: "var(--color-sepia)",
              border: "1px dashed var(--color-border-strong)",
            }}
          >
            <p className="font-rune-serif text-lg text-rune-parchment/60">
              No projects yet.
            </p>
            <Link
              href="/projects"
              className="mt-4 text-sm transition-colors"
              style={{ color: "var(--color-gold)" }}
            >
              Start your first project →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
