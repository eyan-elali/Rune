import type { TrashItem, TrashObjectType } from "@/lib/types";
import { sceneIsNamed, UNTITLED, type NavEntry, type NavKind } from "./navigatorModel";

// How the Project's Trash (migrations 030–031) is worded: what can go there, where
// an item came from, how long ago, and exactly what a permanent deletion
// loses. Pure — shared by the Trash overlay and the tests. Titles and counts
// only, never content.

const TYPE_OF: Partial<Record<NavKind, TrashObjectType>> = {
  workspacePage: "page",
  workspaceFolder: "folder",
  workspaceCollection: "collection",
  collectionEntry: "entry",
  scene: "scene",
  unplacedScene: "scene",
};

/** The Trash type of an index entry, or null if it can't go to Trash (a Chapter or Group: no Trash yet). */
export function trashTypeOf(entry: Pick<NavEntry, "kind">): TrashObjectType | null {
  return TYPE_OF[entry.kind] ?? null;
}

export const TRASH_NOUN: Record<TrashObjectType, string> = {
  page: "Page",
  folder: "Folder",
  collection: "Collection",
  entry: "Entry",
  scene: "Scene",
};

const FALLBACK: Record<TrashObjectType, string> = {
  page: UNTITLED.page,
  folder: UNTITLED.folder,
  collection: UNTITLED.collection,
  entry: UNTITLED.entry,
  scene: UNTITLED.scene,
};

/** An item's title, or its kind's "Untitled …" (a Scene's stored placeholder title reads as untitled too). */
export const trashItemTitle = (item: Pick<TrashItem, "title" | "type">) =>
  item.type === "scene" && !sceneIsNamed(item.title) ? UNTITLED.scene : item.title?.trim() || FALLBACK[item.type];
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", or the date. */
export function trashedWhen(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  if (hours < 48) return "yesterday";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Where an item came from, in a few quiet words. */
export function trashContext(item: TrashItem): string {
  switch (item.type) {
    case "entry":
      return item.collection_active
        ? `in ${item.collection_title?.trim() || UNTITLED.collection}`
        : `in ${item.collection_title?.trim() || UNTITLED.collection}, which is in Trash`;
    case "collection":
      return plural(item.entries ?? 0, "entry", "entries");
    case "scene":
      if (!item.from_chapter_id) return "from Unplaced Scenes";
      return item.from_chapter_active
        ? `from ${item.from_chapter_title?.trim() || UNTITLED.chapter}`
        : "from a chapter that is gone";
    default:
      if (!item.from_folder_id) return "from the Workspace";
      return item.from_folder_active
        ? `from ${item.from_folder_title?.trim() || UNTITLED.folder}`
        : "from a folder that is gone";
  }
}

/** The confirmation for a permanent deletion — what exactly will be lost. */
export function deletionWarning(item: TrashItem): string {
  const title = trashItemTitle(item);
  switch (item.type) {
    case "page":
      return `Delete “${title}” permanently? Its writing can’t be recovered.`;
    case "entry":
      return `Delete “${title}” permanently? Its writing and property values can’t be recovered.`;
    case "folder":
      return `Delete the folder “${title}” permanently?`;
    case "scene":
      return `Delete “${title}” permanently? Its prose and scene properties can’t be recovered. Your writing history is kept.`;
    case "collection": {
      const entries = item.entries ?? 0;
      const lead =
        entries === 0
          ? `Delete “${title}” permanently? Its properties and views can’t be recovered.`
          : `Delete “${title}” and its ${plural(entries, "entry", "entries")} permanently? Their writing, values and views can’t be recovered.`;
      const props = item.properties ?? 0;
      return props === 0
        ? lead
        : `${lead} ${props === 1 ? "A relationship" : `${props} relationships`} elsewhere that ${
            props === 1 ? "points" : "point"
          } here will be removed too.`;
    }
  }
}
