"use client";

import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { deleteProject } from "@/lib/actions/projects";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

const DEFAULT_BAND_COLOR = "#3d4451";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function KebabMenu({
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(
    null
  );

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPosition(null);
      return;
    }

    function updatePosition() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 144;
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - menuWidth,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest("[data-project-menu]")
      ) {
        onOpenChange(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onOpenChange]);

  const dropdown =
    open && menuPosition ? (
      <div
        data-project-menu
        className="fixed z-[200] w-36 overflow-hidden rounded border shadow-xl"
        style={{
          top: menuPosition.top,
          left: menuPosition.left,
          background: "var(--surface-card)",
          borderColor: "var(--color-border-strong)",
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenChange(false);
            onEdit();
          }}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors hover:bg-rune-gold/10"
          style={{ color: "var(--text-primary)" }}
        >
          <Pencil size={13} />
          Edit
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenChange(false);
            onDelete();
          }}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors hover:bg-rune-crimson/10"
          style={{ color: "var(--text-primary)" }}
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>
    ) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Project options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenChange(!open);
        }}
        className="rounded p-1 text-rune-mist/40 transition-colors hover:bg-rune-gold/10 hover:text-rune-gold"
      >
        <MoreVertical size={15} />
      </button>

      {typeof document !== "undefined" && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--color-border)",
      }}
    >
      <div
        className="h-1.5 w-full shrink-0 animate-pulse rounded-t-lg"
        style={{ background: "rgba(107, 101, 96, 0.2)" }}
      />
      <div className="flex flex-col gap-3 p-5">
        <div
          className="h-4 w-3/4 animate-pulse rounded"
          style={{ background: "rgba(107, 101, 96, 0.15)" }}
        />
        <div
          className="h-3 w-full animate-pulse rounded"
          style={{ background: "rgba(107, 101, 96, 0.1)" }}
        />
        <div
          className="h-3 w-1/2 animate-pulse rounded"
          style={{ background: "rgba(107, 101, 96, 0.1)" }}
        />
        <div className="mt-1 flex items-center justify-between">
          <div
            className="h-3 w-20 animate-pulse rounded"
            style={{ background: "rgba(107, 101, 96, 0.12)" }}
          />
          <div
            className="h-3 w-16 animate-pulse rounded"
            style={{ background: "rgba(107, 101, 96, 0.12)" }}
          />
        </div>
      </div>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
}

export function ProjectCard({ project, onEdit }: ProjectCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    await deleteProject(project.id);
    router.refresh();
  }

  return (
    <article
      onClick={() => router.push(`/projects/${project.id}`)}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-visible rounded-lg",
        "border transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg",
        menuOpen && "z-50",
        deleting && "pointer-events-none opacity-40"
      )}
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--color-border)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--color-border-strong)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "var(--color-border)")
      }
    >
      <div
        className="h-1.5 w-full shrink-0 rounded-t-lg"
        style={{ background: project.cover_color ?? DEFAULT_BAND_COLOR }}
      />

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="font-rune-serif text-base leading-snug transition-colors duration-150 group-hover:text-rune-gold line-clamp-2"
            style={{ color: "var(--text-primary)" }}
          >
            {project.title}
          </h3>
          <div onClick={(e) => e.stopPropagation()}>
            <KebabMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              onEdit={() => onEdit(project)}
              onDelete={handleDelete}
            />
          </div>
        </div>

        {project.description && (
          <p className="line-clamp-2 text-xs text-rune-mist leading-relaxed">
            {project.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-xs text-rune-mist/50">
            {project.word_count.toLocaleString()} words
          </span>
          <span className="text-xs text-rune-mist/40">
            {formatDate(project.updated_at)}
          </span>
        </div>
      </div>
    </article>
  );
}
