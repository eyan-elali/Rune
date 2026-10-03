"use client";

import { usePathname } from "next/navigation";
import { RuneRoot } from "@/components/rune2/RunePreferences";
import ProjectsLoading from "./(home)/loading";

// Arriving somewhere under /projects while the server reads it. A Project
// opening shows the shell's own frame in the writer's theme — the
// navigator's column with a few faint rows, the tab band, the empty content
// field — so the Project arrives into a layout that is already there instead
// of a blank page or a spinner. Anywhere else (Projects, Project Trash) shows
// the quiet page frame those pages share. Nothing in either pretends to be
// content.
const PROJECT = /^\/projects\/[0-9a-f-]{36}(\/|$)/i;

export default function ProjectsSegmentLoading() {
  const path = usePathname() ?? "";
  if (!PROJECT.test(path)) return <ProjectsLoading />;
  return (
    <RuneRoot className="r2-shell r2-shell-loading">
      <div className="r2-nav-column">
        <div className="r2-nav" aria-hidden>
          <div className="r2-nav-header">
            <span className="r2-skeleton r2-skeleton-line" style={{ width: "48%" }} />
          </div>
          <div className="r2-shell-loading-rows">
            {[62, 48, 54, 40, 58].map((w, i) => (
              <span key={i} className="r2-skeleton r2-skeleton-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
      <div className="r2-content">
        <div className="r2-tabs" aria-hidden />
        <p role="status" className="r2-visually-hidden">
          Opening project…
        </p>
      </div>
    </RuneRoot>
  );
}
