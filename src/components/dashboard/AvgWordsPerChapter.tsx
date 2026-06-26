"use client";

import { useEffect, useState } from "react";
import { getProjectStats } from "@/lib/actions/projects";
import type { Project } from "@/lib/types";

const cardStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--color-border)",
} as const;

interface AvgWordsPerChapterProps {
  projects: Project[];
}

export function AvgWordsPerChapter({ projects }: AvgWordsPerChapterProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ""
  );
  const [metric, setMetric] = useState<number | "none" | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("rune_avg_wpc_project_id");
    const resolvedId =
      stored && projects.some((p) => p.id === stored)
        ? stored
        : (projects[0]?.id ?? "");
    setSelectedProjectId(resolvedId);
    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized || !selectedProjectId) return;
    setLoading(true);
    getProjectStats(selectedProjectId).then(({ chapterCount, totalCanonicalWords }) => {
      setMetric(
        chapterCount === 0 ? "none" : Math.round(totalCanonicalWords / chapterCount)
      );
      setLoading(false);
    });
  }, [selectedProjectId, initialized]);

  function handleSelect(projectId: string) {
    setSelectedProjectId(projectId);
    localStorage.setItem("rune_avg_wpc_project_id", projectId);
  }

  return (
    <div className="flex flex-col rounded-lg p-5" style={cardStyle}>
      <div className="mb-3">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Avg. Words / Chapter
        </p>
      </div>

      {projects.length > 0 ? (
        <>
          <select
            value={selectedProjectId}
            onChange={(e) => handleSelect(e.target.value)}
            className="mb-4 w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-rune-gold/40"
            style={{
              background: "var(--color-sepia)",
              borderColor: "var(--color-border)",
              color: "var(--text-primary)",
            }}
            aria-label="Select project for average words per chapter"
          >
            {projects.map((p) => (
              <option
                key={p.id}
                value={p.id}
                style={{ background: "var(--color-sepia)" }}
              >
                {p.title}
              </option>
            ))}
          </select>

          {loading ? (
            <p
              className="font-rune-serif leading-none"
              style={{ color: "var(--text-primary)", opacity: 0.35, fontSize: "2.75rem" }}
            >
              …
            </p>
          ) : metric === "none" || metric === null ? (
            <p
              className="font-rune-serif text-sm"
              style={{ color: "var(--text-primary)", opacity: 0.45 }}
            >
              No chapters yet
            </p>
          ) : (
            <>
              <p
                className="font-rune-serif leading-none"
                style={{ color: "var(--text-primary)", fontSize: "2.75rem" }}
              >
                {(metric as number).toLocaleString()}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                avg. words per chapter
              </p>
            </>
          )}
        </>
      ) : (
        <p
          className="font-rune-serif text-sm"
          style={{ color: "var(--text-primary)", opacity: 0.45 }}
        >
          No projects yet
        </p>
      )}
    </div>
  );
}
