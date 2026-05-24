"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getProjects } from "@/lib/actions/projects";
import { getChapters } from "@/lib/actions/chapters";
import { getPages } from "@/lib/actions/pages";
import { cn } from "@/lib/utils";
import type { Project, Chapter, Page } from "@/lib/types";

export type PageSource =
  | { type: "fresh" }
  | { type: "existing"; page: Page; project: Project };

type PageSourceSelectorProps = {
  onSelect: (source: PageSource) => void;
  className?: string;
};

export function PageSourceSelector({ onSelect, className }: PageSourceSelectorProps) {
  const [mode, setMode] = useState<"fresh" | "existing">("fresh");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pages, setPages] = useState<Record<string, Page[]>>({});
  const [loading, setLoading] = useState(false);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleModeChange(next: "fresh" | "existing") {
    setMode(next);
    setSelectedPageId(null);
    if (next === "fresh") {
      onSelect({ type: "fresh" });
      return;
    }
    setLoading(true);
    setError("");
    const result = await getProjects();
    setLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Failed to load projects");
      return;
    }
    setProjects(result.data);
  }

  async function handleSelectProject(project: Project) {
    setSelectedProject(project);
    setSelectedPageId(null);
    setChapters([]);
    setPages({});
    setError("");
    setLoading(true);
    setPagesLoading(true);
    const chResult = await getChapters(project.id);
    if (chResult.error || !chResult.data) {
      setLoading(false);
      setPagesLoading(false);
      setError(chResult.error ?? "Failed to load chapters");
      return;
    }
    const chapterList = chResult.data as Chapter[];
    setChapters(chapterList);
    setLoading(false);
    const pageResults = await Promise.all(chapterList.map((ch) => getPages(ch.id)));
    const pagesMap: Record<string, Page[]> = {};
    for (let i = 0; i < chapterList.length; i++) {
      pagesMap[chapterList[i].id] = pageResults[i].data ?? [];
    }
    setPages(pagesMap);
    setPagesLoading(false);
  }

  return (
    <div className={cn("mt-8", className)}>
      <p
        className="mb-3 text-center text-[10px] uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        Writing canvas
      </p>
      <div className="mb-6 flex justify-center gap-2" role="group" aria-label="Writing canvas source">
        {(["fresh", "existing"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => handleModeChange(opt)}
            aria-pressed={mode === opt}
            className={cn(
              "rounded px-5 py-2 text-sm font-medium transition-all duration-150",
              mode === opt
                ? "bg-rune-gold text-rune-ink shadow"
                : "border text-rune-gold hover:border-rune-gold hover:bg-rune-gold/5"
            )}
            style={mode !== opt ? { borderColor: "var(--color-border-strong)" } : undefined}
          >
            {opt === "fresh" ? "Fresh Start" : "Continue a Page"}
          </button>
        ))}
      </div>

      {mode === "existing" && (
        <div className="mx-auto max-w-sm">
          {loading && !selectedProject && (
            <div className="flex justify-center py-3" aria-label="Loading projects">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-gold)]" />
            </div>
          )}
          {error && (
            <p className="text-center text-xs" style={{ color: "var(--color-crimson)" }}>
              {error}
            </p>
          )}

          {!loading && !error && !selectedProject && projects.length === 0 && (
            <p className="text-center text-xs" style={{ color: "var(--color-mist)", opacity: 0.5 }}>
              No projects found.
            </p>
          )}

          {!loading && projects.length > 0 && !selectedProject && (
            <div>
              <p
                className="mb-2 text-center text-[10px] uppercase tracking-widest"
                style={{ color: "var(--color-mist)" }}
              >
                Select project
              </p>
              <div
                className="max-h-[8.25rem] overflow-y-auto rounded-lg"
                style={{
                  border: "1px solid var(--color-border-strong)",
                  background: "var(--color-sepia)",
                  scrollbarWidth: "thin",
                }}
              >
                {projects.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProject(p)}
                    className="w-full px-4 py-3 text-left text-sm transition-colors duration-100 hover:bg-rune-gold/10"
                    style={{
                      color: "var(--text-primary)",
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    <span className="font-rune-serif">{p.title}</span>
                    <span className="ml-2 text-xs" style={{ color: "var(--color-mist)" }}>
                      {p.word_count.toLocaleString()} words
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedProject && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProject(null);
                    setSelectedPageId(null);
                    setChapters([]);
                    setPages({});
                    setPagesLoading(false);
                  }}
                  className="text-xs transition-opacity duration-150 hover:opacity-100"
                  style={{ color: "var(--color-mist)", opacity: 0.6 }}
                >
                  ← Back
                </button>
                <span className="font-rune-serif text-xs" style={{ color: "var(--color-gold)" }}>
                  {selectedProject.title}
                </span>
              </div>

              {chapters.length === 0 && loading && (
                <div className="flex justify-center py-6" aria-label="Loading chapters">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--color-gold)]" />
                </div>
              )}

              {chapters.length === 0 && !loading && (
                <p className="text-center text-xs" style={{ color: "var(--color-mist)", opacity: 0.5 }}>
                  No chapters in this project.
                </p>
              )}

              <div className="max-h-64 space-y-3 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {chapters.map((chapter) => {
                  const chapterPages = pages[chapter.id];
                  const isPagesPending = pagesLoading || chapterPages === undefined;

                  return (
                    <div key={chapter.id}>
                      <p
                        className="mb-1.5 px-1 text-[10px] uppercase tracking-widest"
                        style={{ color: "var(--color-mist)", opacity: 0.5 }}
                      >
                        {chapter.title}
                      </p>
                      <div
                        className="overflow-hidden rounded"
                        style={{ border: "1px solid var(--color-border)", background: "var(--color-sepia)" }}
                      >
                        {isPagesPending ? (
                          <div className="flex justify-center px-4 py-3" aria-label="Loading pages">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-gold)]" />
                          </div>
                        ) : chapterPages.length === 0 ? (
                          <p className="px-4 py-2 text-xs" style={{ color: "var(--color-mist)", opacity: 0.4 }}>
                            No pages
                          </p>
                        ) : (
                          chapterPages.map((page, i) => {
                            const isActive = selectedPageId === page.id;

                            return (
                              <button
                                key={page.id}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => {
                                  setSelectedPageId(page.id);
                                  onSelect({ type: "existing", page, project: selectedProject });
                                }}
                                className={cn(
                                  "w-full border-l-2 px-4 py-2.5 text-left text-sm transition-colors duration-100",
                                  isActive
                                    ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10 hover:bg-[var(--color-gold)]/15"
                                    : "border-transparent hover:bg-white/5"
                                )}
                                style={{
                                  borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                                }}
                              >
                                <span
                                  className={cn(
                                    "font-rune-serif",
                                    isActive ? "text-[var(--color-gold)]" : "text-[var(--text-primary)]"
                                  )}
                                >
                                  {page.title}
                                </span>
                                <span className="ml-2 text-[10px]" style={{ color: "var(--color-mist)" }}>
                                  {page.word_count.toLocaleString()} words
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
