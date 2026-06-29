"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Trash2,
  MoreHorizontal,
  Bookmark,
  Info,
  Pencil,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Page, Chapter } from "@/lib/types";
import { renamePage } from "@/lib/actions/pages";

type ChapterWithStats = Chapter & { pages: { id: string; word_count: number }[] };

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function PageListSkeleton() {
  return (
    <aside
      className="flex h-full min-h-0 w-[15%] min-w-[160px] max-w-[240px] shrink-0 flex-col overflow-hidden"
      style={{
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--color-border)",
      }}
      aria-label="Pages loading"
      aria-busy="true"
    >
      <div className="flex shrink-0 flex-col">
        <div className="flex items-center px-4 py-3">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Pages
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

// ── Per-page context menu ─────────────────────────────────────────────────────

interface PageMenuProps {
  page: Page;
  totalPages: number;
  onRename: () => void;
  onDelete: () => void;
  onSetCanonical: () => void;
  onClearCanonical: () => void;
}

function PageMenu({
  page,
  totalPages,
  onRename,
  onDelete,
  onSetCanonical,
  onClearCanonical,
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
        className="shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-100 hover:bg-rune-gold/15 group-hover:opacity-100"
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

              <div
                style={{
                  height: "1px",
                  background: "var(--color-border)",
                  margin: "2px 0",
                }}
              />

              {!page.is_canonical ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onSetCanonical();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs transition-colors hover:bg-rune-gold/10"
                  style={{ color: "var(--color-gold)" }}
                >
                  <Bookmark size={11} aria-hidden />
                  Set as Canonical
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onClearCanonical();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs transition-colors hover:bg-rune-gold/10"
                  style={{ color: "var(--color-gold)" }}
                >
                  <Bookmark size={11} aria-hidden />
                  Clear Canonical
                </button>
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
                disabled={totalPages <= 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs transition-colors hover:bg-rune-crimson/10 disabled:pointer-events-none disabled:opacity-40"
                style={{ color: "var(--color-crimson)" }}
              >
                <Trash2 size={11} aria-hidden />
                Delete Page
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
  pages: Page[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, title: string) => void;
  onSetCanonical: (pageId: string) => void;
  onClearCanonical: () => void;
  allChapters: ChapterWithStats[];
  currentChapterId: string;
  projectId: string;
}

export function PageList({
  pages,
  selectedPageId,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onRenamePage,
  onSetCanonical,
  onClearCanonical,
  allChapters,
  currentChapterId,
  projectId,
}: PageListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [view, setView] = useState<"pages" | "chapters">("pages");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const hasCanonical = pages.some((p) => p.is_canonical);

  function startEditing(page: Page, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(page.id);
    setEditingTitle(page.title);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitEdit(pageId: string) {
    const title = editingTitle.trim() || "Untitled";
    onRenamePage(pageId, title);
    setEditingId(null);
    await renamePage(pageId, title);
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
              aria-label="Back to pages"
              title="Back to pages"
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
              const pageCount = chapter.pages.length;
              const wordCount = chapter.pages.reduce(
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
                      {pageCount} {pageCount === 1 ? "page" : "pages"} ·{" "}
                      {wordCount.toLocaleString()} words
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
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
      aria-label="Page list"
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Pages
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

      {/* Canonical info bar */}
      {hasCanonical && (
        <div
          className="mx-3 mt-2 flex shrink-0 items-start gap-2 rounded-md px-2.5 py-2"
          style={{
            background: "rgba(201, 168, 76, 0.06)",
            borderLeft: "2px solid rgba(201, 168, 76, 0.35)",
          }}
        >
          <Info
            size={11}
            className="mt-0.5 shrink-0"
            style={{ color: "var(--color-gold)", opacity: 0.7 }}
            aria-hidden
          />
          <p
            className="text-[10px] leading-snug"
            style={{ color: "var(--color-gold)", opacity: 0.75 }}
            title="One page per chapter can be set as the canonical word count source. Non-canonical pages in that chapter won't count toward project totals, preventing double-counting when you keep scene drafts alongside a final combined page."
          >
            One page is set as the word count source for a chapter.
          </p>
        </div>
      )}

      {/* Page list */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ul
          className="flex flex-1 flex-col overflow-y-auto py-1"
          role="list"
          aria-label="Chapter pages"
        >
          {pages.map((page, index) => {
            const isSelected = selectedPageId === page.id;
            const isEditing = editingId === page.id;
            // When any page in this chapter is canonical, non-canonical pages are visually muted
            const isSupressed = hasCanonical && !page.is_canonical;

            return (
              <li key={page.id} className="shrink-0">
                <div
                  data-tutorial-id={index === 0 ? "canonical-control" : undefined}
                  className={cn(
                    "group relative mx-2 flex w-[calc(100%-1rem)] cursor-pointer select-none flex-col px-3 py-1.5 transition-all duration-200 rounded-md",
                    isSelected
                      ? "bg-rune-gold/15 shadow-sm"
                      : "hover:bg-rune-gold/5"
                  )}
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
                    {page.is_canonical ? (
                      <span
                        title="This page is the word count source for this chapter"
                        aria-label="Canonical page"
                        className="shrink-0 flex items-center"
                      >
                        <Bookmark
                          size={13}
                          fill="var(--color-gold)"
                          style={{ color: "var(--color-gold)" }}
                        />
                      </span>
                    ) : (
                      <FileText
                        size={13}
                        className="shrink-0"
                        style={{
                          color: isSelected
                            ? "var(--color-gold)"
                            : "var(--color-mist)",
                          opacity: isSupressed ? 0.45 : 1,
                        }}
                        aria-hidden
                      />
                    )}

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
                        aria-label="Rename page"
                      />
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate text-sm"
                        style={{
                          color: "var(--text-primary)",
                          opacity: isSelected ? 1 : isSupressed ? 0.4 : 0.65,
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
                        totalPages={pages.length}
                        onRename={() => {
                          setEditingId(page.id);
                          setEditingTitle(page.title);
                          setTimeout(() => inputRef.current?.select(), 0);
                        }}
                        onDelete={() => onDeletePage(page.id)}
                        onSetCanonical={() => onSetCanonical(page.id)}
                        onClearCanonical={onClearCanonical}
                      />
                    )}
                  </div>

                  {/* Word count row — always shown, styled by canonical status */}
                  {!isEditing && (
                    <div className="ml-[21px] mt-0.5">
                      <span
                        className={cn(
                          "text-[10px] tabular-nums transition-all duration-200",
                          isSupressed && "line-through"
                        )}
                        style={{
                          color: page.is_canonical
                            ? "var(--color-gold)"
                            : "var(--color-mist)",
                          opacity: page.is_canonical
                            ? 0.8
                            : isSupressed
                              ? 0.35
                              : 0.5,
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
            title="Double-click to add page"
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
            Add Page
          </button>
        </div>
      </div>
    </aside>
  );
}
