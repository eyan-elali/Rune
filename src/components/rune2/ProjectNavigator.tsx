import Link from "next/link";
import type { ReactNode } from "react";
import type { ManuscriptOutlineNode, ProjectManuscript } from "@/lib/rune2/projectManuscript";

// The compact project navigator: the Manuscript in reading order, then
// Unplaced Scenes when there are any. Read-only for now — no selection,
// disclosure or editing yet.
//
// A Chapter with a single Scene shows as just the Chapter; its Scenes are
// listed only once there are several (architecture §7, §38).

const INDENT_PX = 14;

function Row({
  depth,
  tone = "default",
  children,
}: {
  depth: number;
  tone?: "default" | "group" | "scene";
  children: ReactNode;
}) {
  return (
    <div
      className="truncate py-[3px] pr-3 text-[13px] leading-5"
      style={{
        paddingLeft: 12 + depth * INDENT_PX,
        color: tone === "scene" ? "var(--r2-muted)" : "var(--r2-text)",
        fontWeight: tone === "group" ? 500 : 400,
      }}
    >
      {children}
    </div>
  );
}

function OutlineRows({ nodes }: { nodes: ManuscriptOutlineNode[] }) {
  return nodes.map((node) =>
    node.kind === "group" ? (
      <li key={node.group.id}>
        <Row depth={node.depth} tone="group">
          {node.group.title || "Untitled group"}
        </Row>
        {node.children.length > 0 && (
          <ul role="list">
            <OutlineRows nodes={node.children} />
          </ul>
        )}
      </li>
    ) : (
      <li key={node.chapter.id}>
        <Row depth={node.depth}>{node.chapter.title || "Untitled chapter"}</Row>
        {node.chapter.scenes.length > 1 && (
          <ul role="list">
            {node.chapter.scenes.map((scene) => (
              <li key={scene.id}>
                <Row depth={node.depth + 1} tone="scene">
                  {scene.title || "Untitled scene"}
                </Row>
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  );
}

function SectionLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider"
      style={{ color: "var(--r2-faint)" }}
    >
      {children}
    </h2>
  );
}

export function ProjectNavigator({ manuscript }: { manuscript: ProjectManuscript }) {
  return (
    <nav
      aria-label="Project"
      className="flex h-full min-h-0 flex-col"
      style={{ background: "var(--r2-nav-bg)", borderRight: "1px solid var(--r2-border)" }}
    >
      <div className="truncate px-3 pb-1 pt-4 text-sm font-semibold">
        {manuscript.project.title}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <section aria-labelledby="r2-nav-manuscript">
          <SectionLabel id="r2-nav-manuscript">Manuscript</SectionLabel>
          {manuscript.outline.length > 0 ? (
            <ul role="list">
              <OutlineRows nodes={manuscript.outline} />
            </ul>
          ) : (
            <Row depth={0} tone="scene">
              No chapters yet
            </Row>
          )}
        </section>

        {manuscript.unplaced.length > 0 && (
          <section aria-labelledby="r2-nav-unplaced">
            <SectionLabel id="r2-nav-unplaced">Unplaced Scenes</SectionLabel>
            <ul role="list">
              {manuscript.unplaced.map((scene) => (
                <li key={scene.id}>
                  <Row depth={0} tone="scene">
                    {scene.title || "Untitled scene"}
                  </Row>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="px-3 py-3" style={{ borderTop: "1px solid var(--r2-border)" }}>
        <Link href="/dashboard" className="text-xs" style={{ color: "var(--r2-muted)" }}>
          ← Back to current Rune
        </Link>
      </div>
    </nav>
  );
}
