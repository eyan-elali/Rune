import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Rune2Shell } from "@/components/rune2/Rune2Shell";
import { loadProjectManuscript } from "@/lib/rune2/projectManuscript";
import { loadProjectWorkspace } from "@/lib/rune2/projectWorkspace";

export default async function Rune2ProjectLayout({
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

  return (
    <Rune2Shell manuscript={manuscript} workspace={workspace}>
      {children}
    </Rune2Shell>
  );
}
