"use server";

import { createClient } from "@/lib/supabase/server";
import type { CollectionProperty, CollectionPropertyType, PropertyOption, PropertyValue } from "@/lib/types";

// Collection properties and Entry values (migration 026). A Collection
// defines its properties once; each of its Entries may hold a value for each.
// Every write is one SECURITY DEFINER function that checks ownership and
// validates against the property's type and options — clients can only read
// the tables — so nothing here can attach a value to another Collection's
// property, or another writer's Entry.
//
// Removing a property deletes its values. The caller must say how many values
// that is (what the writer was shown and confirmed); if it has changed, nothing
// is deleted and the current number comes back to confirm again.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Adds a property at the end of a Collection's properties. */
export async function createCollectionProperty(
  collectionId: string,
  name: string,
  type: CollectionPropertyType
): Promise<ActionResult<CollectionProperty>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_workspace_collection_property", {
    p_collection_id: collectionId,
    p_name: name,
    p_type: type,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ property: CollectionProperty }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.property, error: null };
}

/**
 * What can change about a property. `options`: the whole list in its new
 * order — an existing option keeps its `id`, a new one has none. An option
 * left out is removed, and the values that chose it are cleared.
 */
export type CollectionPropertyChanges = {
  name?: string;
  type?: CollectionPropertyType;
  options?: (Pick<PropertyOption, "name"> & { id?: string })[];
  shown_in_list?: boolean;
};

/** Changes a property. `cleared`: how many Entries lost a value (removed options). */
export async function updateCollectionProperty(
  propertyId: string,
  changes: CollectionPropertyChanges
): Promise<ActionResult<{ property: CollectionProperty; cleared: number }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("update_workspace_collection_property", {
    p_property_id: propertyId,
    p_changes: changes,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ property: CollectionProperty; cleared: number }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { property: result.property, cleared: result.cleared }, error: null };
}

/** Moves a property to `index` (0-based) among its Collection's properties. */
export async function moveCollectionProperty(
  propertyId: string,
  index: number
): Promise<ActionResult<CollectionProperty>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("move_workspace_collection_property", {
    p_property_id: propertyId,
    p_index: index,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ property: CollectionProperty }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.property, error: null };
}

export type DeleteCollectionPropertyResult =
  | { status: "deleted"; deletedValues: number }
  /** The property now has `values` values, not the number confirmed: nothing was deleted. */
  | { status: "confirm"; values: number }
  | { status: "error"; error: string };

/** Removes a property and its `expectedValues` values — only if that is still how many there are. */
export async function deleteCollectionProperty(
  propertyId: string,
  expectedValues: number
): Promise<DeleteCollectionPropertyResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };

  const { data, error } = await supabase.rpc("delete_workspace_collection_property", {
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

/** Sets one Entry's value for one of its Collection's properties; null (or "", [], false) clears it. */
export async function setEntryPropertyValue(
  entryId: string,
  propertyId: string,
  value: PropertyValue | null
): Promise<ActionResult<{ value: PropertyValue | null }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("set_workspace_entry_value", {
    p_entry_id: entryId,
    p_property_id: propertyId,
    p_value: value,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ value: PropertyValue | null }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { value: result.value }, error: null };
}
