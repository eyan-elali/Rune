// Unsent text in a Revision Notes add field — the note the writer is typing
// but hasn't saved with Return yet — kept on this device per writer, Project
// and target, so moving to another Scene, closing the panel or reloading
// never loses it. Temporary UI recovery only (never the note itself: a saved
// note lives in revision_notes, and an unsaved one in the sync engine's
// device store). Every access is guarded: without storage the field simply
// starts empty. Note text is never logged.

const PREFIX = "rune:note-draft:";

function storageKey(userId: string, projectId: string, target: string) {
  return `${PREFIX}${userId}:${projectId}:${target}`;
}

export function readNoteDraft(userId: string | undefined, projectId: string, target: string): string {
  if (!userId) return "";
  try {
    return window.localStorage.getItem(storageKey(userId, projectId, target)) ?? "";
  } catch {
    return "";
  }
}

/** Keeps (or, for empty text, forgets) the unsent text of one add field. */
export function writeNoteDraft(userId: string | undefined, projectId: string, target: string, text: string): void {
  if (!userId) return;
  try {
    const k = storageKey(userId, projectId, target);
    if (text) window.localStorage.setItem(k, text);
    else window.localStorage.removeItem(k);
  } catch {
    // Storage unavailable: the draft lives only in the field.
  }
}
