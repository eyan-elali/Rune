"use client";

import { useState, useRef } from "react";
import { Plus, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Page } from "@/lib/types";
import { renamePage } from "@/lib/actions/pages";

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
            className="mx-1 h-7 animate-pulse rounded"
            style={{ background: "rgba(107, 101, 96, 0.12)" }}
          />
        ))}
      </div>
    </aside>
  );
}

interface PageListProps {
  pages: Page[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, title: string) => void;
}

export function PageList({
  pages,
  selectedPageId,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onRenamePage,
}: PageListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <aside
      className="flex h-full min-h-0 w-[15%] min-w-[160px] max-w-[240px] shrink-0 flex-col overflow-hidden"
      style={{
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--color-border)",
      }}
      aria-label="Page list"
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

      <div className="flex min-h-0 flex-1 flex-col">
        <ul
          className="flex flex-1 flex-col overflow-y-auto py-1"
          role="list"
          aria-label="Chapter pages"
        >
          {pages.map((page) => {
            const isSelected = selectedPageId === page.id;
            const isEditing = editingId === page.id;

            return (
              <li key={page.id} className="shrink-0">
                <div
                  className={cn(
                    "group relative mx-2 flex w-[calc(100%-1rem)] cursor-pointer select-none items-center gap-2 px-3 py-1.5 transition-all duration-200 rounded-md",
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
                  <FileText
                    size={14}
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
                      aria-label="Rename page"
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (pages.length > 1) onDeletePage(page.id);
                      }}
                      disabled={pages.length <= 1}
                      aria-label={`Delete ${page.title}`}
                      className="shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-100 hover:bg-rune-crimson/20 group-hover:opacity-100 disabled:pointer-events-none"
                      style={{ color: "var(--color-crimson)" }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
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
