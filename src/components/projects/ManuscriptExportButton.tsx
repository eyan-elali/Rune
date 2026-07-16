"use client";

import { useState } from "react";
import { BookDown, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { exportProjectAsPdf } from "@/lib/export/projectExport";
import { useToastStore } from "@/store/toastStore";
import type { Project, Chapter, Page } from "@/lib/types";

interface Props {
  project: Project;
}

export function ManuscriptExportButton({ project }: Props) {
  const [loading, setLoading] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  async function handleExport() {
    setLoading(true);
    try {
      const supabase = createClient();

      const { data: chapters, error: chapErr } = await supabase
        .from("chapters")
        .select("*")
        .eq("project_id", project.id)
        .order("position", { ascending: true });

      if (chapErr) throw chapErr;
      if (!chapters || chapters.length === 0) {
        showToast("No chapters to export.", "info");
        return;
      }

      const chapterIds = (chapters as Chapter[]).map((c) => c.id);
      const { data: pages, error: pageErr } = await supabase
        .from("pages")
        .select("*")
        .in("chapter_id", chapterIds)
        .order("position", { ascending: true });

      if (pageErr) throw pageErr;

      const pagesPerChapter: Record<string, Page[]> = {};
      for (const page of (pages ?? []) as Page[]) {
        if (!pagesPerChapter[page.chapter_id]) {
          pagesPerChapter[page.chapter_id] = [];
        }
        pagesPerChapter[page.chapter_id].push(page);
      }

      await exportProjectAsPdf(project, chapters as Chapter[], pagesPerChapter);
      showToast("Manuscript exported.", "success");
    } catch {
      showToast("Failed to export manuscript.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        style={{
          borderColor: "var(--color-border-strong)",
          color: "var(--color-gold)",
          background: "transparent",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "color-mix(in srgb, var(--color-gold) 6%, transparent)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        <BookDown size={14} />
        {loading ? "Preparing manuscript…" : "Export Manuscript"}
      </button>

      {/* Info tooltip */}
      <div className="group relative flex items-center">
        <Info
          size={12}
          className="cursor-help"
          style={{ color: "var(--color-mist)", opacity: 0.5 }}
          aria-label="Export info"
        />
        <div
          className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded border px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            background: "var(--color-sepia)",
            borderColor: "var(--color-border)",
            color: "var(--color-mist)",
          }}
          role="tooltip"
        >
          Chapters with a canonical page will export only that page.
        </div>
      </div>
    </div>
  );
}
