"use client";

import { useState, useTransition } from "react";
import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import { createFounderNote, deleteFounderNote } from "@/lib/actions/pulse";
import type { FounderNote } from "@/lib/types";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function OpenQuestions({ initialNotes }: { initialNotes: FounderNote[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    startTransition(async () => {
      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: FounderNote = {
        id: optimisticId,
        author_id: null,
        content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setNotes((prev) => [optimistic, ...prev]);
      const { error } = await createFounderNote(content);
      if (error) {
        setNotes((prev) => prev.filter((n) => n.id !== optimisticId));
      }
    });
  }

  function handleDelete(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    startTransition(async () => {
      await deleteFounderNote(id);
    });
  }

  return (
    <PulseCard className="flex flex-col p-6">
      <PulseCardLabel>Open Questions</PulseCardLabel>

      <div className="mb-5 flex items-start gap-2 border-b pb-5" style={{ borderColor: "var(--color-border)" }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Is onboarding too long? Does Structure outperform Dashboard?"
          rows={2}
          className="flex-1 resize-none rounded-md px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--color-border-strong)",
            color: "var(--text-primary)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd();
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!draft.trim() || isPending}
          className="shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
        >
          Add
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-mist)" }}>
          No open questions recorded yet.
        </p>
      ) : (
        <ul role="list" className="max-h-[220px] space-y-2 overflow-y-auto">
          {notes.map((note) => (
            <li
              key={note.id}
              className="group flex items-start justify-between gap-3 rounded-md px-3 py-2.5"
              style={{ background: "rgba(201, 168, 76, 0.04)" }}
            >
              <div className="min-w-0">
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {note.content}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                  {fmtDate(note.created_at)}
                </p>
              </div>
              <button
                onClick={() => handleDelete(note.id)}
                aria-label="Delete note"
                className="shrink-0 text-xs opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-60"
                style={{ color: "var(--color-crimson)" }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </PulseCard>
  );
}
