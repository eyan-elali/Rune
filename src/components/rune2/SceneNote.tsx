"use client";

import { useEffect, useRef, useState } from "react";
import { getSceneNote, saveSceneNote } from "@/lib/actions/sceneNotes";
import {
  noteBaseVersion,
  SCENE_NOTE_MAX,
  SCENE_NOTE_SAVED_EVENT,
  type SceneNoteSavedDetail,
  type SceneRevisionNote,
} from "@/lib/rune2/sceneNotes";

// A Scene's revision note (migration 038), in the Scene's Inspector — which
// is also where Reading Mode opens it, so a note can be written while reading
// without leaving the text. Plain text the writer leaves for the next pass,
// beside the Scene and never inside its prose: it is saved on its own
// (save_scene_revision_note), never through the Scene's save path, so it
// changes nothing about the Scene — not its version, its words, its history
// or the writer's writing record — and it follows the Scene wherever it moves.
//
// Saving is quiet: a moment after the writer stops typing, when the field
// loses focus, and when the Inspector moves to another Scene. Each save says
// which version of the note it replaces; if the note changed elsewhere in
// the meantime, nothing is overwritten and the writer chooses. A save that
// fails keeps the text in the field, says so, and is retried by the next
// change or by "Try again".

type Status = "idle" | "saving" | "saved" | "error" | "conflict";

const SAVE_AFTER_MS = 900;

export function SceneNoteSection({ sceneId, onFocus }: { sceneId: string; onFocus?: () => void }) {
  // undefined: not read yet.
  const [note, setNote] = useState<SceneRevisionNote | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [theirs, setTheirs] = useState<SceneRevisionNote | null>(null);

  // The latest text and stored note, for saves that outlive a render.
  const textRef = useRef("");
  const noteRef = useRef<SceneRevisionNote | null>(null);
  const loaded = useRef(false);
  const saving = useRef(false);
  const again = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let live = true;
    void getSceneNote(sceneId)
      .then((r) => {
        if (!live) return;
        if (r.error !== null) {
          setLoadFailed(true);
          return;
        }
        loaded.current = true;
        noteRef.current = r.data;
        textRef.current = r.data?.body ?? "";
        setNote(r.data);
        setText(r.data?.body ?? "");
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [sceneId]);

  // Another surface saved this Scene's note (a second Inspector is never
  // open, but Reading Mode's marks and this field share the event).
  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<SceneNoteSavedDetail>).detail;
      if (!detail || detail.sceneId !== sceneId) return;
      if ((detail.note?.version ?? 0) <= noteBaseVersion(noteRef.current)) return;
      // Only take it over when nothing here is waiting to be saved.
      if (textRef.current !== (noteRef.current?.body ?? "")) return;
      noteRef.current = detail.note;
      textRef.current = detail.note?.body ?? "";
      setNote(detail.note);
      setText(detail.note?.body ?? "");
    };
    window.addEventListener(SCENE_NOTE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(SCENE_NOTE_SAVED_EVENT, onSaved);
  }, [sceneId]);

  async function save(force = false): Promise<void> {
    if (!loaded.current || (blocked.current && !force)) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const body = textRef.current;
    if (!force && body === (noteRef.current?.body ?? "")) return;
    if (saving.current) {
      again.current = true;
      return;
    }
    saving.current = true;
    if (mounted.current) setStatus("saving");
    try {
      const r = await saveSceneNote(sceneId, body, force ? null : noteBaseVersion(noteRef.current));
      if (r.status === "ok") {
        noteRef.current = r.note;
        blocked.current = false;
        window.dispatchEvent(
          new CustomEvent<SceneNoteSavedDetail>(SCENE_NOTE_SAVED_EVENT, { detail: { sceneId, note: r.note } }),
        );
        if (mounted.current) {
          setNote(r.note);
          setTheirs(null);
          setStatus(textRef.current === (r.note?.body ?? "") ? "saved" : "idle");
        }
      } else if (r.status === "conflict") {
        // Never overwrite a newer note unseen: stop, and let the writer choose.
        blocked.current = true;
        again.current = false;
        if (mounted.current) {
          setTheirs(r.note);
          setStatus("conflict");
        }
      } else if (mounted.current) {
        setStatus("error");
      }
    } catch {
      if (mounted.current) setStatus("error");
    } finally {
      saving.current = false;
      if (again.current) {
        again.current = false;
        void saveRef.current();
      }
    }
  }
  // The latest save, for timers and for leaving.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // Leaving (another Scene, or the Inspector closing): the last words are saved.
  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (loaded.current && !blocked.current && textRef.current !== (noteRef.current?.body ?? "")) {
        void saveRef.current();
      }
    },
    [],
  );

  function change(next: string) {
    textRef.current = next;
    setText(next);
    if (status === "saved" || status === "error") setStatus("idle");
    if (blocked.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), SAVE_AFTER_MS);
  }

  function takeTheirs() {
    blocked.current = false;
    noteRef.current = theirs;
    textRef.current = theirs?.body ?? "";
    setNote(theirs);
    setText(theirs?.body ?? "");
    setTheirs(null);
    setStatus("idle");
  }

  const statusText =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Not saved yet." : null;

  return (
    <section className="r2-scene-note" aria-labelledby={`r2-scene-note-${sceneId}`} data-scene-note={sceneId}>
      <div className="r2-scene-note-head">
        <h3 id={`r2-scene-note-${sceneId}`} className="r2-links-head">
          Revision note
        </h3>
        {statusText && (
          <span role="status" className="r2-scene-note-status" data-tone={status === "error" ? "alert" : undefined}>
            {statusText}
            {status === "error" && (
              <button type="button" className="r2-panel-link" onClick={() => void save()}>
                Try again
              </button>
            )}
          </span>
        )}
      </div>
      {note === undefined ? (
        <p className="r2-panel-empty">{loadFailed ? "This note couldn’t be loaded." : "Loading…"}</p>
      ) : (
        <textarea
          className="r2-scene-note-input"
          aria-labelledby={`r2-scene-note-${sceneId}`}
          aria-describedby={`r2-scene-note-hint-${sceneId}`}
          placeholder="What to look at in this scene next time…"
          rows={3}
          value={text}
          maxLength={SCENE_NOTE_MAX}
          spellCheck
          onFocus={onFocus}
          onChange={(e) => change(e.target.value)}
          onBlur={() => void save()}
        />
      )}
      <p id={`r2-scene-note-hint-${sceneId}`} className="r2-scene-note-hint">
        Kept with this scene wherever it moves. Never part of the manuscript.
      </p>
      {status === "conflict" && (
        <div role="alert" className="r2-scene-note-conflict">
          <p>This note was changed somewhere else while you were writing.</p>
          {theirs && <p className="r2-scene-note-theirs">{theirs.body}</p>}
          <div className="r2-scene-note-actions">
            <button type="button" className="r2-button" onClick={takeTheirs}>
              {theirs ? "Use that version" : "Start again"}
            </button>
            <button type="button" className="r2-button" onClick={() => void save(true)}>
              Keep mine
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Moves focus into a Scene's note once the Inspector shows it (it may still be opening). */
export function focusSceneNote(sceneId: string, tries = 20) {
  requestAnimationFrame(() => {
    const field = document.querySelector<HTMLTextAreaElement>(`[data-scene-note="${CSS.escape(sceneId)}"] textarea`);
    if (field) {
      field.focus({ preventScroll: false });
      field.setSelectionRange(field.value.length, field.value.length);
    } else if (tries > 0) {
      focusSceneNote(sceneId, tries - 1);
    }
  });
}
