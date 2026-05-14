"use client";

import { useState, useRef } from "react";
import { Plus, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Page } from "@/lib/types";
import { renamePage } from "@/lib/actions/pages";

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
      className="flex h-full w-[200px] shrink-0 flex-col overflow-hidden"
      style={{
        background: "var(--color-sepia)",
        borderRight: "1px solid var(--color-border)",
      }}
      aria-label="Page list"
    >
      <div
        className="flex items-center px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Pages
        </span>
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
                    "group relative flex cursor-pointer select-none items-center gap-2 px-3 py-2 transition-colors duration-100",
                    isSelected
                      ? "border-l-2 border-rune-gold bg-rune-gold/10"
                      : "border-l-2 border-transparent hover:border-rune-gold/30 hover:bg-rune-gold/5"
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
                      style={{ color: "var(--color-parchment)" }}
                      aria-label="Rename page"
                    />
                  ) : (
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        isSelected
                          ? "text-rune-parchment"
                          : "text-rune-parchment/60 group-hover:text-rune-parchment/80"
                      )}
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

      <div
        className="shrink-0 p-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
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
    </aside>
  );
}
