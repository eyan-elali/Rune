"use server";

import { createClient } from "@/lib/supabase/server";
import { isNoteAnchor, type NoteAnchor } from "@/lib/rune2/noteAnchors";
import { REVISION_NOTE_MAX, type NoteItemFields, type NoteTargetType, type RevisionNote } from "@/lib/rune2/revisionNotes";

// Revision Notes (migration 039). Reads go through RLS: the owner's notes of
// active Chapters and Scenes only (a trashed target's notes are hidden until
// it is restored). Writes go through create/update/delete_revision_note:
// owner-checked, the target must be active, and none of them ever writes a
// Scene or Chapter — so a note never changes a Scene's version, word count,
// history, writing sessions or the manuscript total. Nothing here reads or
// returns prose, and note text is never logged.
//
// Items (migration 043): a create or update given `item` fields (details,
// resolved, a create's anchor) goes through create/update_revision_note_item,
// which write them; given null (a database before 043, or a caller that
// doesn't know items) the 039/040 functions write the text alone. The list
// returns the item fields when the database has them.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

const COLUMNS = "id, project_id, target_type, target_id, body, version, created_at, updated_at";
const ITEM_COLUMNS = `${COLUMNS}, details, resolved_at, anchor`;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Every note of the Project's active Chapters and Scenes (placed or Unplaced), any order. */
export async function listRevisionNotes(projectId: string): Promise<ActionResult<RevisionNote[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };
  // With items (043) their fields come too; before 043 that read fails on
  // the missing columns, and the plain columns are read instead.
  const withItems = await supabase.from("revision_notes").select(ITEM_COLUMNS).eq("project_id", projectId);
  if (!withItems.error) return { data: (withItems.data ?? []) as RevisionNote[], error: null };
  const { data, error } = await supabase.from("revision_notes").select(COLUMNS).eq("project_id", projectId);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as RevisionNote[], error: null };
}

export type NoteWriteResult =
  /** Written (`note` null: deleted, or already gone). */
  | { status: "ok"; note: RevisionNote | null }
  /** The note changed since the version the write was based on; nothing was written. `note`: what is stored now. */
  | { status: "conflict"; note: RevisionNote }
  /** An edit of a note that no longer exists (deleted elsewhere). */
  | { status: "missing" }
  /** The note's Chapter or Scene is in Trash or gone: nothing can be written to it now. */
  | { status: "unavailable" }
  | { status: "error"; error: string };

function toResult(data: unknown, error: { message: string } | null): NoteWriteResult {
  if (error) return { status: "error", error: error.message };
  const r = data as { status: string; note?: RevisionNote | null; error?: string };
  switch (r.status) {
    case "ok":
      return { status: "ok", note: r.note ?? null };
    case "conflict":
      return { status: "conflict", note: r.note as RevisionNote };
    case "missing":
    case "unavailable":
      return { status: r.status };
    default:
      return { status: "error", error: r.error ?? "error" };
  }
}

/**
 * Creates a note on the Manuscript, a Group, a Chapter or a Scene. `id` is
 * chosen by the client, so a retry of a create that already landed answers
 * with the same note — never a second one. With `item`, its details and
 * anchor are written too (043); an anchor is accepted on a Scene note only.
 */
export async function createRevisionNote(
  id: string,
  targetType: NoteTargetType,
  targetId: string,
  body: string,
  item: (NoteItemFields & { anchor: NoteAnchor | null }) | null = null,
): Promise<NoteWriteResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };
  if (body.length > REVISION_NOTE_MAX) return { status: "error", error: "too_long" };
  if (item) {
    if ((item.details?.length ?? 0) > REVISION_NOTE_MAX) return { status: "error", error: "too_long" };
    if (item.anchor !== null && (!isNoteAnchor(item.anchor) || targetType !== "scene")) {
      return { status: "error", error: "invalid" };
    }
    const { data, error } = await supabase.rpc("create_revision_note_item", {
      p_note_id: id,
      p_target_type: targetType,
      p_target_id: targetId,
      p_body: body,
      p_details: item.details,
      p_resolved: item.resolved,
      p_anchor: item.anchor,
    });
    return toResult(data, error);
  }
  const { data, error } = await supabase.rpc("create_revision_note", {
    p_note_id: id,
    p_target_type: targetType,
    p_target_id: targetId,
    p_body: body,
  });
  return toResult(data, error);
}

/**
 * Edits a note's text — and with `item`, its details and resolved state
 * (043). `baseVersion`: the version the edit was based on; null writes
 * regardless ("keep mine").
 */
export async function updateRevisionNote(
  id: string,
  body: string,
  baseVersion: number | null,
  item: NoteItemFields | null = null,
): Promise<NoteWriteResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };
  if (body.length > REVISION_NOTE_MAX) return { status: "error", error: "too_long" };
  if (item) {
    if ((item.details?.length ?? 0) > REVISION_NOTE_MAX) return { status: "error", error: "too_long" };
    const { data, error } = await supabase.rpc("update_revision_note_item", {
      p_note_id: id,
      p_body: body,
      p_details: item.details,
      p_resolved: item.resolved,
      p_base_version: baseVersion,
    });
    return toResult(data, error);
  }
  const { data, error } = await supabase.rpc("update_revision_note", {
    p_note_id: id,
    p_body: body,
    p_base_version: baseVersion,
  });
  return toResult(data, error);
}

/** Deletes one note. A note changed since `baseVersion` is a conflict (null deletes regardless). */
export async function deleteRevisionNote(id: string, baseVersion: number | null): Promise<NoteWriteResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };
  const { data, error } = await supabase.rpc("delete_revision_note", {
    p_note_id: id,
    p_base_version: baseVersion,
  });
  return toResult(data, error);
}
