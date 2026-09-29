import type { PricingCohort } from "./pricing";

export interface UserPreferences {
  fontSize: number;
  lineHeight: number;
  autoSaveDelay: number;
  wideEditor: boolean;
  activeTheme: string;
  activeAvatar: string;
  activeFont: string;
  has_completed_editor_tutorial?: boolean;
  has_seen_guides_update_notice?: boolean;
  hideArena?: boolean;
}

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  preferences: Record<string, unknown> | null;
  created_at: string;
  stripe_customer_id: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
  subscription_price_id: string | null;
  subscription_period_end: string | null;
  has_written_first_words: boolean;
  is_admin: boolean;
}

export interface XpEvent {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  source_session_id: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_color: string | null;
  word_count: number;
  chapter_goal?: number | null;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
}

/** Exactly one per Project, created with it by the database. Holds no prose. */
export interface Manuscript {
  id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * A structural container in a Manuscript ("Part I", "Book Two", "Act I"): one
 * type for all of them. Contains Chapters and other Groups, never prose or
 * Scenes. parent_group_id null = directly under the Manuscript. position
 * orders it among its parent's children, Groups and Chapters together.
 */
export interface ManuscriptGroup {
  id: string;
  manuscript_id: string;
  parent_group_id: string | null;
  /** null = untitled. */
  title: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

/**
 * A Workspace Page (Rune 2.0, migration 023): a freeform supporting document
 * that belongs to one Project. Not a Scene and not manuscript prose — it never
 * counts toward any word total. Stored in `workspace_documents`, never `pages`.
 */
export interface WorkspacePage {
  id: string;
  project_id: string;
  /** null = untitled. */
  title: string | null;
  /** TipTap JSON. */
  content: Record<string, unknown>;
  /** Bumped by the database on every content change (never by a rename). */
  version: number;
  created_at: string;
  updated_at: string;
}

/** A Workspace Page without its content — what the navigator lists. */
export type WorkspacePageSummary = Pick<WorkspacePage, "id" | "title" | "created_at" | "updated_at">;

/** A Workspace Folder (migration 024): organisational only, no content. Belongs to its Project. */
export interface WorkspaceFolder {
  id: string;
  project_id: string;
  /** null = untitled. */
  title: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkspaceFolderSummary = Pick<WorkspaceFolder, "id" | "title">;

/**
 * A Workspace Collection (migration 025): many Entries of one writer-defined
 * kind ("Characters", "Research"). Belongs to its Project and owns its
 * Entries; Rune gives no Collection a built-in meaning.
 */
export interface WorkspaceCollection {
  id: string;
  project_id: string;
  /** null = untitled. */
  title: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkspaceCollectionSummary = Pick<WorkspaceCollection, "id" | "title">;

/**
 * One Entry of a Collection (migration 025, table workspace_collection_entries):
 * a title and freeform rich text. Belongs to exactly one Collection for life.
 * Not manuscript prose — never counted toward any word total.
 */
export interface CollectionEntry {
  id: string;
  collection_id: string;
  project_id: string;
  /** null = untitled. */
  title: string | null;
  /** TipTap JSON. */
  content: Record<string, unknown>;
  /** Bumped by the database on every content change (never by a rename). */
  version: number;
  created_at: string;
  updated_at: string;
}

/** An Entry without its content — what its Collection lists. */
export type CollectionEntrySummary = Pick<CollectionEntry, "id" | "collection_id" | "title" | "created_at" | "updated_at">;

/** A Collection property's type (migration 026; relationship from 028). */
export type CollectionPropertyType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "checkbox"
  | "relationship";

/**
 * The kinds of object a reference joins (migration 028): a Collection Entry,
 * a Workspace Page, or a manuscript Scene.
 */
export type ReferenceObjectType = "entry" | "page" | "scene";

/** One choice of a select, multi-select or status property. Values refer to it by id. */
export interface PropertyOption {
  id: string;
  name: string;
}

/**
 * One property definition of a Collection (migration 026, table
 * workspace_collection_properties). The Collection defines it once; each Entry
 * may hold a value for it. Never on Pages; Scenes have their own
 * (SceneProperty, migration 032).
 */
export interface CollectionProperty {
  id: string;
  collection_id: string;
  project_id: string;
  name: string;
  type: CollectionPropertyType;
  /** Choice types only, in display order; [] otherwise. */
  options: PropertyOption[];
  /** 1..n within the Collection. */
  position: number;
  /**
   * Whether the Collection's list showed this property's values (026). Kept
   * for the previous app; from migration 027 each View's config decides.
   */
  shown_in_list: boolean;
  /**
   * A Relationship's target (migration 028): Entries of one Collection
   * (relation_collection_id), Pages, or Scenes. null for every other type —
   * and on a read before 028.
   */
  relation_target: ReferenceObjectType | null;
  relation_collection_id: string | null;
  /** Whether an Entry may hold several targets (Relationship only). */
  relation_many: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * One Scene property of a Manuscript (migration 032, table
 * scene_property_definitions): the same shape and rules as a Collection
 * property, owned by the Manuscript and available to all of its Scenes. Its
 * values sit beside the prose (scene_property_values), never in it.
 *
 * `native`: set only in the shell, on the read-only fields every Scene has
 * ("words", "placement") that a Scene View shows, sorts and filters like a
 * property — never stored as a property, never edited.
 */
export interface SceneProperty {
  id: string;
  manuscript_id: string;
  project_id: string;
  name: string;
  type: CollectionPropertyType;
  options: PropertyOption[];
  /** 1..n within the Manuscript. */
  position: number;
  relation_target: ReferenceObjectType | null;
  relation_collection_id: string | null;
  relation_many: boolean;
  created_at: string;
  updated_at: string;
  native?: true;
}

/** A property of either owner: a Collection's (for its Entries) or a Manuscript's (for its Scenes). */
export type PropertyDefinition = CollectionProperty | SceneProperty;

/**
 * A stored property value, by type: text → string; number → number;
 * select/status → an option id; multi_select → option ids; date →
 * "YYYY-MM-DD"; checkbox → true. No value is no row. A Relationship's value
 * is its targets' canonical ids, in order — read from object_references,
 * never stored in workspace_entry_values.
 */
export type PropertyValue = string | number | boolean | string[];

/** One Entry's value for one property (table workspace_entry_values). */
export interface EntryPropertyValue {
  entry_id: string;
  property_id: string;
  value: PropertyValue;
}

/** One Scene's value for one Scene property (table scene_property_values, migration 032). */
export interface ScenePropertyValue {
  scene_id: string;
  property_id: string;
  value: PropertyValue;
}

/** How a saved View presents a Collection's Entries (migration 027) or a Manuscript's Scenes (032). */
export type CollectionViewType = "list" | "table" | "board";

export type ViewFilterOp = "is" | "is_not" | "is_empty" | "is_not_empty" | "contains" | "gt" | "lt";

/**
 * One filter of a View; all of a View's filters must hold.
 *   is / is_not    — a choice's option id, or a Relationship's target id (includes)
 *   contains       — text (032)
 *   gt / lt        — a number, or a date "YYYY-MM-DD" (032)
 */
export type ViewFilter =
  | { property: string; op: "is" | "is_not"; value: string }
  | { property: string; op: "contains"; value: string }
  | { property: string; op: "gt" | "lt"; value: number | string }
  | { property: string; op: "is_empty" | "is_not_empty" };

/**
 * A View's configuration — never content. Every id is a property (or option)
 * of the View's own Collection; the database checks it on every write and
 * prunes it when properties change.
 */
export interface CollectionViewConfig {
  /** Shown properties, in order: List's line, Table's columns, Board's card lines. */
  properties: string[];
  /** null: creation order (Scenes: manuscript order). `by`: "title" or a property id. */
  sort: { by: string; direction: "asc" | "desc" } | null;
  filters: ViewFilter[];
  /** A select, status or Relationship-to-Entries property (Board lanes); null when there is none to group by. */
  group_by: string | null;
  /**
   * Table column widths in px (80–640), by field id, "title" for the name
   * column (migration 034). Absent, or no entry: the column's default width.
   */
  widths?: Record<string, number>;
}

/**
 * One saved View of a Collection (migration 027, table
 * workspace_collection_views). Configuration only: the same Entries and
 * values appear in every View.
 */
export interface WorkspaceCollectionView {
  id: string;
  collection_id: string;
  project_id: string;
  name: string;
  type: CollectionViewType;
  /** 1..n within the Collection; the first is the one a Collection opens in. */
  position: number;
  config: CollectionViewConfig;
  created_at: string;
  updated_at: string;
}

/**
 * One saved View of a Manuscript's Scenes (migration 032, table scene_views):
 * configuration only, like a Collection View. Its config may also name the
 * read-only Scene fields "words" and "placement"; sort null is manuscript order.
 */
export interface SceneView {
  id: string;
  manuscript_id: string;
  project_id: string;
  name: string;
  type: CollectionViewType;
  position: number;
  config: CollectionViewConfig;
  created_at: string;
  updated_at: string;
}

/** A saved View of either owner. */
export type SavedView = WorkspaceCollectionView | SceneView;

/**
 * One forward reference between two objects of the same Project (migration
 * 028, table object_references). Exactly the id column matching each type is
 * set. property_id null: a generic reference; otherwise one value of that
 * Relationship property of the source Entry. Backlinks are these rows read by
 * target — never stored.
 */
export interface ObjectReferenceRow {
  id: string;
  project_id: string;
  source_type: ReferenceObjectType;
  source_entry_id: string | null;
  source_document_id: string | null;
  source_scene_id: string | null;
  target_type: ReferenceObjectType;
  target_entry_id: string | null;
  target_document_id: string | null;
  target_scene_id: string | null;
  property_id: string | null;
  /** A Scene property the row is a value of (source 'scene'; migration 032). Absent before 032. */
  scene_property_id?: string | null;
  /** Order among the source's references (per property, or among its generic ones). */
  position: number;
  created_at: string;
}

export type WorkspaceNodeTarget = "page" | "folder" | "collection";

/**
 * One Workspace object's single place in the Workspace tree (table
 * workspace_nodes). Navigation only: the object belongs to the Project
 * wherever its node sits. Exactly one of document_id / folder_id / collection_id is set, matching
 * target_type.
 */
export interface WorkspaceNode {
  id: string;
  target_type: WorkspaceNodeTarget;
  document_id: string | null;
  folder_id: string | null;
  /** Set for target_type "collection" (migration 025); absent on a pre-025 read. */
  collection_id?: string | null;
  /** null = top level of the Workspace. Always a Folder's node otherwise. */
  parent_node_id: string | null;
  /** 1..n among its siblings. */
  position: number;
}

/** What can be put in a Project's Trash (migrations 030–031). */
export type TrashObjectType = "page" | "folder" | "collection" | "entry" | "scene";

/**
 * One item of a Project's Trash (list_workspace_trash): titles, where it came
 * from and counts only — never content.
 */
export interface TrashItem {
  type: TrashObjectType;
  id: string;
  title: string | null;
  trashed_at: string;
  /** Page / Folder / Collection: the Folder it was in (null: the top level). */
  from_folder_id: string | null;
  from_folder_title: string | null;
  /** Whether that Folder is still there, so a restore returns it there. */
  from_folder_active: boolean | null;
  /** Entry: its Collection, and whether that Collection is active (not in Trash). */
  collection_id: string | null;
  collection_title: string | null;
  collection_active: boolean | null;
  /** Collection: how many Entries it holds (in Trash on their own included). */
  entries: number | null;
  /** Collection: Relationships of other Collections that point at it. */
  properties: number | null;
  /** Scene: the Chapter it was placed in (null: Unplaced), and whether that Chapter still exists. */
  from_chapter_id?: string | null;
  from_chapter_title?: string | null;
  from_chapter_active?: boolean | null;
}

export interface Chapter {
  id: string;
  manuscript_id: string;
  /** The Manuscript Group holding it; null = directly under the Manuscript. */
  group_id: string | null;
  title: string;
  /** Among its parent's children (Groups and Chapters together), not a manuscript-wide index. */
  position: number;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * The unit of manuscript prose. A Scene always belongs to its Manuscript and
 * is either placed in a Chapter of that Manuscript or Unplaced
 * (chapter_id null). Every placed Scene counts toward the ordered manuscript
 * total and appears in export; there is no canonical Scene.
 */
export interface Scene {
  id: string;
  manuscript_id: string;
  chapter_id: string | null;
  title: string;
  content: Record<string, unknown> | null;
  word_count: number;
  position: number;
  version: number;
  created_at: string;
  updated_at: string;
}

/** A Scene placed in a Chapter: part of the ordered manuscript. */
export type PlacedScene = Scene & { chapter_id: string };

/**
 * A Scene with no Chapter. Still manuscript prose, editable and saved like any
 * Scene, but outside the ordered manuscript total and standard export.
 */
export type UnplacedScene = Scene & { chapter_id: null };

export interface ProjectNote {
  id: string;
  user_id: string;
  project_id: string;
  content: string;
  is_completed: boolean;
  is_pinned: boolean;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface GameSession {
  id: string;
  user_id: string;
  mode: string;
  words_written: number;
  duration_seconds: number | null;
  xp_earned: number;
  completed: boolean;
  enemy_type: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

export interface AnalyticsEvent {
  id: string;
  user_id: string | null;
  event_name: string;
  project_id: string | null;
  local_date: string | null;
  metadata: Record<string, unknown> | null;
  dedupe_key: string | null;
  created_at: string;
}

export interface AcquisitionAttribution {
  id: string;
  user_id: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  fbclid: string | null;
  landing_path: string | null;
  captured_at: string | null;
  created_at: string;
}

export interface FutureLetter {
  id: string;
  user_id: string;
  project_id: string;
  content: string;
  created_at: string;
  reveal_at: string;
  revealed_at: string | null;
}

export interface FounderNote {
  id: string;
  author_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export type FounderOfferStatus = "not_offered" | "eligible" | "claimed" | "declined";

export interface PricingEntitlement {
  user_id: string;
  pricing_cohort: PricingCohort;
  pricing_notice_resolved_at: string | null;
  founder_offer_status: FounderOfferStatus;
  founder_offer_claimed_at: string | null;
  created_at: string;
  updated_at: string;
}
