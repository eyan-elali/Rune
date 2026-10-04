import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Rune2Shell } from "@/components/rune2/Rune2Shell";
import { TrashedProject } from "@/components/rune2/TrashedProject";
import { loadProjectManuscript } from "@/lib/rune2/projectManuscript";
import { loadProjectWorkspace } from "@/lib/rune2/projectWorkspace";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  const manuscript = await loadProjectManuscript(projectId);
  return { title: manuscript?.project.title ?? "Project" };
}

// A Project: the Rune 2.0 shell. A Project in Trash is not opened — the
// writer is offered Restore instead (049) — and its shell never mounts.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [manuscript, workspace] = await Promise.all([
    loadProjectManuscript(projectId),
    loadProjectWorkspace(projectId),
  ]);
  if (!manuscript) notFound();
  if (manuscript.trashedAt) return <TrashedProject project={manuscript.project} />;

  return (
    <Rune2Shell manuscript={manuscript} workspace={workspace}>
      {children}
    </Rune2Shell>
  );
}
