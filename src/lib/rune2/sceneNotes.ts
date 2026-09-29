// Scene revision notes (migration 038): one plain-text note per Scene, beside
// its prose and never in it. Anchored by the Scene's canonical id, so a note
// follows its Scene through every move and through Trash; written only
// through save_scene_revision_note, which never touches the Scene row, so a
// note never changes the Scene's version, words, history or writing credit.
// Pure — shared by the actions, the Inspector, Reading Mode and the tests.

export type SceneRevisionNote = {
  scene_id: string;
  body: string;
  /** Bumped by every save; the client sends the one it last saw. */
  version: number;
  updated_at: string;
};

/** The longest note the database accepts (scene_revision_notes_body_check). */
export const SCENE_NOTE_MAX = 20_000;

/** A blank note is no note: saving one removes it. */
export function noteIsBlank(body: string | null | undefined): boolean {
  return (body ?? "").trim() === "";
}

/**
 * The version a save of this note is checked against: the note's version, or
 * 0 for "there is no note yet".
 */
export function noteBaseVersion(note: Pick<SceneRevisionNote, "version"> | null): number {
  return note?.version ?? 0;
}

/**
 * Tells every surface showing a Scene's note — the Inspector, Reading Mode's
 * margin marks — that it changed (detail: the Scene id and the note, or null
 * when it was removed). A window event, like SCENE_RESTORED_EVENT, so the
 * surfaces need no shared store.
 */
export const SCENE_NOTE_SAVED_EVENT = "rune:scene-note-saved";

export type SceneNoteSavedDetail = { sceneId: string; note: SceneRevisionNote | null };

/** A note's first line, shortened — how a margin mark or a list names it. */
export function noteExcerpt(body: string, max = 80): string {
  const line = body.trim().split(/\n+/)[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
