"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createGoal } from "@/lib/actions/writingStats";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import type { Project } from "@/lib/types";

interface AddGoalModalProps {
  onClose: () => void;
  onCreated: () => void;
  projects: Project[];
  hasProjectTotalGoal: boolean;
}

export function AddGoalModal({
  onClose,
  onCreated,
  projects,
  hasProjectTotalGoal,
}: AddGoalModalProps) {
  const showToast = useToastStore((s) => s.showToast);
  const [targetWords, setTargetWords] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const words = parseInt(targetWords, 10);
    if (!words || words < 1) {
      showToast("Enter a valid word count.", "error");
      return;
    }
    if (hasProjectTotalGoal) {
      showToast("Remove your existing manuscript goal first.", "error");
      return;
    }
    if (!selectedProjectId) {
      showToast("Select a project.", "error");
      return;
    }
    setSaving(true);
    const result = await createGoal("project_total", words, selectedProjectId);
    setSaving(false);
    if (result.error) {
      showToast(result.error, "error");
    } else {
      showToast("Goal created.", "success");
      onCreated();
    }
  }

  const saveDisabled =
    saving || hasProjectTotalGoal || projects.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Add manuscript goal"
    >
      <div
        className="relative w-full max-w-sm rounded-xl p-6"
        style={{
          background: "var(--color-sepia)",
          border: "1px solid var(--color-border-strong)",
        }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md transition-colors"
          style={{ color: "var(--color-mist)" }}
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2
          className="!mb-5 font-rune-serif text-xl"
          style={{ color: "var(--text-primary)" }}
        >
          Manuscript Goal
        </h2>

        {hasProjectTotalGoal && (
          <p
            className="mb-4 rounded px-3 py-2 text-xs"
            style={{
              background: "color-mix(in srgb, var(--color-crimson) 12%, transparent)",
              color: "var(--color-crimson)",
              border: "1px solid color-mix(in srgb, var(--color-crimson) 25%, transparent)",
            }}
          >
            You already have a manuscript goal. Remove it from the dashboard first.
          </p>
        )}

        <div className="mb-5 flex flex-col gap-4">
          <div>
            <label
              htmlFor="goal-project"
              className="mb-2 block text-xs font-medium"
              style={{ color: "var(--color-mist)" }}
            >
              Project
            </label>
            {projects.length > 0 ? (
              <select
                id="goal-project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none"
                style={{
                  borderColor: "var(--color-border-strong)",
                  color: "var(--text-primary)",
                  background: "var(--color-sepia)",
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id} style={{ background: "var(--color-sepia)" }}>
                    {p.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm" style={{ color: "var(--color-mist)" }}>
                No projects yet.
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="goal-target"
              className="mb-2 block text-xs font-medium"
              style={{ color: "var(--color-mist)" }}
            >
              Total word count target
            </label>
            <input
              id="goal-target"
              type="number"
              min={1}
              placeholder="e.g. 80000"
              value={targetWords}
              onChange={(e) => setTargetWords(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--color-border-strong)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={saveDisabled}
            loading={saving}
            className="flex-1"
          >
            {saving ? "Saving…" : "Create Goal"}
          </Button>
        </div>
      </div>
    </div>
  );
}
