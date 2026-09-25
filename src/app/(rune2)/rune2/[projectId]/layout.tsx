import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Rune2Shell } from "@/components/rune2/Rune2Shell";
import { loadProjectManuscript } from "@/lib/rune2/projectManuscript";

export default async function Rune2ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const manuscript = await loadProjectManuscript(projectId);
  if (!manuscript) notFound();

  return <Rune2Shell manuscript={manuscript}>{children}</Rune2Shell>;
}
