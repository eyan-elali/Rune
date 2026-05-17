"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { duplicateProject } from "@/lib/actions/projects";
import { useToastStore } from "@/store/toastStore";

interface NewDraftButtonProps {
  projectId: string;
  projectTitle: string;
}

export function NewDraftButton({ projectId, projectTitle }: NewDraftButtonProps) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDuplicate() {
    setLoading(true);
    const result = await duplicateProject(projectId);
    setLoading(false);

    if (result.error || !result.data) {
      showToast("Failed to create draft.", "error");
      return;
    }

    showToast(`Draft created: ${result.data.title}`, "success");
    setShowConfirm(false);
    router.push(`/projects/${result.data.id}`);
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors"
        style={{
          borderColor: "var(--color-border-strong)",
          color: "var(--color-mist)",
          background: "transparent",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--color-mist)";
        }}
      >
        <Copy size={14} />
        New Draft
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm duplicate project"
        >
          <div
            className="w-full max-w-sm rounded-xl p-6"
            style={{
              background: "var(--color-sepia)",
              border: "1px solid var(--color-border-strong)",
            }}
          >
            <h2
              className="mb-2 font-rune-serif text-xl"
              style={{ color: "var(--text-primary)" }}
            >
              Create a Draft?
            </h2>
            <p className="mb-6 text-sm" style={{ color: "var(--color-mist)" }}>
              This will duplicate{" "}
              <span style={{ color: "var(--text-primary)" }}>
                &ldquo;{projectTitle}&rdquo;
              </span>{" "}
              and all its contents. Continue?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  border: "1px solid var(--color-border)",
                  color: "var(--color-mist)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicate}
                disabled={loading}
                className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
                style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
              >
                {loading ? "Duplicating…" : "Create Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
