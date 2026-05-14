import { getProjects } from "@/lib/actions/projects";
import { ProjectsGrid } from "@/components/projects/ProjectsGrid";

export default async function ProjectsPage() {
  const { data: projects, error } = await getProjects();

  if (error) {
    return (
      <div className="px-10 py-14">
        <p className="text-sm text-rune-crimson">{error}</p>
      </div>
    );
  }

  return (
    <div className="px-10 py-10">
      <ProjectsGrid projects={projects ?? []} />
    </div>
  );
}
