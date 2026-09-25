import type { ReactNode } from "react";
import type { ProjectManuscript } from "@/lib/rune2/projectManuscript";
import { ProjectNavigator } from "./ProjectNavigator";

// The Rune 2.0 application shell: navigator | (context bar over content).
// An optional right-hand context panel will join the grid later; tabs will
// live in the context bar. Neither exists yet.

export function Rune2Shell({
  manuscript,
  children,
}: {
  manuscript: ProjectManuscript;
  children: ReactNode;
}) {
  return (
    <div className="r2 grid h-dvh grid-cols-[248px_minmax(0,1fr)] overflow-hidden">
      <ProjectNavigator manuscript={manuscript} />

      <div className="flex min-h-0 flex-col">
        <header
          className="flex h-10 shrink-0 items-center gap-1.5 px-4 text-[13px]"
          style={{ color: "var(--r2-muted)" }}
        >
          <span className="truncate">{manuscript.project.title}</span>
          <span aria-hidden style={{ color: "var(--r2-faint)" }}>
            /
          </span>
          <span style={{ color: "var(--r2-text)" }}>Manuscript</span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
