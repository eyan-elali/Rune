"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { createProject, updateProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export const COVER_COLORS = [
  { label: "Burgundy", value: "#6b2737" },
  { label: "Forest", value: "#2d4a3e" },
  { label: "Midnight", value: "#1e2d4a" },
  { label: "Antique Gold", value: "#7a5c2e" },
  { label: "Slate", value: "#3d4451" },
  { label: "Dusty Rose", value: "#6b3d4a" },
] as const;

interface EditableProject {
  id: string;
  title: string;
  description: string | null;
  cover_color: string | null;
}

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editing?: EditableProject;
}

export function NewProjectModal({
  open,
  onClose,
  onSuccess,
  editing,
}: NewProjectModalProps) {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(COVER_COLORS[0].value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Sync form when editing target changes or modal opens
  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setDescription(editing?.description ?? "");
      setColor(editing?.cover_color ?? COVER_COLORS[0].value);
      setError(null);
      // Trigger entrance animation after first paint
      requestAnimationFrame(() => setVisible(true));
      setTimeout(() => titleRef.current?.focus(), 50);
    } else {
      setVisible(false);
    }
  }, [open, editing]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);

    const result = editing
      ? await updateProject(editing.id, {
          title: title.trim(),
          description: description.trim() || null,
          cover_color: color,
        })
      : await createProject(title.trim(), description.trim() || undefined, color);

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    onSuccess();
  }

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0"
      )}
      style={{ background: "rgba(26, 22, 20, 0.8)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={cn(
          "w-full max-w-md rounded-lg p-7 shadow-2xl transition-transform duration-200",
          visible ? "scale-100" : "scale-95"
        )}
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--color-border-strong)",
        }}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="modal-title"
            className="font-rune-serif text-xl"
            style={{ color: "var(--text-primary)" }}
          >
            {editing ? "Edit Project" : "New Project"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-rune-mist transition-colors hover:text-rune-parchment"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            ref={titleRef}
            label="Title"
            type="text"
            id="project-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="My novel, my memoir…"
          />

          {/* Description textarea */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="project-description"
              className="text-xs font-medium uppercase tracking-widest text-rune-mist"
            >
              Description
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="A brief synopsis or note…"
              className={cn(
                "w-full resize-none rounded border px-3 py-2.5 text-sm outline-none",
                "transition-colors duration-150",
                "bg-transparent placeholder:text-rune-mist/50",
                "border-[var(--color-border)]",
                "focus:border-rune-gold focus:ring-2 focus:ring-rune-gold/20"
              )}
              style={{
                background: "color-mix(in srgb, var(--bg-primary) 80%, transparent)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Color swatches */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-widest text-rune-mist">
              Cover Color
            </span>
            <div className="flex gap-2.5" role="radiogroup" aria-label="Cover color">
              {COVER_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-label={c.label}
                  aria-checked={color === c.value}
                  role="radio"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-transform duration-100",
                    color === c.value
                      ? "scale-110 ring-2 ring-rune-gold ring-offset-2 ring-offset-rune-sepia"
                      : "hover:scale-105"
                  )}
                  style={{ background: c.value }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-rune-crimson">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              {editing ? "Save Changes" : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
