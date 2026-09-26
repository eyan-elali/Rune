import type { ReactNode } from "react";
import type { ProjectManuscript } from "@/lib/rune2/projectManuscript";
import { ProjectNavigator } from "./ProjectNavigator";
import { Rune2ContextBar, Rune2SelectionView } from "./Rune2Content";
import { Rune2Panel } from "./Rune2Panel";
import { Rune2SelectionProvider } from "./Rune2Selection";
import { Rune2Tabs } from "./Rune2Tabs";

// The Rune 2.0 application shell:
//   navigator | (working-set tabs, context bar, content) | optional panel
// The panel is the grid's last column, rendered after the content column so
// opening or closing it never changes the content's place in the tree (its
// editors stay mounted); the content column simply narrows.

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

        <div className="flex min-h-0 min-w-0 flex-col">
          <Rune2Tabs />
          <Rune2ContextBar />
          <main className="r2-main min-h-0 flex-1 overflow-y-auto">
            <Rune2SelectionView>{children}</Rune2SelectionView>
          </main>
        </div>

        <Rune2Panel />
      </div>
    </Rune2SelectionProvider>
  );
}
