import type { ReactNode } from "react";
import type { ProjectManuscript } from "@/lib/rune2/projectManuscript";
import { ProjectNavigator } from "./ProjectNavigator";
import { Rune2ContextBar, Rune2SelectionView } from "./Rune2Content";
import { Rune2SelectionProvider } from "./Rune2Selection";

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
    <Rune2SelectionProvider manuscript={manuscript}>
      <div className="r2 r2-shell">
        <ProjectNavigator />

        <div className="flex min-h-0 flex-col">
          <Rune2ContextBar />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Rune2SelectionView>{children}</Rune2SelectionView>
          </main>
        </div>
      </div>
    </Rune2SelectionProvider>
  );
}
