"use server";

import { createClient } from "@/lib/supabase/server";
import { getManuscriptIdForProject } from "@/lib/manuscriptQueries";
import {
  milestoneName,
  type MilestoneSnapshot,
  type MilestoneSummary,
  type ObjectMilestone,
} from "@/lib/rune2/history";

// Named Manuscript Milestones (migration 036): the whole manuscript — Groups,
// Chapters, placed and Unplaced Scenes, their order and prose — captured by
// name, in one transaction, and kept read-only. A Milestone is never a
// branch and never restored wholesale; creating one changes no live row and
// no writing history. Workspace content is never part of it.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<T>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result, error: null };
}

async function manuscriptOf(projectId: string): Promise<string | null> {
  const { supabase } = await getUser();
  return getManuscriptIdForProject(supabase, projectId);
}

/** The Project's Milestones, newest first: names, times and totals. */
export async function listManuscriptMilestones(projectId: string): Promise<ActionResult<MilestoneSummary[]>> {
  const manuscriptId = await manuscriptOf(projectId);
  if (!manuscriptId) return { data: null, error: "Manuscript not found" };
  const r = await call<{ milestones: MilestoneSummary[] }>("list_manuscript_milestones", { p_manuscript_id: manuscriptId });
  return r.error !== null ? r : { data: r.data.milestones, error: null };
}

/** Names the manuscript as it is now. */
export async function createManuscriptMilestone(projectId: string, name: string): Promise<ActionResult<{ id: string }>> {
  const checked = milestoneName(name);
  if (checked.error !== null) return { data: null, error: checked.error };
  const manuscriptId = await manuscriptOf(projectId);
  if (!manuscriptId) return { data: null, error: "Manuscript not found" };
  const r = await call<{ id: string }>("create_manuscript_milestone", { p_manuscript_id: manuscriptId, p_name: checked.name });
  return r.error !== null ? r : { data: { id: r.data.id }, error: null };
}

/** One Milestone, whole, for the read-only view. */
export async function getManuscriptMilestone(milestoneId: string): Promise<ActionResult<MilestoneSnapshot>> {
  const r = await call<MilestoneSnapshot>("get_manuscript_milestone", { p_milestone_id: milestoneId });
  return r.error !== null ? r : { data: { milestone: r.data.milestone, scenes: r.data.scenes }, error: null };
}

/**
 * The named Milestones that hold this Scene or Chapter, newest first, with
 * where it stood in each (list_object_milestones, migration 037). Read-only.
 */
export async function listObjectMilestones(
  type: "scene" | "chapter",
  id: string
): Promise<ActionResult<ObjectMilestone[]>> {
  const r = await call<{ milestones: ObjectMilestone[] }>("list_object_milestones", { p_type: type, p_id: id });
  return r.error !== null ? r : { data: r.data.milestones, error: null };
}

/** Deletes one named Milestone. The live manuscript is untouched. */
export async function deleteManuscriptMilestone(milestoneId: string): Promise<ActionResult<null>> {
  const r = await call<object>("delete_manuscript_milestone", { p_milestone_id: milestoneId });
  return r.error !== null ? r : { data: null, error: null };
}
