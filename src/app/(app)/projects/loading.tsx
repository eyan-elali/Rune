import { ProjectCardSkeleton } from "@/components/projects/ProjectCard";

export default function ProjectsLoading() {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <div
          className="mb-8 h-8 w-40 animate-pulse rounded"
          style={{ background: "rgba(107, 101, 96, 0.15)" }}
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
