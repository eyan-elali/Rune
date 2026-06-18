import { getProjects } from "@/lib/actions/projects";
import { ProjectsGrid } from "@/components/projects/ProjectsGrid";
import { createClient } from "@/lib/supabase/server";
import { calculateProjectWordCount } from "@/lib/manuscript";

export default async function ProjectsPage() {
  const { data: projects, error } = await getProjects();

  if (error) {
    return (
      <div className="px-10 py-14">
        <p className="text-sm text-rune-crimson">{error}</p>
      </div>
    );
  }

  const projectList = projects ?? [];
  const wordCounts: Record<string, number> = {};

  if (projectList.length > 0) {
    const supabase = await createClient();
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, project_id, pages(id, word_count, is_canonical)")
      .in("project_id", projectList.map((p) => p.id));

    for (const project of projectList) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectChapters = (chapters ?? []).filter((c: any) => c.project_id === project.id);
      wordCounts[project.id] = calculateProjectWordCount(projectChapters);
    }
  }

  return (
    <div className="px-10 py-10">
      <ProjectsGrid projects={projectList} wordCounts={wordCounts} />
    </div>
  );
}
