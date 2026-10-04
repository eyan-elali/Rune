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
    <PulseCard className="flex flex-col">
      <PulseCardLabel>Open Questions</PulseCardLabel>

      <div className="r2-pulse-compose">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Is onboarding too long? Does Structure outperform Dashboard?"
          rows={2}
          className="r2-field r2-pulse-textarea flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd();
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!draft.trim() || isPending}
          className="r2-button r2-button--primary shrink-0"
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
              style={{ background: "var(--r2-hover-faint)" }}
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
                className="r2-button r2-button--quiet r2-button--sm r2-pulse-remove shrink-0"
                data-tone="danger"
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
