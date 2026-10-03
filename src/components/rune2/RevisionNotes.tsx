"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { readNoteDraft, readNoteDraftDetails, writeNoteDraft, writeNoteDraftDetails } from "@/lib/rune2/noteDrafts";
import { anchorExcerpt, type NoteAnchor } from "@/lib/rune2/noteAnchors";
import { Check, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { ICON, ICON_SM, ICON_SM_BOLD } from "./icons";
import { Tooltip } from "./Tooltip";
import { useRevisionNotePrefs } from "./revisionNotePrefs";
import {
  noteScopeOf,
  noteTree,
  notesInScope,
  presentedScope,
  REVISION_NOTE_MAX,
  scopeNoun,
  scopeTrail,
  targetLabel,
  type NoteScope,
  type NoteTargetType,
  type NoteTreeNode,
} from "@/lib/rune2/revisionNotes";
import type { ShownNote } from "@/lib/rune2/revisionNoteSync";
import { useProfileStore } from "@/store/profileStore";
import { useRune2Selection } from "./Rune2Selection";
import { useRevisionNotes } from "./RevisionNoteStore";

// Revision Notes (migrations 039, 040) — the one home for revision notes, in
// the right-hand panel: a manuscript notebook read through the manuscript's
// own hierarchy. Writer-authored revision thoughts on the Manuscript, a
// Group, a Chapter or a Scene:
//
//   * the panel shows the level the writer is at — the selected Scene,
//     Chapter or Group, or the whole Manuscript when nothing is selected —
//     and a quiet trail moves up (and back down) the levels above it;
//   * a Scene shows only its own notes; a Chapter its own and its Scenes';
//     a Group its own and everything inside it; the Manuscript everything,
//     Unplaced Scenes last. Each note exists once; nothing is copied to
//     aggregate. Inside a level the notes read as the manuscript is shaped
//     (noteTree): Groups hold Chapters hold Scenes, each a heading in
//     manuscript order, indented by depth, with its count — and each may be
//     folded away, so a large project's notes are scanned a part at a time.
//     At the Scene level there is nothing to fold: just the notes;
//   * a Chapter's one Scene has no surface of its own (it reads as the
//     Chapter), so it has no section of its own either: its notes read in the
//     Chapter's, and the Scene's level is the Chapter's (presentedScope). Each
//     note keeps its Scene target; a second Scene brings the grouping back;
//   * a new note goes to the level shown. Return saves and clears the field
//     for the next one; Shift-Return is a new line; "+ Add details" opens an
//     optional details field that saves with it (one note). Unsent text is
//     kept on the device (noteDrafts);
//   * a note is a revision ITEM (043): its text, optional details beneath it
//     (shown on request, edited with the text), a quiet circle that marks it
//     resolved — done notes stay, quieter, and hide behind "Show resolved" —
//     and, made from a passage while reading, the passage it was about, quoted
//     under it: a way back to that place in the reader. A note whose Scene
//     has changed since says so, gently; the quote stays;
//   * each note is edited in place (Return or leaving it saves; Escape puts it
//     back) and deleted on its own; clearing its text deletes it;
//   * saving is the store's (revisionNoteSync): shown at once, kept on the
//     device until the server has it, marked "Not saved yet" when a save
//     failed. A note changed or deleted elsewhere waits for the writer.
//
// No status, priority, due date, label or assignee: a note is text, with
// details and a resolved state at most. Reading Mode calls these "comments"
// (ReadingMode.tsx); they are the same notes.

const scopeKey = (s: NoteScope) => `${s.type}:${s.id}`;

/** Which headings the writer has folded, for the session (by target). */
const folded = new Set<string>();

export function RevisionNotesView() {
  const { index, selected: entry } = useRune2Selection();
  const { manuscriptId, notes, loaded, loadFailed, offline, sync, items } = useRevisionNotes();
  const { showResolved, setShowResolved } = useRevisionNotePrefs();
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
  // Folding is remembered across renders in `folded`; this only asks for a re-render.
  const [, bump] = useState(0);
  const toggleFold = (key: string) => {
    if (folded.has(key)) folded.delete(key);
    else folded.add(key);
    bump((n) => n + 1);
  };

  if (!scope || !base || !manuscriptId) return <p className="r2-panel-empty">Revision notes aren’t available here yet.</p>;
  const trail = scopeTrail(base, index, manuscriptId);
  // Done notes are kept and listed on request; by default the view is what is still open.
  const resolvedHere = items ? notesInScope(notes, scope, index).filter((n) => n.resolved).length : 0;
  const shown = items && !showResolved ? notes.filter((n) => !n.resolved) : notes;
  const tree = noteTree(shown, scope, index);
  const total = tree.own.length + tree.nodes.reduce((n, node) => n + node.count, 0);
  const unsaved = offline && notes.some((n) => n.pending === "pending");
  const noun = scopeNoun(scope);
  const ownLabel = targetLabel({ type: scope.type, id: scope.id, depth: 0, own: true, unplaced: false }, index);

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

      {!loaded && total === 0 ? (
        <p className="r2-panel-empty r2-rnotes-empty">{loadFailed ? "Couldn’t load revision notes." : "Loading…"}</p>
      ) : total === 0 ? (
        <p className="r2-panel-empty r2-rnotes-empty">
          {resolvedHere > 0 ? `Nothing open. ${resolvedHere === 1 ? "One note is" : `${resolvedHere} notes are`} resolved.` : EMPTY[scope.type]}
        </p>
      ) : (
        <div className="r2-rnotes-body">
          {tree.own.length > 0 && (
            <section className="r2-rnotes-own" aria-label={ownLabel}>
              {tree.nodes.length > 0 && <p className="r2-rnotes-heading r2-rnotes-heading--own">{ownLabel}</p>}
              <ul role="list" className="r2-rnotes-list">
                {tree.own.map((note) => (
                  <NoteItem key={note.id} note={note} label={ownLabel} />
                ))}
              </ul>
            </section>
          )}
          {tree.nodes.map((node) => (
            <NoteBranch
              key={`${node.target.type}:${node.target.id}`}
              node={node}
              foldable={scope.type !== "scene"}
              isFolded={(k) => folded.has(k)}
              onToggle={toggleFold}
            />
          ))}
        </div>
      )}
      {resolvedHere > 0 && (
        <p className="r2-rnotes-resolved-toggle">
          <button type="button" className="r2-panel-link" aria-pressed={showResolved} onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? "Hide resolved" : `Show ${resolvedHere === 1 ? "1 resolved note" : `${resolvedHere} resolved notes`}`}
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * One heading of the notebook — a Group, a Chapter or a Scene inside the level
 * shown — with its own notes and the headings inside it. Indented by depth;
 * folded away with its chevron (remembered for the session).
 */
function NoteBranch({
  node,
  foldable,
  isFolded,
  onToggle,
}: {
  node: NoteTreeNode<ShownNote>;
  foldable: boolean;
  isFolded: (key: string) => boolean;
  onToggle: (key: string) => void;
}) {
  const { index } = useRune2Selection();
  const key = `${node.target.type}:${node.target.id}`;
  const label = targetLabel(node.target, index);
  const open = !foldable || !isFolded(key);
  const depth = Math.min(node.target.depth, 4);
  return (
    <section className="r2-rnotes-branch" data-kind={node.target.type} data-depth={depth} aria-label={label}>
      <div className="r2-rnotes-heading" data-foldable={foldable || undefined}>
        {foldable ? (
          <button type="button" className="r2-rnotes-fold" aria-expanded={open} onClick={() => onToggle(key)}>
            <ChevronRight className="r2-rnotes-chevron" {...ICON_SM_BOLD} aria-hidden />
            <span className="r2-rnotes-heading-label">{label}</span>
            <span className="r2-rnotes-count" aria-label={`${node.count} ${node.count === 1 ? "note" : "notes"}`}>
              {node.count}
            </span>
          </button>
        ) : (
          <span className="r2-rnotes-heading-label">{label}</span>
        )}
      </div>
      {open && (
        <div className="r2-rnotes-branch-body">
          {node.notes.length > 0 && (
            <ul role="list" className="r2-rnotes-list">
              {node.notes.map((note) => (
                <NoteItem key={note.id} note={note} label={label} />
              ))}
            </ul>
          )}
          {node.children.map((child) => (
            <NoteBranch
              key={`${child.target.type}:${child.target.id}`}
              node={child}
              foldable={foldable}
              isFolded={isFolded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const EMPTY: Record<NoteTargetType, string> = {
  scene: "No notes for this scene yet.",
  chapter: "No notes for this chapter or its scenes yet.",
  group: "No notes in this group yet.",
  manuscript: "No revision notes yet. What you write here stays with the manuscript for your next pass.",
};

/**
 * The add field: a note (in the reader, a comment) for `target`. Return saves
 * it and clears the field, ready for the next; Shift-Return is a new line;
 * Escape clears, then leaves. The fast path is the one field; "+ Add details"
 * opens an optional second, longer field beneath it, and Return saves both as
 * one note. Unsent text — both fields — is kept on the device until it is
 * saved or cleared.
 */
export function NoteComposer({
  target,
  anchor = null,
  placeholder,
  label,
  hint,
  autoFocus,
  onEscape,
  onAdded,
}: {
  target: NoteScope;
  /** The passage the note is about (a Scene note made while reading); kept with the note. */
  anchor?: NoteAnchor | null;
  placeholder: string;
  label: string;
  hint?: boolean;
  autoFocus?: boolean;
  onEscape?: () => void;
  onAdded?: () => void;
}) {
  const { sync, projectId, items } = useRevisionNotes();
  const userId = useProfileStore((s) => s.profile?.id);
  const draftKey = anchor ? `${scopeKey(target)}:anchor` : scopeKey(target);
  const [draft, setDraftState] = useState(() => readNoteDraft(userId, projectId, draftKey));
  const [details, setDetailsState] = useState(() => (items ? readNoteDraftDetails(userId, projectId, draftKey) : ""));
  // Details are hidden until asked for — or already begun.
  const [withDetails, setWithDetails] = useState(() => Boolean(details));
  const detailsRef = useRef<HTMLTextAreaElement>(null);
  const setDraft = (text: string) => {
    setDraftState(text);
    writeNoteDraft(userId, projectId, draftKey, text);
  };
  const setDetails = (text: string) => {
    setDetailsState(text);
    writeNoteDraftDetails(userId, projectId, draftKey, text);
  };
  // The profile may arrive after the first render: pick up the kept draft then.
  const [readFor, setReadFor] = useState(userId);
  if (userId !== readFor) {
    setReadFor(userId);
    if (!draft) setDraftState(readNoteDraft(userId, projectId, draftKey));
    if (items && !details) {
      const kept = readNoteDraftDetails(userId, projectId, draftKey);
      if (kept) {
        setDetailsState(kept);
        setWithDetails(true);
      }
    }
  }

  function add() {
    if (!sync || !draft.trim()) return;
    sync.create(target.type, target.id, draft, anchor, withDetails && items ? details : null);
    setDraft("");
    setDetails("");
    setWithDetails(false);
    onAdded?.();
  }
  // Asked for, the details field takes the keyboard at once (before paint).
  const focusDetails = useRef(false);
  useLayoutEffect(() => {
    if (!withDetails || !focusDetails.current) return;
    focusDetails.current = false;
    detailsRef.current?.focus();
  }, [withDetails]);
  function openDetails() {
    focusDetails.current = true;
    setWithDetails(true);
  }
  function clear() {
    setDraft("");
    setDetails("");
    setWithDetails(false);
  }

  function keyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      add();
    } else if (e.key === "Escape") {
      if (draft || details) {
        // First Escape clears the draft; the next one leaves.
        e.preventDefault();
        e.stopPropagation();
        clear();
      } else if (onEscape) {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
      }
    }
  }

  const filled = Boolean(draft || details);
  return (
    <div
      className="r2-composer r2-rnotes-composer"
      data-filled={filled ? "" : undefined}
      data-details={withDetails || undefined}
      data-note-composer
    >
      <textarea
        className="r2-composer-input"
        placeholder={placeholder}
        aria-label={label}
        rows={1}
        value={draft}
        maxLength={REVISION_NOTE_MAX}
        disabled={!sync}
        autoFocus={autoFocus}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={keyDown}
      />
      {withDetails && items && (
        <textarea
          ref={detailsRef}
          className="r2-composer-input r2-composer-details"
          placeholder="Details — optional"
          aria-label={`Details — optional (${label})`}
          rows={1}
          value={details}
          maxLength={REVISION_NOTE_MAX}
          disabled={!sync}
          onChange={(e) => setDetails(e.target.value)}
          onKeyDown={keyDown}
        />
      )}
      {(hint || items) && (
        <div className="r2-composer-foot">
          {items && !withDetails && (
            <button type="button" className="r2-composer-tool" onClick={openDetails} disabled={!sync}>
              + Add details
            </button>
          )}
          {hint && (
            <span className="r2-composer-hint" aria-hidden>
              Return to add · Shift-Return for a new line
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function NoteItem({ note, label }: { note: ShownNote; label: string }) {
  const { sync, offline, items } = useRevisionNotes();
  const { index, openReading, select } = useRune2Selection();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const [details, setDetails] = useState(note.details ?? "");
  const [expanded, setExpanded] = useState(false);
  const draft = useRef({ body: note.body, details: note.details ?? "" });
  const editingRef = useRef(false);
  const rootRef = useRef<HTMLLIElement>(null);
  const waiting = note.pending === "conflict" || note.pending === "missing" || note.pending === "refused";
  const hasDetails = Boolean(note.details?.trim());
  // The passage, and whether its Scene has been edited since the note was made (the reader knows exactly).
  const anchor = note.anchor;
  const sceneEntry = anchor ? index.get(note.target_id) : undefined;
  const sceneEdited = Boolean(anchor && sceneEntry?.version !== undefined && sceneEntry.version !== anchor.scene_version);

  function begin() {
    if (!sync || waiting) return;
    draft.current = { body: note.body, details: note.details ?? "" };
    setText(note.body);
    setDetails(note.details ?? "");
    editingRef.current = true;
    setEditing(true);
  }
  function commit() {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    // Clearing a note's text deletes it; unchanged text and details write nothing.
    if (items) sync?.editItem(note.id, { body: draft.current.body, details: draft.current.details });
    else sync?.edit(note.id, draft.current.body);
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
  // Focus moving between the two fields is still editing; leaving them both saves.
  const onBlur = (e: FocusEvent) => {
    if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
    commit();
  };
  const fieldKeys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  /** Back to the passage: the reader at that Scene with the note open, or the Scene itself when it isn't read (Unplaced). */
  function goToPassage() {
    if (!sceneEntry) return;
    if (sceneEntry.kind === "scene") openReading({ kind: "manuscript" }, note.target_id, note.id);
    else select(note.target_id);
  }

  const flag =
    note.pending === "pending" && offline ? "Not saved yet" : note.pending === "unavailable" ? "Waiting to be saved" : null;
  return (
    <li
      ref={rootRef}
      className="r2-rnote"
      data-pending={note.pending ?? undefined}
      data-resolved={(items && note.resolved) || undefined}
      data-anchored={anchor ? "" : undefined}
      data-editing={editing || undefined}
    >
      {items && (
        <button
          type="button"
          role="checkbox"
          aria-checked={note.resolved}
          aria-label={note.resolved ? `Resolved — mark open (${label})` : `Mark resolved (${label})`}
          className="r2-rnote-check"
          disabled={waiting || !sync}
          onClick={() => sync?.setResolved(note.id, !note.resolved)}
        >
          {note.resolved && <Check {...ICON_SM_BOLD} aria-hidden />}
        </button>
      )}
      <div className="r2-rnote-main">
        {flag && <p className="r2-rnote-flag">{flag}</p>}
        {editing ? (
          <div className="r2-rnote-editor" onBlur={onBlur}>
            <textarea
              className="r2-rnote-edit"
              aria-label={`Edit revision note (${label})`}
              autoFocus
              value={text}
              maxLength={REVISION_NOTE_MAX}
              onChange={(e) => {
                draft.current.body = e.target.value;
                setText(e.target.value);
              }}
              onKeyDown={fieldKeys}
            />
            {items && (
              <textarea
                className="r2-rnote-edit r2-rnote-edit--details"
                aria-label={`Edit details (${label})`}
                placeholder="Details — optional"
                value={details}
                maxLength={REVISION_NOTE_MAX}
                onChange={(e) => {
                  draft.current.details = e.target.value;
                  setDetails(e.target.value);
                }}
                onKeyDown={fieldKeys}
              />
            )}
            <p className="r2-composer-hint r2-rnote-edit-hint" aria-hidden>
              Return to save · Shift-Return for a new line · Escape to cancel
            </p>
          </div>
        ) : (
          <button type="button" className="r2-rnote-body" onClick={begin} disabled={waiting} title="Edit note">
            {note.body}
          </button>
        )}
        {!editing && hasDetails && expanded && <p className="r2-rnote-details">{note.details}</p>}
        {!editing && anchor && (
          <div className="r2-rnote-anchor">
            <button
              type="button"
              className="r2-rnote-excerpt"
              onClick={goToPassage}
              disabled={!sceneEntry}
              title={sceneEntry?.kind === "scene" ? "Open this passage in Reading Mode" : sceneEntry ? "Open this scene" : undefined}
            >
              “{anchorExcerpt(anchor)}”
            </button>
            {sceneEdited && <span className="r2-rnote-anchor-note">Scene edited since</span>}
          </div>
        )}
      </div>
      {!editing && !waiting && (
        <span className="r2-rnote-actions">
          {hasDetails && (
            <Tooltip label={expanded ? "Hide details" : "Show details"}>
              <button
                type="button"
                className="r2-icon-button r2-icon-button--xs"
                aria-expanded={expanded}
                aria-label={expanded ? `Hide details (${label})` : `Show details (${label})`}
                data-always
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <ChevronDown {...ICON_SM} aria-hidden /> : <ChevronRight {...ICON_SM} aria-hidden />}
              </button>
            </Tooltip>
          )}
          <Tooltip label="Delete note">
            <button
              type="button"
              className="r2-icon-button r2-icon-button--xs"
              aria-label={`Delete note (${label})`}
              onClick={() => sync?.remove(note.id)}
            >
              <Trash2 {...ICON} aria-hidden />
            </button>
          </Tooltip>
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
