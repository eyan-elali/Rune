import { getProjects } from "@/lib/actions/projects";
import { ProjectsGrid } from "@/components/projects/ProjectsGrid";
import { createClient } from "@/lib/supabase/server";
import { calculateProjectWordCount } from "@/lib/manuscript";
import { getChaptersWithScenesByProject } from "@/lib/manuscriptQueries";

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
    const { data: chaptersByProject } = await getChaptersWithScenesByProject(
      supabase,
      projectList.map((p) => p.id)
    );

    for (const project of projectList) {
      wordCounts[project.id] = calculateProjectWordCount(chaptersByProject[project.id] ?? []);
    }
  }

  return (
    <div className="px-10 py-10">
      <ProjectsGrid projects={projectList} wordCounts={wordCounts} />
    </div>
  );
}
