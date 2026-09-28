"use client";

import { useRef, type ReactNode } from "react";
import type { ProjectManuscript } from "@/lib/rune2/projectManuscript";
import type { ProjectWorkspace } from "@/lib/rune2/projectWorkspace";
import { ProjectNavigator } from "./ProjectNavigator";
import { Rune2ContextBar, Rune2SelectionView } from "./Rune2Content";
import { Rune2Panel } from "./Rune2Panel";
import { ProjectSearch } from "./ProjectSearch";
import { PropertyStoreProvider } from "./PropertyStore";
import { ReferenceStoreProvider } from "./ReferenceStore";
import { Rune2SelectionProvider, useRune2Selection } from "./Rune2Selection";
import { Rune2Tabs } from "./Rune2Tabs";
import { ViewStoreProvider } from "./ViewStore";
import { TrashProvider, TrashView } from "./WorkspaceTrash";
import { useWritingChrome } from "./useWritingChrome";

// The Rune 2.0 application shell:
//   navigator | (working-set tabs, context bar, content) | optional panel
// The navigator and the panel are columns beside the content, never over it,
// and both stay in the tree whether open or retracted: retracting either
// only changes its width, so the content column simply widens or narrows and
// its editors are never remounted. While the writer is typing, the shell
// carries `data-writing` (useWritingChrome) and the top chrome fades in place.
//
// Trash (a project-level utility, not an object) takes the content column's
// place while it is open: the selection's layer — tabs, context bar and every
// mounted editor — stays in the tree exactly as it was, but is hidden and
// inert (visibility, not unmounting, so editors, unsaved writing and scroll
// positions are kept), and the right-hand panel, which belongs to that
// selection, is hidden with it. Closing Trash shows the layer again.

export function Rune2Shell({
  manuscript,
  workspace,
  children,
}: {
  manuscript: ProjectManuscript;
  workspace: ProjectWorkspace;
  children: ReactNode;
}) {
  return (
    <Rune2SelectionProvider manuscript={manuscript} workspace={workspace}>
      <ReferenceStoreProvider workspace={workspace}>
        <PropertyStoreProvider workspace={workspace}>
          <ViewStoreProvider workspace={workspace}>
            <TrashProvider>
              <Frame>{children}</Frame>
            </TrashProvider>
          </ViewStoreProvider>
        </PropertyStoreProvider>
      </ReferenceStoreProvider>
    </Rune2SelectionProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { navCollapsed, trashOpen } = useRune2Selection();
  const root = useRef<HTMLDivElement>(null);
  useWritingChrome(root);

  return (
    <div
      ref={root}
      className="r2 r2-shell"
      data-nav={navCollapsed ? "collapsed" : undefined}
      data-trash={trashOpen || undefined}
    >
      {/* The column retracts by width; the navigator inside keeps its own. */}
      <div className="r2-nav-column">
        <ProjectNavigator />
      </div>

      <div className="r2-content">
        <div className="r2-content-layer" inert={trashOpen || undefined} aria-hidden={trashOpen || undefined}>
          <Rune2Tabs />
          <Rune2ContextBar />
          <main className="r2-main min-h-0 flex-1 overflow-y-auto">
            <Rune2SelectionView>{children}</Rune2SelectionView>
          </main>
        </div>
        {trashOpen && <TrashView />}
      </div>

      <Rune2Panel />
      <ProjectSearch />
    </div>
  );
}
