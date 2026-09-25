"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Trash2,
  MoreHorizontal,
  Pencil,
  ChevronLeft,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Inbox,
  CornerDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Scene } from "@/lib/types";
import type { ChapterWithScenes } from "@/lib/manuscriptQueries";
import { renameScene } from "@/lib/actions/scenes";

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function PageListSkeleton() {
  return (
    <aside
      className="flex h-full min-h-0 w-[15%] min-w-[160px] max-w-[240px] shrink-0 flex-col overflow-hidden"
      style={{
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--color-border)",
      }}
      aria-label="Scenes loading"
      aria-busy="true"
    >
      <div className="flex shrink-0 flex-col">
        <div className="flex items-center px-4 py-3">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Scenes
          </span>
        </div>
        <div
          className="mx-auto h-px w-[92%] shrink-0"
          style={{ background: "var(--color-border)" }}
          aria-hidden
        />
      </div>
      <div className="flex flex-col gap-1.5 p-2 pt-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="mx-1 h-9 animate-pulse rounded"
            style={{ background: "rgba(107, 101, 96, 0.12)" }}
          />
        ))}
      </div>
    </aside>
  );
}

// ── Per-Scene context menu ─────────────────────────────────────────────────────

interface PageMenuProps {
  page: Scene;
  canDelete: boolean;
  onRename: () => void;
  onDelete: () => void;
  /** Chapter view: take this Scene out of narrative order (a Chapter may be left empty). */
  onMoveToUnplaced?: () => void;
  /** The Chapters this Scene can move to (never the one it is in). */
  moveTargets?: { id: string; title: string }[];
  onMoveToChapter?: (chapterId: string) => void;
  /** Chapter view: keyboard-accessible reordering, beside drag and drop. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function PageMenu({
  page,
  canDelete,
  onRename,
  onDelete,
  onMoveToUnplaced,
  moveTargets = [],
  onMoveToChapter,
  onMoveUp,
  onMoveDown,
}: PageMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!open) {
        const rect = btnRef.current?.getBoundingClientRect();
        if (rect) {
          setMenuPos({ top: rect.bottom + 4, left: rect.left });
        }
      }
      setOpen((prev) => !prev);
    },
    [open]
  );

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        aria-label={`Options for ${page.title}`}
        aria-expanded={open}
        className="shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-100 hover:bg-rune-gold/15 focus-visible:opacity-100 group-hover:opacity-100"
        style={{ color: "var(--color-mist)" }}
      >
        <MoreHorizontal size={12} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 9999,
            }}
          >
            <div
              className="w-44 overflow-hidden rounded-md border shadow-2xl"
              style={{
                background: "var(--color-sepia)",
                borderColor: "var(--color-border-strong)",
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onRename();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs transition-colors hover:bg-rune-gold/10"
                style={{ color: "var(--text-primary)" }}
              >
                <Pencil size={11} aria-hidden />
                Rename
              </button>

              {onMoveUp && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onMoveUp();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs transition-colors hover:bg-rune-gold/10"
                  style={{ color: "var(--text-primary)" }}
                >
                  <ArrowUp size={11} aria-hidden />
                  Move up
                </button>
              )}

              {onMoveDown && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onMoveDown();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs transition-colors hover:bg-rune-gold/10"
                  style={{ color: "var(--text-primary)" }}
                >
                  <ArrowDown size={11} aria-hidden />
                  Move down
                </button>
              )}

              {onMoveToUnplaced && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onMoveToUnplaced();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs transition-colors hover:bg-rune-gold/10"
                  style={{ color: "var(--text-primary)" }}
                >
                  <Inbox size={11} aria-hidden />
                  Move to Unplaced Scenes
                </button>
              )}

              {onMoveToChapter && moveTargets.length > 0 && (
                <div role="group" aria-label="Move to chapter">
                  <div
                    className="px-3.5 pb-1 pt-2 text-[10px] uppercase tracking-widest"
                    style={{ color: "var(--color-mist)" }}
                  >
                    Move to chapter
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {moveTargets.map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(false);
                          onMoveToChapter(target.id);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs transition-colors hover:bg-rune-gold/10"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <CornerDownRight size={11} className="shrink-0" aria-hidden />
                        <span className="truncate">{target.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  height: "1px",
                  background: "var(--color-border)",
                  margin: "2px 0",
                }}
              />

              <button
                type="button"
                disabled={!canDelete}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs transition-colors hover:bg-rune-crimson/10 disabled:pointer-events-none disabled:opacity-40"
                style={{ color: "var(--color-crimson)" }}
              >
                <Trash2 size={11} aria-hidden />
                Delete Scene
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface PageListProps {
  /** The Chapter's placed Scenes, or the Unplaced Scenes. */
  pages: Scene[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  /** Adds a Scene at the end of this Chapter, or of the Unplaced Scenes. */
  onAddPage: () => void;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, title: string) => void;
  /** Absent in the Unplaced view: Unplaced Scenes have no narrative order. */
  onReorderPages?: (orderedPageIds: string[]) => void;
  onMoveToUnplaced?: (pageId: string) => void;
  onMoveToChapter?: (pageId: string, chapterId: string) => void;
  allChapters: ChapterWithScenes[];
  /** The Chapter being edited, or null in the Unplaced view. */
  currentChapterId: string | null;
  unplacedCount?: number;
  projectId: string;
}

export function PageList({
  pages,
  selectedPageId,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onRenamePage,
  onReorderPages,
  onMoveToUnplaced,
  onMoveToChapter,
  allChapters,
  currentChapterId,
  unplacedCount = 0,
  projectId,
}: PageListProps) {
  const isUnplacedView = currentChapterId === null;
  const canReorder = !!onReorderPages;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [view, setView] = useState<"pages" | "chapters">("pages");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleDragStart(e: React.DragEvent, pageId: string) {
    setDraggedId(pageId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, pageId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === pageId) return;
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== pageId) setDragOverId(pageId);
  }

  function handleDrop(e: React.DragEvent, pageId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === pageId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const fromIndex = pages.findIndex((p) => p.id === draggedId);
    const toIndex = pages.findIndex((p) => p.id === pageId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const reordered = pages.map((p) => p.id);
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, draggedId);

    setDraggedId(null);
    setDragOverId(null);
    onReorderPages?.(reordered);
  }

  /** Keyboard/menu reordering: one step up (-1) or down (+1). */
  function moveBy(pageId: string, delta: -1 | 1) {
    const ids = pages.map((p) => p.id);
    const from = ids.indexOf(pageId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    ids.splice(from, 1);
    ids.splice(to, 0, pageId);
    onReorderPages?.(ids);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  function startEditing(page: Scene, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(page.id);
    setEditingTitle(page.title);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitEdit(pageId: string) {
    const title = editingTitle.trim() || "Untitled";
    onRenamePage(pageId, title);
    setEditingId(null);
    await renameScene(pageId, title);
  }

  // ── Chapters view ─────────────────────────────────────────────────────────────

  if (view === "chapters") {
    return (
      <aside
        className="flex h-full min-h-0 w-[15%] min-w-[160px] max-w-[240px] shrink-0 flex-col"
        style={{
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--color-border)",
          overflow: "visible",
        }}
        aria-label="Chapter list"
      >
        {/* Header */}
        <div className="flex shrink-0 flex-col">
          <div className="flex items-center gap-1.5 px-3 py-3">
            <button
              type="button"
              onClick={() => setView("pages")}
              aria-label="Back to scenes"
              title="Back to scenes"
              className="rounded p-0.5 transition-colors duration-100 hover:bg-rune-gold/10"
              style={{ color: "var(--color-mist)" }}
            >
              <ChevronLeft size={13} aria-hidden />
            </button>
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Chapters
            </span>
          </div>
          <div
            className="mx-auto h-px w-[92%] shrink-0"
            style={{ background: "var(--color-border)" }}
            aria-hidden
          />
        </div>

        {/* Chapter list */}
        <div className="flex min-h-0 flex-1 flex-col">
          <ul
            className="flex flex-1 flex-col overflow-y-auto py-1"
            role="list"
            aria-label="Project chapters"
          >
            {allChapters.map((chapter) => {
              const isCurrent = chapter.id === currentChapterId;
              const pageCount = chapter.scenes.length;
              const wordCount = chapter.scenes.reduce(
                (sum, p) => sum + (p.word_count ?? 0),
                0
              );

              return (
                <li key={chapter.id} className="shrink-0">
                  <div
                    className={cn(
                      "group mx-2 flex w-[calc(100%-1rem)] cursor-pointer select-none flex-col rounded-md px-3 py-1.5 transition-all duration-200",
                      isCurrent
                        ? "bg-rune-gold/15 shadow-sm"
                        : "hover:bg-rune-gold/5"
                    )}
                    onClick={() => {
                      if (!isCurrent) {
                        router.push(
                          `/projects/${projectId}/chapters/${chapter.id}`
                        );
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-current={isCurrent ? "page" : undefined}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !isCurrent) {
                        e.preventDefault();
                        router.push(
                          `/projects/${projectId}/chapters/${chapter.id}`
                        );
                      }
                    }}
                  >
                    <span
                      className="truncate text-sm"
                      style={{
                        color: "var(--text-primary)",
                        opacity: isCurrent ? 1 : 0.65,
                      }}
                      title={chapter.title}
                    >
                      {chapter.title}
                    </span>
                    <span
                      className="mt-0.5 text-[10px] tabular-nums"
                      style={{
                        color: isCurrent
                          ? "var(--color-gold)"
                          : "var(--color-mist)",
                        opacity: isCurrent ? 0.8 : 0.5,
                      }}
                    >
                      {pageCount} {pageCount === 1 ? "scene" : "scenes"} ·{" "}
                      {wordCount.toLocaleString()} words
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Unplaced Scenes — always reachable here, the one place a writer
              can start a Scene outside the manuscript. */}
          <div className="shrink-0 pb-2">
            <div
              className="mx-auto mb-1 h-px w-[92%]"
              style={{ background: "var(--color-border)" }}
              aria-hidden
            />
            <div
              className={cn(
                "mx-2 flex w-[calc(100%-1rem)] cursor-pointer select-none flex-col rounded-md px-3 py-1.5 transition-all duration-200",
                isUnplacedView ? "bg-rune-gold/15 shadow-sm" : "hover:bg-rune-gold/5"
              )}
              onClick={() => {
                if (isUnplacedView) setView("pages");
                else router.push(`/projects/${projectId}/unplaced`);
              }}
              role="button"
              tabIndex={0}
              aria-current={isUnplacedView ? "page" : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (isUnplacedView) setView("pages");
                  else router.push(`/projects/${projectId}/unplaced`);
                }
              }}
            >
              <span
                className="truncate text-sm"
                style={{ color: "var(--text-primary)", opacity: isUnplacedView ? 1 : 0.65 }}
              >
                Unplaced Scenes
              </span>
              <span
                className="mt-0.5 text-[10px] tabular-nums"
                style={{
                  color: isUnplacedView ? "var(--color-gold)" : "var(--color-mist)",
                  opacity: isUnplacedView ? 0.8 : 0.5,
                }}
              >
                {isUnplacedView ? pages.length : unplacedCount}{" "}
                {(isUnplacedView ? pages.length : unplacedCount) === 1 ? "scene" : "scenes"} · not in manuscript
              </span>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // ── Pages view ────────────────────────────────────────────────────────────────

  return (
    <aside
      data-tutorial-id="pages-sidebar"
      className="flex h-full min-h-0 w-[15%] min-w-[160px] max-w-[240px] shrink-0 flex-col"
      style={{
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--color-border)",
        overflow: "visible",
      }}
      aria-label={isUnplacedView ? "Unplaced Scenes" : "Scene list"}
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
            title={isUnplacedView ? "Unplaced Scenes are kept out of your manuscript's word count and export" : undefined}
          >
            {isUnplacedView ? "Unplaced" : "Scenes"}
          </span>
          {allChapters.length > 0 && (
            <button
              type="button"
              onClick={() => setView("chapters")}
              aria-label="Switch to chapters"
              data-tutorial-id="chapter-switch-btn"
              className="rounded px-1.5 py-0.5 text-[10px] leading-none tracking-wide transition-colors duration-100 hover:bg-rune-gold/10"
              style={{ color: "var(--color-mist)", opacity: 0.65 }}
            >
              Chapters
            </button>
          )}
        </div>
        <div
          className="mx-auto h-px w-[92%] shrink-0"
          style={{ background: "var(--color-border)" }}
          aria-hidden
        />
      </div>

      {/* Scene list */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ul
          className="flex flex-1 flex-col overflow-y-auto py-1"
          role="list"
          aria-label={isUnplacedView ? "Unplaced Scenes" : "Chapter scenes"}
        >
          {pages.map((page, index) => {
            const isSelected = selectedPageId === page.id;
            const isEditing = editingId === page.id;

            return (
              <li key={page.id} className="shrink-0">
                <div
                  draggable={canReorder && !isEditing}
                  onDragStart={(e) => handleDragStart(e, page.id)}
                  onDragOver={(e) => handleDragOver(e, page.id)}
                  onDrop={(e) => handleDrop(e, page.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "group relative mx-2 flex w-[calc(100%-1rem)] cursor-pointer select-none flex-col px-3 py-1.5 transition-all duration-200 rounded-md",
                    isSelected
                      ? "bg-rune-gold/15 shadow-sm"
                      : "hover:bg-rune-gold/5",
                    draggedId === page.id && "opacity-40"
                  )}
                  style={
                    dragOverId === page.id && draggedId !== page.id
                      ? { boxShadow: "inset 0 2px 0 0 var(--color-gold)" }
                      : undefined
                  }
                  onClick={() => {
                    if (!isEditing) onSelectPage(page.id);
                  }}
                  role="button"
                  aria-current={isSelected ? "page" : undefined}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !isEditing) {
                      e.preventDefault();
                      onSelectPage(page.id);
                    }
                  }}
                >
                  {/* Title row */}
                  <div className="flex items-center gap-2">
                    {canReorder ? (
                      <span
                        className="shrink-0 cursor-grab text-rune-mist/20 opacity-0 transition-opacity duration-100 group-hover:opacity-100 active:cursor-grabbing"
                        title="Drag to reorder"
                        aria-hidden="true"
                      >
                        <GripVertical size={12} />
                      </span>
                    ) : (
                      <span className="w-3 shrink-0" aria-hidden="true" />
                    )}

                    <FileText
                      size={13}
                      className="shrink-0"
                      style={{
                        color: isSelected
                          ? "var(--color-gold)"
                          : "var(--color-mist)",
                      }}
                      aria-hidden
                    />

                    {isEditing ? (
                      <input
                        ref={inputRef}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => commitEdit(page.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit(page.id);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        style={{ color: "var(--text-primary)" }}
                        aria-label="Rename scene"
                      />
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate text-sm"
                        style={{
                          color: "var(--text-primary)",
                          opacity: isSelected ? 1 : 0.65,
                        }}
                        onDoubleClick={(e) => startEditing(page, e)}
                        title={page.title}
                      >
                        {page.title}
                      </span>
                    )}

                    {!isEditing && (
                      <PageMenu
                        page={page}
                        canDelete={isUnplacedView || pages.length > 1}
                        onRename={() => {
                          setEditingId(page.id);
                          setEditingTitle(page.title);
                          setTimeout(() => inputRef.current?.select(), 0);
                        }}
                        onDelete={() => onDeletePage(page.id)}
                        onMoveToUnplaced={
                          onMoveToUnplaced ? () => onMoveToUnplaced(page.id) : undefined
                        }
                        moveTargets={allChapters.filter((c) => c.id !== currentChapterId)}
                        onMoveToChapter={
                          onMoveToChapter
                            ? (chapterId) => onMoveToChapter(page.id, chapterId)
                            : undefined
                        }
                        onMoveUp={canReorder && index > 0 ? () => moveBy(page.id, -1) : undefined}
                        onMoveDown={
                          canReorder && index < pages.length - 1
                            ? () => moveBy(page.id, 1)
                            : undefined
                        }
                      />
                    )}
                  </div>

                  {/* Word count row — always shown */}
                  {!isEditing && (
                    <div className="ml-[21px] mt-0.5">
                      <span
                        className="text-[10px] tabular-nums transition-all duration-200"
                        style={{
                          color: "var(--color-mist)",
                          opacity: 0.5,
                        }}
                      >
                        {(page.word_count ?? 0).toLocaleString()} words
                      </span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}

          {/* Empty zone — double-click to add */}
          <li
            className="min-h-[3rem] flex-1 list-none"
            aria-hidden="true"
            title="Double-click to add a scene"
            onDoubleClick={(e) => {
              e.preventDefault();
              onAddPage();
            }}
          />
        </ul>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-col">
        <div
          className="mx-auto h-px w-[92%] shrink-0"
          style={{ background: "var(--color-border)" }}
          aria-hidden
        />
        <div className="p-2">
          <button
            type="button"
            onClick={onAddPage}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs transition-colors duration-100 hover:bg-rune-gold/10"
            style={{ color: "var(--color-mist)" }}
          >
            <Plus size={13} aria-hidden />
            Add Scene
          </button>
        </div>
      </div>
    </aside>
  );
}
