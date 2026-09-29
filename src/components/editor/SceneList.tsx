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
import { calculateChapterWordCount } from "@/lib/manuscript";
import { renameScene } from "@/lib/actions/scenes";

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function SceneListSkeleton() {
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

interface SceneMenuProps {
  scene: Scene;
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

function SceneMenu({
  scene,
  onRename,
  onDelete,
  onMoveToUnplaced,
  moveTargets = [],
  onMoveToChapter,
  onMoveUp,
  onMoveDown,
}: SceneMenuProps) {
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
        aria-label={`Options for ${scene.title}`}
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
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs transition-colors hover:bg-rune-crimson/10"
                style={{ color: "var(--color-crimson)" }}
              >
                <Trash2 size={11} aria-hidden />
                Move to Trash
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SceneListProps {
  /** The Chapter's placed Scenes, or the Unplaced Scenes. */
  scenes: Scene[];
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  /** Adds a Scene at the end of this Chapter, or of the Unplaced Scenes. */
  onAddScene: () => void;
  onDeleteScene: (sceneId: string) => void;
  onRenameScene: (sceneId: string, title: string) => void;
  /** Absent in the Unplaced view: Unplaced Scenes have no narrative order. */
  onReorderScenes?: (orderedSceneIds: string[]) => void;
  onMoveToUnplaced?: (sceneId: string) => void;
  onMoveToChapter?: (sceneId: string, chapterId: string) => void;
  allChapters: ChapterWithScenes[];
  /** The Chapter being edited, or null in the Unplaced view. */
  currentChapterId: string | null;
  unplacedCount?: number;
  projectId: string;
}

export function SceneList({
  scenes,
  selectedSceneId,
  onSelectScene,
  onAddScene,
  onDeleteScene,
  onRenameScene,
  onReorderScenes,
  onMoveToUnplaced,
  onMoveToChapter,
  allChapters,
  currentChapterId,
  unplacedCount = 0,
  projectId,
}: SceneListProps) {
  const isUnplacedView = currentChapterId === null;
  const canReorder = !!onReorderScenes;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [view, setView] = useState<"scenes" | "chapters">("scenes");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleDragStart(e: React.DragEvent, sceneId: string) {
    setDraggedId(sceneId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, sceneId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === sceneId) return;
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== sceneId) setDragOverId(sceneId);
  }

  function handleDrop(e: React.DragEvent, sceneId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === sceneId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const fromIndex = scenes.findIndex((p) => p.id === draggedId);
    const toIndex = scenes.findIndex((p) => p.id === sceneId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const reordered = scenes.map((p) => p.id);
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, draggedId);

    setDraggedId(null);
    setDragOverId(null);
    onReorderScenes?.(reordered);
  }

  /** Keyboard/menu reordering: one step up (-1) or down (+1). */
  function moveBy(sceneId: string, delta: -1 | 1) {
    const ids = scenes.map((p) => p.id);
    const from = ids.indexOf(sceneId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    ids.splice(from, 1);
    ids.splice(to, 0, sceneId);
    onReorderScenes?.(ids);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  function startEditing(scene: Scene, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(scene.id);
    setEditingTitle(scene.title);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitEdit(sceneId: string) {
    const title = editingTitle.trim() || "Untitled";
    onRenameScene(sceneId, title);
    setEditingId(null);
    await renameScene(sceneId, title);
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
              onClick={() => setView("scenes")}
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
              const sceneCount = chapter.scenes.length;
              const wordCount = calculateChapterWordCount(chapter);

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
                      {sceneCount} {sceneCount === 1 ? "scene" : "scenes"} ·{" "}
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
                if (isUnplacedView) setView("scenes");
                else router.push(`/projects/${projectId}/unplaced`);
              }}
              role="button"
              tabIndex={0}
              aria-current={isUnplacedView ? "page" : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (isUnplacedView) setView("scenes");
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
                {isUnplacedView ? scenes.length : unplacedCount}{" "}
                {(isUnplacedView ? scenes.length : unplacedCount) === 1 ? "scene" : "scenes"} · not in manuscript
              </span>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // ── Scenes view ────────────────────────────────────────────────────────────────

  return (
    <aside
      data-tutorial-id="scenes-sidebar"
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
          {scenes.map((scene, index) => {
            const isSelected = selectedSceneId === scene.id;
            const isEditing = editingId === scene.id;

            return (
              <li key={scene.id} className="shrink-0">
                <div
                  draggable={canReorder && !isEditing}
                  onDragStart={(e) => handleDragStart(e, scene.id)}
                  onDragOver={(e) => handleDragOver(e, scene.id)}
                  onDrop={(e) => handleDrop(e, scene.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "group relative mx-2 flex w-[calc(100%-1rem)] cursor-pointer select-none flex-col px-3 py-1.5 transition-all duration-200 rounded-md",
                    isSelected
                      ? "bg-rune-gold/15 shadow-sm"
                      : "hover:bg-rune-gold/5",
                    draggedId === scene.id && "opacity-40"
                  )}
                  style={
                    dragOverId === scene.id && draggedId !== scene.id
                      ? { boxShadow: "inset 0 2px 0 0 var(--color-gold)" }
                      : undefined
                  }
                  onClick={() => {
                    if (!isEditing) onSelectScene(scene.id);
                  }}
                  role="button"
                  aria-current={isSelected ? "page" : undefined}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !isEditing) {
                      e.preventDefault();
                      onSelectScene(scene.id);
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
                        onBlur={() => commitEdit(scene.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit(scene.id);
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
                        onDoubleClick={(e) => startEditing(scene, e)}
                        title={scene.title || "Untitled"}
                      >
                        {scene.title || "Untitled"}
                      </span>
                    )}

                    {!isEditing && (
                      <SceneMenu
                        scene={scene}
                        onRename={() => {
                          setEditingId(scene.id);
                          setEditingTitle(scene.title);
                          setTimeout(() => inputRef.current?.select(), 0);
                        }}
                        onDelete={() => onDeleteScene(scene.id)}
                        onMoveToUnplaced={
                          onMoveToUnplaced ? () => onMoveToUnplaced(scene.id) : undefined
                        }
                        moveTargets={allChapters.filter((c) => c.id !== currentChapterId)}
                        onMoveToChapter={
                          onMoveToChapter
                            ? (chapterId) => onMoveToChapter(scene.id, chapterId)
                            : undefined
                        }
                        onMoveUp={canReorder && index > 0 ? () => moveBy(scene.id, -1) : undefined}
                        onMoveDown={
                          canReorder && index < scenes.length - 1
                            ? () => moveBy(scene.id, 1)
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
                        {(scene.word_count ?? 0).toLocaleString()} words
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
              onAddScene();
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
            onClick={onAddScene}
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
