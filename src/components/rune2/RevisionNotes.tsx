"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Trash2 } from "lucide-react";
import { readNoteDraft, writeNoteDraft } from "@/lib/rune2/noteDrafts";
import { openableId } from "@/lib/rune2/references";
import {
  noteScopeOf,
  noteSections,
  presentedScope,
  REVISION_NOTE_MAX,
  scopeNoun,
  scopeTrail,
  targetLabel,
  type NoteScope,
  type NoteTargetType,
} from "@/lib/rune2/revisionNotes";
import type { ShownNote } from "@/lib/rune2/revisionNoteSync";
import { useProfileStore } from "@/store/profileStore";
import { useRune2Selection } from "./Rune2Selection";
import { useRevisionNotes } from "./RevisionNoteStore";

// Revision Notes (migrations 039, 040) — the one home for revision notes, in
// the right-hand panel. Writer-authored revision thoughts on the Manuscript, a
// Group, a Chapter or a Scene, read through the manuscript's hierarchy:
//
//   * the panel shows the level the writer is at — the selected Scene,
//     Chapter or Group, the Scene being read, or the whole Manuscript when
//     nothing is selected — and a quiet trail moves up (and back down) the
//     levels above it;
//   * a Scene shows only its own notes; a Chapter its own and its Scenes';
//     a Group its own and everything inside it; the Manuscript everything,
//     Unplaced Scenes last — grouped by where each belongs, in manuscript
//     order. Each note exists once; nothing is copied to aggregate;
//   * a Chapter's one Scene has no surface of its own (it reads as the
//     Chapter), so it has no section of its own either: its notes read in the
//     Chapter's, and the Scene's level is the Chapter's (presentedScope). Each
//     note keeps its Scene target; a second Scene brings the grouping back;
//   * a new note goes to the level shown. Return saves and clears the field
//     for the next one; Shift-Return is a new line. Unsent text is kept on
//     the device (noteDrafts);
//   * each note is edited in place (Return or leaving it saves; Escape puts it
//     back) and deleted on its own; clearing its text deletes it;
//   * saving is the store's (revisionNoteSync): shown at once, kept on the
//     device until the server has it, marked "Not saved yet" when a save
//     failed. A note changed or deleted elsewhere waits for the writer.
//
// No status, priority, due date, checkbox or resolved state: a note is text.

const scopeKey = (s: NoteScope) => `${s.type}:${s.id}`;

export function RevisionNotesView() {
  const { index, selected, reading, readingAt, readingFocus } = useRune2Selection();
  const { manuscriptId, notes, loaded, loadFailed, offline, sync } = useRevisionNotes();
  // While reading, the level is the Scene being read (or the one chosen from Reading Mode).
  const readingId = reading ? (readingFocus ?? readingAt) : null;
  const entry = reading ? (readingId ? (index.get(openableId(index, readingId)) ?? null) : null) : selected;
  // A Chapter's one Scene reads as the Chapter (presentedScope), in the panel as on the page.
  const base = manuscriptId
    ? presentedScope(noteScopeOf(entry, manuscriptId) ?? { type: "manuscript" as const, id: manuscriptId }, index)
    : null;

  // The writer may step to another level on the trail; a new selection starts from it again.
  const [moved, setMoved] = useState<{ from: string; to: NoteScope } | null>(null);
  const scope =
    base && moved && moved.from === scopeKey(base) && (moved.to.type === "manuscript" || index.has(moved.to.id))
      ? moved.to
      : base;

  if (!scope || !base || !manuscriptId) return <p className="r2-panel-empty">Revision notes aren’t available here yet.</p>;
  const trail = scopeTrail(base, index, manuscriptId);
  const sections = noteSections(notes, scope, index);
  const unsaved = offline && sections.some((s) => s.notes.some((n) => n.pending === "pending"));
  const noun = scopeNoun(scope);

  return (
    <div className="r2-rnotes" data-revision-notes={scopeKey(scope)}>
      <nav className="r2-rnotes-trail" aria-label="Revision notes for">
        {trail.map((step, i) => (
          <span key={scopeKey(step.scope)} className="r2-rnotes-trail-step">
            {i > 0 && (
              <span aria-hidden className="r2-rnotes-trail-sep">
                /
              </span>
            )}
            <button
              type="button"
              className="r2-rnotes-trail-link"
              aria-current={scopeKey(step.scope) === scopeKey(scope) ? "location" : undefined}
              onClick={() =>
                setMoved(scopeKey(step.scope) === scopeKey(base) ? null : { from: scopeKey(base), to: step.scope })
              }
            >
              {step.title}
            </button>
          </span>
        ))}
      </nav>

      <NoteComposer
        key={scopeKey(scope)}
        target={scope}
        placeholder={scope.type === "manuscript" ? "Note for the whole manuscript…" : `Note for this ${noun}…`}
        label={scope.type === "manuscript" ? "New revision note for the whole manuscript" : `New revision note for this ${noun}`}
        hint
      />

      {unsaved && (
        <p role="status" className="r2-rnotes-status" data-tone="alert">
          Not saved yet — kept on this device.
          <button type="button" className="r2-panel-link" onClick={() => void sync?.flush()}>
            Try again
          </button>
        </p>
      )}

      {!loaded && sections.length === 0 ? (
        <p className="r2-panel-empty r2-rnotes-empty">{loadFailed ? "Couldn’t load revision notes." : "Loading…"}</p>
      ) : sections.length === 0 ? (
        <p className="r2-panel-empty r2-rnotes-empty">{EMPTY[scope.type]}</p>
      ) : (
        <div className="r2-rnotes-sections">
          {sections.map(({ target, notes: list }) => {
            const label = targetLabel(target, index);
            return (
              <section
                key={scopeKey(target)}
                className="r2-rnotes-section"
                style={{ paddingLeft: Math.min(target.depth, 4) * 10 }}
                aria-label={label}
              >
                <p className="r2-rnotes-source">{label}</p>
                <ul role="list" className="r2-rnotes-list">
                  {list.map((note) => (
                    <NoteItem key={note.id} note={note} label={label} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <p className="r2-rnotes-hint">Kept beside the manuscript, never part of it.</p>
    </div>
  );
}

const EMPTY: Record<NoteTargetType, string> = {
  scene: "No notes for this scene yet.",
  chapter: "No notes for this chapter or its scenes yet.",
  group: "No notes in this group yet.",
  manuscript: "No revision notes yet. What you write here stays with the manuscript for your next pass.",
};

/**
 * The add field: a note for `target`. Return saves it and clears the field,
 * ready for the next; Shift-Return is a new line; Escape clears, then leaves.
 * Unsent text is kept on the device until it is saved or cleared.
 */
export function NoteComposer({
  target,
  placeholder,
  label,
  hint,
  autoFocus,
  onEscape,
  onAdded,
}: {
  target: NoteScope;
  placeholder: string;
  label: string;
  hint?: boolean;
  autoFocus?: boolean;
  onEscape?: () => void;
  onAdded?: () => void;
}) {
  const { sync, projectId } = useRevisionNotes();
  const userId = useProfileStore((s) => s.profile?.id);
  const draftKey = scopeKey(target);
  const [draft, setDraftState] = useState(() => readNoteDraft(userId, projectId, draftKey));
  const setDraft = (text: string) => {
    setDraftState(text);
    writeNoteDraft(userId, projectId, draftKey, text);
  };
  // The profile may arrive after the first render: pick up the kept draft then.
  const [readFor, setReadFor] = useState(userId);
  if (userId !== readFor) {
    setReadFor(userId);
    if (!draft) setDraftState(readNoteDraft(userId, projectId, draftKey));
  }

  function add() {
    if (!sync || !draft.trim()) return;
    sync.create(target.type, target.id, draft);
    setDraft("");
    onAdded?.();
  }

  function keyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      add();
    } else if (e.key === "Escape") {
      if (draft) {
        // First Escape clears the draft; the next one leaves.
        e.preventDefault();
        e.stopPropagation();
        setDraft("");
      } else if (onEscape) {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
      }
    }
  }

  return (
    <div className="r2-composer r2-rnotes-composer" data-filled={draft ? "" : undefined} data-note-composer>
      <textarea
        className="r2-composer-input"
        placeholder={placeholder}
        aria-label={label}
        rows={1}
        value={draft}
        maxLength={REVISION_NOTE_MAX}
        disabled={!sync}
        spellCheck
        autoFocus={autoFocus}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={keyDown}
      />
      {hint && (
        <p className="r2-composer-hint" aria-hidden>
          Return to add · Shift-Return for a new line
        </p>
      )}
    </div>
  );
}

function NoteItem({ note, label }: { note: ShownNote; label: string }) {
  const { sync, offline } = useRevisionNotes();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const textRef = useRef(note.body);
  const editingRef = useRef(false);
  const waiting = note.pending === "conflict" || note.pending === "missing" || note.pending === "refused";

  function begin() {
    if (!sync || waiting) return;
    textRef.current = note.body;
    setText(note.body);
    editingRef.current = true;
    setEditing(true);
  }
  function commit() {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    // Clearing a note's text deletes it; unchanged text writes nothing.
    sync?.edit(note.id, textRef.current);
  }
  function cancel() {
    editingRef.current = false;
    setEditing(false);
  }
  // Leaving mid-edit (another Scene, the panel closing) keeps the edit.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => () => commitRef.current(), []);

  const flag =
    note.pending === "pending" && offline ? "Not saved yet" : note.pending === "unavailable" ? "Waiting to be saved" : null;
  return (
    <li className="r2-rnote" data-pending={note.pending ?? undefined}>
      {flag && <p className="r2-rnote-flag">{flag}</p>}
      {editing ? (
        <textarea
          className="r2-rnote-edit"
          aria-label={`Edit revision note (${label})`}
          autoFocus
          value={text}
          maxLength={REVISION_NOTE_MAX}
          spellCheck
          onChange={(e) => {
            textRef.current = e.target.value;
            setText(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancel();
            }
          }}
        />
      ) : (
        <button type="button" className="r2-rnote-body" onClick={begin} disabled={waiting} title="Edit note">
          {note.body}
        </button>
      )}
      {!editing && !waiting && (
        <span className="r2-rnote-actions">
          <button
            type="button"
            className="r2-icon-button"
            aria-label={`Delete note (${label})`}
            title="Delete note"
            onClick={() => sync?.remove(note.id)}
          >
            <Trash2 size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </span>
      )}
      {waiting && <NoteChoice note={note} />}
    </li>
  );
}

/** A note waiting on the writer: changed or deleted elsewhere, or refused. Never resolved silently. */
function NoteChoice({ note }: { note: ShownNote }) {
  const { sync } = useRevisionNotes();
  const choose = (choice: "mine" | "theirs") => sync?.resolve(note.id, choice);
  let message: string;
  let mine: string;
  let theirs: string;
  if (note.pending === "missing") {
    message = "This note was deleted somewhere else while you were changing it.";
    mine = "Keep it";
    theirs = "Let it go";
  } else if (note.pending === "refused") {
    message = "This note couldn’t be saved.";
    mine = "Try again";
    theirs = "Discard it";
  } else if (note.deleting) {
    message = "This note was changed somewhere else after you deleted it.";
    mine = "Delete anyway";
    theirs = "Keep it";
  } else {
    message = "This note was changed somewhere else while you were writing.";
    mine = "Keep mine";
    theirs = "Use that version";
  }
  return (
    <div role="alert" className="r2-rnote-choice">
      <p>{message}</p>
      {note.remote && !note.deleting && <p className="r2-rnote-theirs">{note.remote.body}</p>}
      <div className="r2-rnote-choice-actions">
        <button type="button" className="r2-button" onClick={() => choose("mine")}>
          {mine}
        </button>
        <button type="button" className="r2-button" onClick={() => choose("theirs")}>
          {theirs}
        </button>
      </div>
    </div>
  );
}
