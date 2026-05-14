"use client";

import { useRef, useState, useEffect } from "react";
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Project options"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenChange(!open);
        }}
        className="rounded p-1 text-rune-mist/40 transition-colors hover:bg-rune-gold/10 hover:text-rune-gold"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded border shadow-xl"
          style={{
            background: "var(--color-sepia)",
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
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-rune-parchment/70 transition-colors hover:bg-rune-gold/10 hover:text-rune-gold"
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
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-rune-parchment/70 transition-colors hover:bg-rune-crimson/10 hover:text-rune-crimson"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      )}
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
        "group relative flex cursor-pointer flex-col rounded-lg",
        "border transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg",
        menuOpen && "z-50",
        deleting && "pointer-events-none opacity-40"
      )}
      style={{
        background: "var(--color-sepia)",
        borderColor: "var(--color-border)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--color-border-strong)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "var(--color-border)")
      }
    >
      {/* Colored top band */}
      <div
        className="h-1.5 w-full shrink-0"
        style={{ background: project.cover_color ?? DEFAULT_BAND_COLOR }}
      />

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-rune-serif text-base leading-snug text-rune-parchment group-hover:text-rune-gold transition-colors duration-150 line-clamp-2">
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
