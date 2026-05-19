"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { updateProject } from "@/lib/actions/projects";
import type { Project } from "@/lib/types";

interface ChapterGoalControlProps {
  project: Project;
  completedCount: number;
}

export function ChapterGoalControl({ project, completedCount }: ChapterGoalControlProps) {
  const router = useRouter();
  const goal = project.chapter_goal ?? null;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [inputValue, setInputValue] = useState(goal != null ? String(goal) : "");
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (popoverOpen) {
      setInputValue(goal != null ? String(goal) : "");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [popoverOpen, goal]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    if (popoverOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  async function handleSave() {
    const parsed = parseInt(inputValue, 10);
    const value = isNaN(parsed) || parsed < 1 ? null : parsed;
    setSaving(true);
    await updateProject(project.id, { chapter_goal: value });
    setSaving(false);
    setPopoverOpen(false);
    router.refresh();
  }

  const percent =
    goal && goal > 0 ? Math.min(100, Math.round((completedCount / goal) * 100)) : 0;

  return (
    <div className="relative flex flex-col items-end gap-1.5">
      {goal != null ? (
        <>
          <div className="flex items-center gap-2">
            <span
              className="font-rune-serif text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {completedCount} / {goal} chapters
            </span>
            <button
              type="button"
              onClick={() => setPopoverOpen(!popoverOpen)}
              aria-label="Edit chapter goal"
              className="transition-opacity hover:opacity-70"
              style={{ color: "var(--color-mist)" }}
            >
              <Pencil size={12} />
            </button>
          </div>
          <div
            className="h-1 w-40 overflow-hidden rounded-full"
            style={{ background: "var(--color-sepia)" }}
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemax={goal}
            aria-label="Chapter completion progress"
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${percent}%`, background: "var(--color-gold)" }}
            />
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setPopoverOpen(!popoverOpen)}
          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: "var(--color-mist)" }}
          aria-label="Set chapter goal"
        >
          <Target size={13} />
          Set Chapter Goal
        </button>
      )}

      {popoverOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full z-20 mt-2 rounded-lg p-4 shadow-xl"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
            width: "220px",
          }}
        >
          <label
            htmlFor="chapter-goal-input"
            className="mb-2 block text-xs font-medium"
            style={{ color: "var(--color-mist)" }}
          >
            Chapter target
          </label>
          <input
            ref={inputRef}
            id="chapter-goal-input"
            type="number"
            min={1}
            placeholder="e.g. 24"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setPopoverOpen(false);
            }}
            className="mb-3 w-full rounded border px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-rune-gold/40"
            style={{
              background: "rgba(0,0,0,0.2)",
              borderColor: "var(--color-border-strong)",
              color: "var(--text-primary)",
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
