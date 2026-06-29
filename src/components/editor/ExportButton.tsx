"use client";

import { useState, useTransition } from "react";
import { Download, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/toastStore";
import { useProfileStore } from "@/store/profileStore";
import { canAccessFeature } from "@/lib/subscription";
import { createCheckoutSession } from "@/lib/actions/billing";
import { exportPageAsPdf } from "@/lib/export/pageExport";
import type { Page, Chapter, Project } from "@/lib/types";

interface ExportButtonProps {
  page: Page | null;
  chapter: Chapter;
  project: Project;
}

function getPromotekitReferral(): string {
  if (typeof window === "undefined") return "";
  const referral = (window as Window & { promotekit_referral?: unknown }).promotekit_referral;
  return typeof referral === "string" ? referral : "";
}

export function ExportButton({ page, chapter, project }: ExportButtonProps) {
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
            const referralId = getPromotekitReferral();
            const { url, error } = await createCheckoutSession("scribe", "monthly", referralId);
            if (url && !error) window.location.href = url;
          });
        }}
        disabled={upgradePending}
        aria-label="Export page (upgrade required)"
        data-tutorial-id="export-btn"
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium",
          "transition-all duration-150 border focus-visible:outline-none",
          "opacity-50 cursor-not-allowed hover:opacity-70"
        )}
        style={{ color: "var(--color-mist)", borderColor: "var(--color-border)" }}
        title="Upgrade to Scribe to export pages"
      >
        <Lock className="h-3 w-3" aria-hidden="true" />
        <span>Export Page</span>
      </button>
    );
  }

  async function handleExport() {
    if (!page || loading) return;
    setLoading(true);
    try {
      await exportPageAsPdf(page, chapter, project);
      showToast("Page exported as PDF", "success");
    } catch (err) {
      console.error("PDF export failed:", err);
      showToast("Export failed — please try again", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={!page || loading}
      aria-label="Export page as PDF"
      data-tutorial-id="export-btn"
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium",
        "transition-all duration-150",
        "border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-40",
        "hover:bg-rune-gold/10 active:scale-95"
      )}
      style={{
        color: "var(--color-mist)",
        borderColor: "var(--color-border)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--color-gold)";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "var(--color-border-strong)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--color-mist)";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "var(--color-border)";
      }}
    >
      {loading ? (
        <svg
          className="h-3 w-3 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        <Download className="h-3 w-3" aria-hidden="true" />
      )}
      <span>{loading ? "Generating…" : "Export Page"}</span>
    </button>
  );
}
