"use server";

import { createClient } from "@/lib/supabase/server";
import type { CollectionProperty, ObjectReferenceRow, ReferenceObjectType } from "@/lib/types";

// References between creative objects (migration 028): Relationship
// properties, their values, and generic references from one Entry, Page or
// Scene to another. Every end is a canonical id — a title is never sent or
// stored — so renaming either object changes nothing here. Every write is one
// SECURITY DEFINER function that checks ownership, keeps both ends in one
// Project, and checks a Relationship value against what its property allows;
// clients can only read object_references. Removing a reference never removes
// either object. Backlinks are read from the same rows, by target — nothing
// here writes one.
//
// A reference from or to a Scene is metadata beside the manuscript: none of
// these touches a Scene's row, content, version or words.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Adds a Relationship property at the end of a Collection's properties:
 * pointing to Entries of `targetCollectionId` (target "entry" — the
 * Collection itself included), to Pages, or to Scenes; one value or several.
 */
export async function createRelationshipProperty(
  collectionId: string,
  name: string,
  target: ReferenceObjectType,
  targetCollectionId: string | null,
  many: boolean
): Promise<ActionResult<CollectionProperty>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_workspace_relationship_property", {
    p_collection_id: collectionId,
    p_name: name,
    p_target: target,
    p_target_collection_id: target === "entry" ? targetCollectionId : null,
    p_many: many,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ property: CollectionProperty }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.property, error: null };
}

/**
 * What can change about a Relationship beyond its name and place: how many
 * values an Entry may hold (not "one" while some hold several), and what it
 * points to (only while no Entry holds a value).
 */
export type RelationshipPropertyChanges = {
  many?: boolean;
  target?: ReferenceObjectType;
  target_collection_id?: string;
};

export async function updateRelationshipProperty(
  propertyId: string,
  changes: RelationshipPropertyChanges
): Promise<ActionResult<CollectionProperty>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("update_workspace_relationship_property", {
    p_property_id: propertyId,
    p_changes: changes,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ property: CollectionProperty }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.property, error: null };
}

/** Sets one Entry's whole value for a Relationship: its targets' ids, in order. [] clears it. */
export async function setEntryRelationship(
  entryId: string,
  propertyId: string,
  targetIds: string[]
): Promise<ActionResult<{ targets: string[] }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("set_workspace_entry_relationship", {
    p_entry_id: entryId,
    p_property_id: propertyId,
    p_target_ids: targetIds,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ targets: string[] }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { targets: result.targets }, error: null };
}

/** Links one object to another of the same Project (a generic reference). Already linked: the same reference. */
export async function addObjectReference(
  sourceType: ReferenceObjectType,
  sourceId: string,
  targetType: ReferenceObjectType,
  targetId: string
): Promise<ActionResult<ObjectReferenceRow>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("add_object_reference", {
    p_source_type: sourceType,
    p_source_id: sourceId,
    p_target_type: targetType,
    p_target_id: targetId,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ reference: ObjectReferenceRow }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.reference, error: null };
}

/** Removes a generic reference. Neither object is touched. */
export async function removeObjectReference(referenceId: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("remove_object_reference", { p_reference_id: referenceId });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<object>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: null, error: null };
}
