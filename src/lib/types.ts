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

/** A Collection property's type (migration 026). Relationship comes with the relationships milestone. */
export type CollectionPropertyType = "text" | "number" | "select" | "multi_select" | "status" | "date" | "checkbox";

/** One choice of a select, multi-select or status property. Values refer to it by id. */
export interface PropertyOption {
  id: string;
  name: string;
}

/**
 * One property definition of a Collection (migration 026, table
 * workspace_collection_properties). The Collection defines it once; each Entry
 * may hold a value for it. Never on Pages, and not yet on Scenes.
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
  created_at: string;
  updated_at: string;
}

/**
 * A stored property value, by type: text → string; number → number;
 * select/status → an option id; multi_select → option ids; date →
 * "YYYY-MM-DD"; checkbox → true. No value is no row.
 */
export type PropertyValue = string | number | boolean | string[];

/** One Entry's value for one property (table workspace_entry_values). */
export interface EntryPropertyValue {
  entry_id: string;
  property_id: string;
  value: PropertyValue;
}

/** How a saved View presents a Collection's Entries (migration 027). */
export type CollectionViewType = "list" | "table" | "board";

export type ViewFilterOp = "is" | "is_not" | "is_empty" | "is_not_empty";

/** One filter of a View; all of a View's filters must hold. `value`: an option id ("is"/"is_not" only). */
export type ViewFilter =
  | { property: string; op: "is" | "is_not"; value: string }
  | { property: string; op: "is_empty" | "is_not_empty" };

/**
 * A View's configuration — never content. Every id is a property (or option)
 * of the View's own Collection; the database checks it on every write and
 * prunes it when properties change.
 */
export interface CollectionViewConfig {
  /** Shown properties, in order: List's line, Table's columns, Board's card lines. */
  properties: string[];
  /** null: creation order. `by`: "title" or a property id. */
  sort: { by: string; direction: "asc" | "desc" } | null;
  filters: ViewFilter[];
  /** A select or status property (Board lanes); null when there is none to group by. */
  group_by: string | null;
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
