"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { StickyNote, X, Check, Pin, PinOff, Trash2, Plus } from "lucide-react";
import {
  listProjectNotes,
  createProjectNote,
  completeProjectNote,
  deleteProjectNote,
  pinProjectNote,
  unpinProjectNote,
} from "@/lib/actions/notes";
import { cn } from "@/lib/utils";
import type { ProjectNote } from "@/lib/types";

interface Props {
  projectId: string;
  externalOpen?: boolean;
  onExternalClose?: () => void;
  guideActive?: boolean;
}

export function RevisionNotesButton({ projectId, externalOpen, onExternalClose, guideActive = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveOpen = isOpen || externalOpen === true;

  function open() {
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
    onExternalClose?.();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150"
        style={{
          border: "1px solid var(--color-border-strong)",
          color: "var(--color-mist)",
          background: "transparent",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--color-gold)";
          (e.currentTarget as HTMLElement).style.color = "var(--color-gold)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor =
            "var(--color-border-strong)";
          (e.currentTarget as HTMLElement).style.color = "var(--color-mist)";
        }}
        aria-label="Open revision notes"
      >
        <StickyNote size={13} aria-hidden />
        Notes
      </button>

      {mounted &&
        createPortal(
          <RevisionNotesDrawer
            projectId={projectId}
            isOpen={effectiveOpen}
            onClose={close}
            guideActive={guideActive}
          />,
          document.body
        )}
    </>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────────

interface DrawerProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  guideActive?: boolean;
}

function RevisionNotesDrawer({ projectId, isOpen, onClose, guideActive = false }: DrawerProps) {
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showCompleted, setShowCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load notes when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    if (loaded) return;
    listProjectNotes(projectId).then((result) => {
      if (result.data) setNotes(result.data);
      setLoaded(true);
    });
  }, [isOpen, loaded, projectId]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const activeNotes = notes.filter((n) => !n.is_completed);
  const completedNotes = notes.filter((n) => n.is_completed);
  const pinnedNote = activeNotes.find((n) => n.is_pinned);
  const unpinnedNotes = activeNotes.filter((n) => !n.is_pinned);

  function handleCreate() {
    const content = newContent.trim();
    if (!content) return;
    setNewContent("");

    const optimistic: ProjectNote = {
      id: `optimistic-${Date.now()}`,
      user_id: "",
      project_id: projectId,
      content,
      is_completed: false,
      is_pinned: false,
      created_at: new Date().toISOString(),
      completed_at: null,
      updated_at: new Date().toISOString(),
    };
    setNotes((prev) => [...prev, optimistic]);

    startTransition(async () => {
      const result = await createProjectNote(projectId, content);
      if (result.data) {
        setNotes((prev) =>
          prev.map((n) => (n.id === optimistic.id ? result.data! : n))
        );
      }
    });
  }

  function handleComplete(note: ProjectNote) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === note.id
          ? { ...n, is_completed: true, is_pinned: false }
          : n
      )
    );
    startTransition(async () => {
      await completeProjectNote(note.id);
    });
  }

  function handleDelete(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    startTransition(async () => {
      await deleteProjectNote(noteId);
    });
  }

  function handlePin(note: ProjectNote) {
    setNotes((prev) =>
      prev.map((n) => ({
        ...n,
        is_pinned: n.id === note.id ? true : false,
      }))
    );
    startTransition(async () => {
      await pinProjectNote(note.id, projectId);
    });
  }

  function handleUnpin(note: ProjectNote) {
    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, is_pinned: false } : n))
    );
    startTransition(async () => {
      await unpinProjectNote(note.id);
    });
  }

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "var(--color-ink)",
          opacity: isOpen && !guideActive ? 0.22 : 0,
          pointerEvents: isOpen && !guideActive ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Revision Notes"
        data-guide="project-notes-drawer"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col overflow-hidden transition-transform duration-300"
        style={{
          background: "var(--surface-card)",
          borderLeft: "1px solid var(--color-border)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          boxShadow: "-10px 0 40px var(--color-shadow)",
        }}
      >
        {/* Header */}
        <div
          className="flex flex-shrink-0 items-start justify-between px-6 pb-4 pt-6"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Revision Notes
            </p>
            <p
              className="mt-1 font-rune-serif text-sm italic"
              style={{ color: "var(--color-mist)", opacity: 0.6 }}
            >
              Keep track of what this manuscript needs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close revision notes"
            className="ml-4 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition-opacity hover:opacity-60"
            style={{ color: "var(--color-mist)" }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Add note input */}
        <div
          className="flex-shrink-0 px-6 py-4"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Add a note..."
              maxLength={500}
              aria-label="New revision note"
              className="min-w-0 flex-1 bg-transparent font-rune-serif text-sm outline-none"
              style={{
                color: "var(--text-primary)",
              }}
              onFocus={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.borderColor =
                  "var(--color-gold)";
              }}
              onBlur={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.borderColor =
                  "var(--color-border)";
              }}
            />
            <button
              type="submit"
              disabled={!newContent.trim() || isPending}
              aria-label="Add note"
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
              style={{
                background: "var(--color-gold)",
                color: "var(--text-on-accent)",
              }}
            >
              <Plus size={13} aria-hidden />
            </button>
          </form>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!loaded && (
            <p
              className="font-rune-serif text-sm italic"
              style={{ color: "var(--color-mist)", opacity: 0.5 }}
            >
              Loading...
            </p>
          )}

          {loaded && activeNotes.length === 0 && (
            <p
              className="font-rune-serif text-sm italic"
              style={{ color: "var(--color-mist)", opacity: 0.5 }}
            >
              No notes yet. Start with something to fix.
            </p>
          )}

          {/* Pinned note */}
          {pinnedNote && (
            <div className="mb-5">
              <p
                className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-gold)" }}
              >
                Today&apos;s Focus
              </p>
              <NoteRow
                note={pinnedNote}
                onComplete={handleComplete}
                onDelete={handleDelete}
                onPin={handlePin}
                onUnpin={handleUnpin}
                isPinned
              />
            </div>
          )}

          {/* Other active notes */}
          {unpinnedNotes.length > 0 && (
            <ul className="flex flex-col gap-1" role="list">
              {unpinnedNotes.map((note) => (
                <li key={note.id}>
                  <NoteRow
                    note={note}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    onPin={handlePin}
                    onUnpin={handleUnpin}
                    isPinned={false}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Completed notes */}
          {completedNotes.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-70"
                style={{ color: "var(--color-mist)" }}
              >
                <span
                  className="inline-block transition-transform duration-200"
                  style={{
                    transform: showCompleted ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                >
                  ›
                </span>
                Completed ({completedNotes.length})
              </button>

              {showCompleted && (
                <ul className="mt-3 flex flex-col gap-1 opacity-50" role="list">
                  {completedNotes.map((note) => (
                    <li key={note.id}>
                      <div
                        className="group flex items-start gap-3 rounded px-2 py-2"
                        style={{ background: "rgba(255,255,255,0.025)" }}
                      >
                        <div
                          className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm"
                          style={{
                            background: "var(--color-gold)",
                            border: "1px solid var(--color-gold)",
                          }}
                        >
                          <Check
                            size={11}
                            strokeWidth={3}
                            style={{ color: "var(--text-on-accent)" }}
                            aria-hidden
                          />
                        </div>
                        <span
                          className="flex-1 font-rune-serif text-sm line-through"
                          style={{
                            color: "var(--color-mist)",
                            textDecorationColor: "var(--color-mist)",
                          }}
                        >
                          {note.content}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(note.id)}
                          aria-label={`Delete note: ${note.content}`}
                          className="mt-0.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          style={{ color: "var(--color-mist)" }}
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ── Note row ─────────────────────────────────────────────────────────────────

interface NoteRowProps {
  note: ProjectNote;
  isPinned: boolean;
  onComplete: (note: ProjectNote) => void;
  onDelete: (id: string) => void;
  onPin: (note: ProjectNote) => void;
  onUnpin: (note: ProjectNote) => void;
}

function NoteRow({
  note,
  isPinned,
  onComplete,
  onDelete,
  onPin,
  onUnpin,
}: NoteRowProps) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded px-2 py-2 transition-colors duration-150",
        isPinned && "rounded-md"
      )}
      style={{
        background: isPinned
          ? "rgba(201,168,76,0.05)"
          : "rgba(255,255,255,0.025)",
        border: isPinned ? "1px solid rgba(201,168,76,0.15)" : "1px solid transparent",
      }}
    >
      {/* Checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        aria-label={`Mark as done: ${note.content}`}
        onClick={() => onComplete(note)}
        className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border transition-colors duration-150"
        style={{
          borderColor: "var(--color-border-strong)",
          background: "transparent",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--color-gold)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor =
            "var(--color-border-strong)";
        }}
      />

      {/* Content */}
      <span
        className="flex-1 font-rune-serif text-sm leading-snug"
        style={{ color: "var(--text-primary)" }}
      >
        {note.content}
      </span>

      {/* Controls (visible on hover) */}
      <div className="mt-0.5 flex flex-shrink-0 items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {/* Pin/Unpin */}
        <button
          type="button"
          onClick={() => (isPinned ? onUnpin(note) : onPin(note))}
          aria-label={isPinned ? "Remove from Today's Focus" : "Set as Today's Focus"}
          className="transition-opacity hover:opacity-70"
          style={{ color: isPinned ? "var(--color-gold)" : "var(--color-mist)" }}
        >
          {isPinned ? <PinOff size={13} aria-hidden /> : <Pin size={13} aria-hidden />}
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          aria-label={`Delete note: ${note.content}`}
          className="transition-opacity hover:opacity-70"
          style={{ color: "var(--color-mist)" }}
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}
