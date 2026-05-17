"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createGoal } from "@/lib/actions/writingStats";
import { useToastStore } from "@/store/toastStore";
import type { Project } from "@/lib/types";

interface AddGoalModalProps {
  onClose: () => void;
  onCreated: () => void;
  projects: Project[];
  hasDailyGoal: boolean;
}

export function AddGoalModal({
  onClose,
  onCreated,
  projects,
  hasDailyGoal,
}: AddGoalModalProps) {
  const showToast = useToastStore((s) => s.showToast);
  const [type, setType] = useState<"daily_global" | "project_total">(
    hasDailyGoal ? "project_total" : "daily_global"
  );
  const [targetWords, setTargetWords] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(
    projects[0]?.id ?? ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const words = parseInt(targetWords, 10);
    if (!words || words < 1) {
      showToast("Enter a valid word count.", "error");
      return;
    }
    if (type === "project_total" && !selectedProjectId) {
      showToast("Select a project.", "error");
      return;
    }

    setSaving(true);
    const result = await createGoal(
      type,
      words,
      type === "project_total" ? selectedProjectId : undefined
    );
    setSaving(false);

    if (result.error) {
      showToast("Failed to create goal.", "error");
    } else {
      showToast("Goal created.", "success");
      onCreated();
    }
  }

  const pillBase =
    "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 text-center cursor-pointer";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Add writing goal"
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
          className="mb-5 font-rune-serif text-xl"
          style={{ color: "var(--text-primary)" }}
        >
          New Writing Goal
        </h2>

        {/* Type toggle pills */}
        <div className="mb-5 flex gap-2 rounded-lg p-1" style={{ background: "rgba(0,0,0,0.2)" }}>
          {!hasDailyGoal && (
            <button
              onClick={() => setType("daily_global")}
              className={pillBase}
              style={
                type === "daily_global"
                  ? { background: "var(--color-gold)", color: "var(--color-ink)" }
                  : { color: "var(--color-mist)" }
              }
            >
              Daily Goal
            </button>
          )}
          <button
            onClick={() => setType("project_total")}
            className={pillBase}
            style={
              type === "project_total"
                ? { background: "var(--color-gold)", color: "var(--color-ink)" }
                : { color: "var(--color-mist)" }
            }
          >
            Project Total
          </button>
        </div>

        {type === "daily_global" ? (
          <div className="mb-5">
            <label
              htmlFor="goal-target-daily"
              className="mb-2 block text-xs font-medium"
              style={{ color: "var(--color-mist)" }}
            >
              Write how many words every day?
            </label>
            <input
              id="goal-target-daily"
              type="number"
              min={1}
              placeholder="e.g. 500"
              value={targetWords}
              onChange={(e) => setTargetWords(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1"
              style={{
                borderColor: "var(--color-border-strong)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        ) : (
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
                    <option
                      key={p.id}
                      value={p.id}
                      style={{ background: "var(--color-sepia)" }}
                    >
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
                htmlFor="goal-target-project"
                className="mb-2 block text-xs font-medium"
                style={{ color: "var(--color-mist)" }}
              >
                Total word count target
              </label>
              <input
                id="goal-target-project"
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
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              border: "1px solid var(--color-border)",
              color: "var(--color-mist)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (type === "project_total" && projects.length === 0)}
            className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
          >
            {saving ? "Saving…" : "Create Goal"}
          </button>
        </div>
      </div>
    </div>
  );
}
