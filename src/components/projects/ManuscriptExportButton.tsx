"use client";

import { useState } from "react";
import { BookDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { exportProjectAsPdf, loadManuscriptForExport } from "@/lib/export/projectExport";
import { useToastStore } from "@/store/toastStore";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
}

export function ManuscriptExportButton({ project }: Props) {
  const [loading, setLoading] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  async function handleExport() {
    setLoading(true);
    try {
      const { chapters, scenesPerChapter, groups } = await loadManuscriptForExport(
        createClient(),
        project.id
      );

      if (chapters.length === 0) {
        showToast("No chapters to export.", "info");
        return;
      }

      await exportProjectAsPdf(project, chapters, scenesPerChapter, groups);
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
    </div>
  );
}
