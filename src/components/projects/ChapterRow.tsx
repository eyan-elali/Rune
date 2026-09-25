"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Trash2 } from "lucide-react";
import { updateChapter, deleteChapter, markChapterComplete } from "@/lib/actions/chapters";
import { calculateChapterWordCount } from "@/lib/manuscript";
import { useToastStore } from "@/store/toastStore";
import { forgetStalePlacements } from "@/lib/offline/db";
import { cn } from "@/lib/utils";
import type { ChapterWithScenes } from "@/lib/manuscriptQueries";

interface ChapterRowProps {
  chapter: ChapterWithScenes;
  projectId: string;
  /** Structure controls (Move…), rendered beside the row's other actions. */
  moveControl?: ReactNode;
}

const NAV_CLICK_DELAY_MS = 250;

export function ChapterRow({ chapter, projectId, moveControl }: ChapterRowProps) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [isEditing, setIsEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(chapter.title);
  const [saving, setSaving] = useState(false);
  const [isCompleted, setIsCompleted] = useState(chapter.is_completed ?? false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sceneCount = chapter.scenes?.length ?? 0;
  const totalWords = calculateChapterWordCount(chapter);

  function startEditing() {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function handleRowClick() {
    if (isEditing) return;
    if (navClickTimerRef.current) clearTimeout(navClickTimerRef.current);
    navClickTimerRef.current = setTimeout(() => {
      router.push(`/projects/${projectId}/chapters/${chapter.id}`);
    }, NAV_CLICK_DELAY_MS);
  }

  function handleRowDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (navClickTimerRef.current) {
      clearTimeout(navClickTimerRef.current);
      navClickTimerRef.current = null;
    }
    if (!isEditing) startEditing();
  }

  async function commitEdit() {
    const trimmed = titleValue.trim();
    if (!trimmed) {
      setTitleValue(chapter.title);
      setIsEditing(false);
      return;
    }
    setIsEditing(false);
    if (trimmed === chapter.title) return;
    setSaving(true);
    await updateChapter(chapter.id, { title: trimmed }, projectId);
    router.refresh();
    setSaving(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") {
      setTitleValue(chapter.title);
      setIsEditing(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const message =
      sceneCount === 0
        ? `Delete chapter "${chapter.title}"? It has no scenes.`
        : `Delete chapter "${chapter.title}"?\n\n` +
          `Its ${sceneCount === 1 ? "scene" : `${sceneCount} scenes`} (${totalWords.toLocaleString()} words) ` +
          `will move to Unplaced Scenes. No writing is deleted.`;
    if (!confirm(message)) return;
    const { error } = await deleteChapter(chapter.id, projectId);
    if (error) {
      showToast("Couldn't delete this chapter — nothing was changed.", "error");
      return;
    }
    // The offline cache still files these Scenes under the deleted Chapter.
    await forgetStalePlacements(projectId, chapter.id, []);
    if (sceneCount > 0) showToast("Chapter deleted — its scenes are in Unplaced Scenes", "success");
    router.refresh();
  }

  async function handleToggleComplete(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !isCompleted;
    setIsCompleted(next); // optimistic
    try {
      await markChapterComplete(chapter.id, next, projectId);
      if (next) showToast("Chapter complete ✦", "success");
    } catch {
      setIsCompleted(!next); // revert on error
    }
  }

  return (
    <div
      onClick={handleRowClick}
      onDoubleClick={handleRowDoubleClick}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-4",
        "transition-all duration-150",
        "hover:border-[var(--color-border-strong)] hover:bg-rune-gold/5",
        saving && "opacity-60"
      )}
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Drag handle */}
      <span
        className="shrink-0 cursor-grab text-rune-mist/20 group-hover:text-rune-mist/40 transition-colors"
        title="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
        aria-hidden="true"
      >
        <GripVertical size={16} />
      </span>

      {/* Title — rename on double-click only */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            ref={inputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-full rounded border px-2 py-0.5 text-sm outline-none",
              "border-rune-gold focus:ring-1 focus:ring-rune-gold/30"
            )}
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
            }}
            aria-label="Edit chapter title"
          />
        ) : (
          <span
            title="Double-click to rename"
            className="block truncate text-sm transition-colors"
            style={{ color: "var(--text-primary)", opacity: 0.8 }}
          >
            {chapter.title}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex shrink-0 items-center gap-4 text-xs text-rune-mist/40">
        <span>{sceneCount} {sceneCount === 1 ? "scene" : "scenes"}</span>
        <span>{totalWords.toLocaleString()} words</span>
      </div>

      {moveControl}

      {/* Completion toggle — text button */}
      <button
        type="button"
        aria-label={isCompleted ? "Mark chapter incomplete" : "Mark chapter complete"}
        onClick={handleToggleComplete}
        data-guide="project-completed"
        className="shrink-0 whitespace-nowrap text-xs transition-colors duration-150"
        style={{ color: isCompleted ? "var(--color-gold)" : "var(--color-mist)" }}
      >
        {isCompleted ? "Completed ✦" : "Mark as completed"}
      </button>

      {/* Delete */}
      <button
        type="button"
        aria-label="Delete chapter"
        onClick={handleDelete}
        className="shrink-0 rounded p-1 text-rune-mist/0 transition-all group-hover:text-rune-mist/30 hover:!text-rune-crimson"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
