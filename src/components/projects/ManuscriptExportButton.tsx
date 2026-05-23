"use client";

import { useState, useTransition } from "react";
import { BookDown, Info, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { exportProjectAsPdf } from "@/lib/export/projectExport";
import { useToastStore } from "@/store/toastStore";
import { useProfileStore } from "@/store/profileStore";
import { canAccessFeature } from "@/lib/subscription";
import { createCheckoutSession } from "@/lib/actions/billing";
import type { Project, Chapter, Page } from "@/lib/types";

interface Props {
  project: Project;
}

export function ManuscriptExportButton({ project }: Props) {
  const [loading, setLoading] = useState(false);
  const [upgradePending, startUpgradeTransition] = useTransition();
  const showToast = useToastStore((s) => s.showToast);
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const canExport = canAccessFeature(subscriptionTier, "export");

  if (!canExport) {
    return (
      <button
        type="button"
        onClick={() => {
          startUpgradeTransition(async () => {
            const { url, error } = await createCheckoutSession("scribe", "monthly");
            if (url && !error) window.location.href = url;
          });
        }}
        disabled={upgradePending}
        title="Upgrade to Scribe to export your manuscript"
        className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium opacity-50 transition-opacity hover:opacity-70 cursor-not-allowed"
        style={{ borderColor: "var(--color-border-strong)", color: "var(--color-mist)", background: "transparent" }}
      >
        <Lock size={14} />
        Export Manuscript
      </button>
    );
  }

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
            "rgba(201,168,76,0.06)";
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
