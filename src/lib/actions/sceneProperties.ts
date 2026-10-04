"use server";

import { createClient } from "@/lib/supabase/server";
import type { PropertyOption, PropertyValue, ReferenceObjectType, SceneProperty, CollectionPropertyType } from "@/lib/types";

// Scene properties and Scene values (migration 032). A Manuscript defines its
// Scene properties once; each of its Scenes may hold a value for each — beside
// its prose, never in it. Every write is one SECURITY DEFINER function that
// checks ownership and validates against the property's type, options and
// target — clients can only read the tables — so nothing here can attach a
// value to another Manuscript's property, or another writer's Scene.
//
// None of these touches a Scene's row: its content, words, version and
// placement are exactly as they were, so a property change never races the
// prose save path (save_scene_checked) or the offline queue. A Relationship
// value is a set of references (object_references), read back as backlinks
// on the objects it points to.
//
// Removing a property deletes its values. The caller must say how many Scenes
// hold one (what the writer was shown and confirmed); if it has changed,
// nothing is deleted and the current number comes back to confirm again.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Adds a Scene property at the end of the Project's Manuscript's Scene properties. */
export async function createSceneProperty(
  projectId: string,
  name: string,
  type: CollectionPropertyType
): Promise<ActionResult<SceneProperty>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_scene_property", {
    p_project_id: projectId,
    p_name: name,
    p_type: type,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ property: SceneProperty }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.property, error: null };
}

/**
 * Adds a Relationship Scene property: pointing to Entries of
 * `targetCollectionId` (target "entry"), to Pages, or to Scenes; one or several.
 */
export async function createSceneRelationshipProperty(
  projectId: string,
  name: string,
  target: ReferenceObjectType,
  targetCollectionId: string | null,
  many: boolean
): Promise<ActionResult<SceneProperty>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_scene_relationship_property", {
    p_project_id: projectId,
    p_name: name,
    p_target: target,
    p_target_collection_id: target === "entry" ? targetCollectionId : null,
    p_many: many,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ property: SceneProperty }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.property, error: null };
}

/**
 * What can change about a Scene property: as a Collection property (name, a
 * lossless type change, the whole list of options — an option left out is
 * removed and cleared from the Scenes that chose it), and for a Relationship,
 * how many a Scene may hold and what it points to (only while none holds one).
 */
export type ScenePropertyChanges = {
  name?: string;
  type?: CollectionPropertyType;
  options?: (Pick<PropertyOption, "name"> & { id?: string })[];
  many?: boolean;
  target?: ReferenceObjectType;
  target_collection_id?: string;
};

/** Changes a Scene property. `cleared`: how many Scenes lost a value (removed options). */
export async function updateSceneProperty(
  propertyId: string,
  changes: ScenePropertyChanges
): Promise<ActionResult<{ property: SceneProperty; cleared: number }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("update_scene_property", {
    p_property_id: propertyId,
    p_changes: changes,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ property: SceneProperty; cleared: number }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { property: result.property, cleared: result.cleared }, error: null };
}

/** Moves a Scene property to `index` (0-based) among the Manuscript's. */
export async function moveSceneProperty(propertyId: string, index: number): Promise<ActionResult<SceneProperty>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("move_scene_property", {
    p_property_id: propertyId,
    p_index: index,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ property: SceneProperty }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.property, error: null };
}

export type DeleteScenePropertyResult =
  | { status: "deleted"; deletedValues: number }
  /** `values` Scenes now hold a value, not the number confirmed: nothing was deleted. */
  | { status: "confirm"; values: number }
  | { status: "error"; error: string };

/** Removes a Scene property and its values — only if `expectedValues` Scenes still hold one. Never a Scene. */
export async function deleteSceneProperty(propertyId: string, expectedValues: number): Promise<DeleteScenePropertyResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };

  const { data, error } = await supabase.rpc("delete_scene_property", {
    p_property_id: propertyId,
    p_expected_values: expectedValues,
  });
  if (error) return { status: "error", error: error.message };
  const result = data as
    | { status: "ok"; deleted_values: number }
    | { status: "confirm"; values: number }
    | { status: "error"; error: string };
  if (result.status === "ok") return { status: "deleted", deletedValues: result.deleted_values };
  return result;
}

/** Sets one Scene's value for one of its Manuscript's properties; null (or "", [], false) clears it. */
export async function setScenePropertyValue(
  sceneId: string,
  propertyId: string,
  value: PropertyValue | null
): Promise<ActionResult<{ value: PropertyValue | null }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("set_scene_property_value", {
    p_scene_id: sceneId,
    p_property_id: propertyId,
    p_value: value,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ value: PropertyValue | null }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { value: result.value }, error: null };
}

/** Sets one Scene's whole value for a Relationship: its targets' ids, in order. [] clears it. */
export async function setSceneRelationship(
  sceneId: string,
  propertyId: string,
  targetIds: string[]
): Promise<ActionResult<{ targets: string[] }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("set_scene_relationship", {
    p_scene_id: sceneId,
    p_property_id: propertyId,
    p_target_ids: targetIds,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ targets: string[] }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { targets: result.targets }, error: null };
}
