"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Trash2 } from "lucide-react";
import { updateChapter, deleteChapter } from "@/lib/actions/chapters";
import { cn } from "@/lib/utils";
import type { Chapter } from "@/lib/types";

type ChapterWithStats = Chapter & {
  pages: { id: string; word_count: number }[];
};

interface ChapterRowProps {
  chapter: ChapterWithStats;
  projectId: string;
}

export function ChapterRow({ chapter, projectId }: ChapterRowProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(chapter.title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageCount = chapter.pages?.length ?? 0;
  const wordCount = chapter.pages?.reduce((s, p) => s + p.word_count, 0) ?? 0;

  function startEditing(e: React.MouseEvent) {
    e.stopPropagation();
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
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
    if (!confirm(`Delete chapter "${chapter.title}"?`)) return;
    await deleteChapter(chapter.id, projectId);
    router.refresh();
  }

  return (
    <div
      onClick={() =>
        !isEditing &&
        router.push(`/projects/${projectId}/chapters/${chapter.id}`)
      }
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3.5",
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

      {/* Title — editable on double-click */}
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
              "w-full rounded border bg-rune-ink/60 px-2 py-0.5 text-sm text-rune-parchment outline-none",
              "border-rune-gold focus:ring-1 focus:ring-rune-gold/30"
            )}
            aria-label="Edit chapter title"
          />
        ) : (
          <span
            onDoubleClick={startEditing}
            title="Double-click to rename"
            className="block truncate text-sm text-rune-parchment/80 group-hover:text-rune-parchment transition-colors"
          >
            {chapter.title}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex shrink-0 items-center gap-4 text-xs text-rune-mist/40">
        <span>{pageCount} {pageCount === 1 ? "page" : "pages"}</span>
        <span>{wordCount.toLocaleString()} words</span>
      </div>

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
