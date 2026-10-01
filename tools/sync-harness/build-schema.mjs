#!/usr/bin/env node
// Builds the canonical Rune 2.0 schema, src/lib/supabase/schema.sql.
//
//   npm --prefix tools/sync-harness run schema           # write schema.sql
//   npm --prefix tools/sync-harness run schema -- --check  # exit 1 if stale
//   npm --prefix tools/sync-harness run schema -- --catalog <file.json>
//       also writes the catalog of the built database, to compare a real
//       Rune 2.0 database against with tools/db-audit/diff-catalog.mjs
//       (--expect schema-only)
//
// Recipe: the Rune 1.x production baseline
// (src/lib/supabase/baseline/production-2026-09-24.sql), then every migration
// numbered 013 and above in order, applied in PGlite behind the Supabase shim;
// the result is captured with tools/db-audit/catalog.sql and written out by
// the same generator as the baseline. The file therefore contains exactly what
// the migrations produce, never a hand edit, and records every migration it
// contains in public.schema_migrations.
//
// tests/rune2-schema.test.mjs proves that schema.sql is current, and that a
// database built from it alone is structurally identical to baseline + migrations.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTestDb, readRepoFile, REPO_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from './lib/pg.mjs';
import { catalogFromRows } from '../db-audit/catalog-lib.mjs';
import { generateSchemaSql } from '../db-audit/schema-generator.mjs';

const BASELINE_PATH = LEGACY_BASELINE;
const SCHEMA_PATH = RUNE2_SCHEMA;
const MIGRATIONS_DIR = 'src/lib/supabase/migrations';

/** Migration files applied on top of the baseline: 013 and above, in order. */
export function migrationsAfterBaseline() {
  return fs.readdirSync(path.join(REPO_DIR, MIGRATIONS_DIR))
    .filter((f) => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 13)
    .sort();
}

export const RUNE2_NOTES = {
  manuscripts: [
    'Exactly one per Project (unique project_id), created by trg_project_manuscript',
    'and deleted with the Project. Writers can read their own; nothing else.',
  ],
  chapters: [
    'Ordered manuscript structure. Belongs to a Manuscript (manuscript_id); its',
    'Project is manuscripts.project_id. Contains no prose.',
    'Clients cannot INSERT (no privilege, no policy): Chapters are created only by',
    'create_chapter_checked (always with a first Scene), create_project_checked',
    'and duplicate_project_checked. Clients cannot DELETE either (037): a Chapter',
    'goes to Trash with its Scenes (trash_workspace_object) and is deleted only from',
    'Trash; delete_chapter ("remove, keep its Scenes") first moves them to Unplaced.',
    'Placed directly under the Manuscript (group_id null) or in a Manuscript Group.',
    'position orders it among its parent\'s children, Groups and Chapters together',
    '(unique across both tables, active Chapters only); group_id/position change',
    'only via move_chapter. Trash (037): a trashed Chapter (trashed_at) is in no',
    'Group, remembers where it was (trashed_from_group_id/_index), and is hidden by RLS.',
  ],
  manuscript_groups: [
    'Structural container ("Part I", "Book Two", "Act I"): one type for all. Belongs',
    'to a Manuscript; contains Chapters and Groups (parent_group_id null = top',
    'level), never Scenes or prose. Cycles are refused (manuscript_groups_forbid_cycle).',
    'Reading order is depth-first by (parent, position), Groups and Chapters',
    'sharing one sibling order. Writers read and rename their own; creation,',
    'deletion (empty only) and moves go through the SECURITY DEFINER functions',
    'create_manuscript_group, delete_manuscript_group, move_manuscript_group.',
  ],
  workspace_folders: [
    'Workspace Folder: purely organisational, no content. Belongs directly to its',
    'Project. Writers read and rename their own active Folders; creation goes through',
    'create_workspace_folder. Trash (trash_workspace_object) moves its items up into',
    'its place and keeps only the Folder; a trashed Folder has no node.',
  ],
  workspace_collections: [
    'Workspace Collection: many Entries of one writer-defined kind. Belongs directly',
    'to its Project and owns its Entries. Writers read and rename their own active',
    'Collections; creation goes through create_workspace_collection. Never a parent',
    'in the Workspace tree. Trashed as a unit: its Entries, properties, values and',
    'Views stay, hidden, until it is restored or permanently deleted.',
  ],
  workspace_collection_entries: [
    'Collection Entry: title + freeform rich text (never manuscript prose). Belongs',
    'to one Collection for life; project_id is that Collection\'s (composite FK).',
    'version bumps on content changes only. Active only while it and its Collection',
    'are untrashed (RLS hides it otherwise). No client DELETE: Trash RPCs only.',
  ],
  workspace_collection_properties: [
    'Collection property definition: name (unique per Collection, ignoring case),',
    'type, owned options (choice types), position 1..n, shown_in_list. Belongs to',
    'one Collection for life. Clients only read; every change goes through',
    'create/update/move/delete_workspace_collection_property.',
  ],
  workspace_entry_values: [
    'One Entry\'s value for one property of the SAME Collection (both composite FKs',
    'share collection_id). No row = no value. Checked against the property\'s type',
    'and options on every write. Deleted with its property or Entry. Clients only',
    'read; writes go through set_workspace_entry_value.',
  ],
  workspace_collection_views: [
    'Saved View of one Collection (list | table | board | timeline): configuration',
    'only — shown properties, sort, filters, Board grouping, a Timeline\'s axis (042:',
    'a date or number property) — never Entries or values.',
    'config names only the Collection\'s own properties/options (checked on write,',
    'pruned when properties change). position 1..n; the last View is kept.',
    'Clients only read; writes via create/update/move/delete_workspace_collection_view.',
  ],
  object_references: [
    'One forward reference between two canonical objects of the SAME Project —',
    'an Entry, a Workspace Page or a Scene (source_type/target_type + exactly one',
    'typed id column each; real FKs, a Scene held to the Project by the check',
    'trigger). property_id / scene_property_id both null: a generic reference;',
    'property_id set: one value of that Relationship property of the source Entry\'s',
    'Collection; scene_property_id set: one value of that Scene property of the',
    'source Scene\'s Manuscript. Backlinks are derived (rows by target), never',
    'stored. Deleting an end deletes the row, never the other end. Clients only',
    'read; writes via set_workspace_entry_relationship, set_scene_relationship,',
    'add_object_reference, remove_object_reference (generic references only).',
  ],
  scene_property_definitions: [
    'Scene property definition of one Manuscript (032): name (unique per Manuscript,',
    'ignoring case), type (Collection property types, Relationship included), owned',
    'options, position 1..n. Available to every Scene of the Manuscript; optional.',
    'Clients only read; writes via create/update/move/delete_scene_property and',
    'create_scene_relationship_property.',
  ],
  scene_property_values: [
    'One Scene\'s value for one property of ITS Manuscript. No row = no value. Beside',
    'the prose, never in it: no write here touches the Scene row (content, words,',
    'version). Kept while the Scene is in Trash; deleted with its property or on',
    'permanent deletion of the Scene. Clients only read; writes via set_scene_property_value.',
  ],
  scene_views: [
    'Saved View of a Manuscript\'s Scenes (list | table | board | timeline):',
    'configuration only. config names the Manuscript\'s Scene properties and the',
    'read-only fields "words" and "placement"; sort null = manuscript order; a',
    'Timeline\'s axis (042) is "manuscript" or a date/number property. Checked on write,',
    'pruned when properties change. A Manuscript may have none.',
    'Clients only read; writes via create/update/move/delete_scene_view.',
  ],
  workspace_nodes: [
    'The Workspace tree: navigation only, never ownership. One canonical node per',
    'Page (document_id), Folder (folder_id) or Collection (collection_id), created',
    'with the object by place_new_workspace_object. Only a Folder has children; no cycles.',
    'Siblings are numbered 1..n. Clients only read nodes; placement changes',
    'through create_workspace_document, create_workspace_folder, move_workspace_node.',
  ],
  scene_revisions: [
    'Scene History (036): an earlier text of one Scene (content, words, title) — not',
    'a live object: never in totals, the allowance, export, search or references.',
    'Taken on the save path by scenes_record_revision (the replaced text after a',
    '30-minute pause or an hour after the last one; never fails the save), by',
    'restore_scene_revision (reason restore) and create_manuscript_milestone.',
    'Pruned per Scene (30 days whole, then one a day, at most 200); a revision a',
    'Milestone uses is never pruned or deleted (FK NO ACTION). Deleting a Scene',
    'deletes its other revisions (scenes_forget_history); those a Milestone uses',
    'stay with scene_id null. Clients only read; no client writes.',
  ],
  manuscript_milestones: [
    'Named Manuscript Milestone (036): the manuscript at one moment, read-only,',
    'never a branch. structure holds its Groups and Chapters as they were; its',
    'Scenes are manuscript_milestone_scenes. Created only by create_manuscript_milestone,',
    'deleted only by delete_manuscript_milestone. Clients only read.',
  ],
  manuscript_milestone_scenes: [
    'One active Scene of a Milestone: its identity (scene_id, no FK), placement then',
    '(chapter_id null = Unplaced, position) and text (revision_id → scene_revisions).',
    'Clients only read.',
  ],
  scene_revision_notes_038: [
    'The original Scene revision notes of 038 (one per Scene), kept untouched by 039',
    'after every row was copied into revision_notes. No client access, nothing reads',
    'or writes it; a later migration may drop it deliberately.',
  ],
  revision_notes: [
    'Revision Note (039, 040): a short plain-text note on exactly ONE of the',
    'Manuscript, a Group, a Chapter or a Scene (target_type; group_id | chapter_id |',
    'scene_id, or none for the Manuscript; mirrored in target_id), anchored by id so',
    'it follows its target through every move. Many per target. Beside the prose,',
    'never in it — not counted, exported, searched or captured by Milestones, and',
    'writing one never touches a manuscript row. What each level shows (a Chapter its',
    'Scenes\' notes, a Group its descendants\', the Manuscript everything) is derived',
    'by the app, never stored. Hidden by RLS while its Chapter or Scene is in Trash;',
    'deleted with its target. Written only by create/update/delete_revision_note',
    '(id-idempotent create, version-checked edit and delete). Clients only read.',
  ],
  projects: [
    'word_count is the ORDERED MANUSCRIPT TOTAL (placed Scenes only), maintained',
    'by the scenes_refresh_project_word_count trigger. Not the free-limit total.',
    'Clients cannot INSERT projects (create_project_checked and',
    'duplicate_project_checked create them) or change word_count',
    '(projects_protect_word_count). creation_request_id deduplicates retries.',
  ],
  scenes: [
    'Manuscript prose. A Scene BELONGS to one Manuscript (manuscript_id, never',
    'changes) and is PLACED in a Chapter of that Manuscript, or Unplaced when',
    'chapter_id is null. There is no canonical Scene. Scene IDs are stable: a',
    'future Rune 1.x migration keeps every Page ID as its Scene ID.',
    'Clients cannot INSERT (no privilege, no policy): Scenes are created only by',
    'insert_scene_checked, insert_unplaced_scene_checked, create_chapter_checked,',
    'create_project_checked and duplicate_project_checked (SECURITY DEFINER,',
    'ownership checked in each). Clients cannot DELETE (037): permanent deletion is',
    'only from Trash (delete_trashed_workspace_object).',
    'Active Unplaced Scenes have unique positions per Manuscript (scenes_unplaced_position_excl).',
    'Trash (031): a trashed Scene (trashed_at) is unplaced, keeps its position and',
    'version, remembers its Chapter (trashed_from_chapter_id), and is hidden by RLS.',
    'trashed_with_chapter (037): it went to Trash with its Chapter and comes back with it.',
  ],
  writing_sessions: [
    'Typed-word writing activity. Editor rows are keyed per Scene (scene_id),',
    'Arena and other rows have scene_id null; uniqueness is the partial unique',
    'indexes below. Deleting a Scene keeps its rows as Project-level history',
    '(scenes_detach_writing_sessions: scene_id null, merged into an existing',
    'Project-level row for that day). Deleting a Project deletes its rows.',
  ],
  subscription_events: [
    'NOTE: production shape (stripe_event_id NOT NULL, tier, status; no payload)',
    'differs from migration 004 and from what the Stripe webhook inserts, so those',
    'inserts currently fail. Carried over from the Rune 1.x baseline as-is.',
  ],
  'fn:account_word_total': [
    'Free-limit account total: EVERY Scene the caller owns, placed or Unplaced.',
    'Not the ordered manuscript total (placed Scenes only). Never collapse them.',
  ],
  'fn:ordered_manuscript_word_total': [
    'The ordered manuscript total: every placed Scene of the Manuscript. Unplaced',
    'Scenes excluded. The one SQL definition; projects.word_count stores it.',
  ],
  'fn:increment_game_ticket': [
    'Unused by the app. SECURITY DEFINER without a pinned search_path, trusts',
    'p_user_id, and is executable by PUBLIC/anon. Carried over from the Rune 1.x',
    'baseline as-is; hardening is a separate, explicitly approved change.',
  ],
  'fn:save_scene_checked': [
    'Save-path RPC. Statuses: ok | word_limit_blocked | version_mismatch | error',
    '(\'Scene not found\'). Once clients depend on it, never overload or extend it.',
  ],
  'policies:legacy': [
    'projects still carries the legacy "Users can manage their own projects" FOR',
    'ALL policy beside its per-command policies (both permissive, OR-ed), as in',
    'Rune 1.x. Manuscript tables use per-command policies for `authenticated` only.',
  ],
};

function header(migrations) {
  const first = migrations[0].slice(0, 3);
  const last = migrations[migrations.length - 1].slice(0, 3);
  return [
    'Rune 2.0 — canonical schema (GENERATED — do not edit by hand)',
    '',
    'Generated by tools/sync-harness/build-schema.mjs: the Rune 1.x production',
    `baseline (${BASELINE_PATH})`,
    `plus migrations ${first}–${last}, applied in PostgreSQL (PGlite) behind the Supabase`,
    'shim and captured with tools/db-audit/catalog.sql.',
    '',
    'Builds a brand-new Rune 2.0 database in one step. The migrations it contains',
    'are recorded in public.schema_migrations at the end; apply only migrations',
    'numbered above the last one recorded. Migrations 001–012 must never be run.',
    '',
    'Manuscript model: projects → manuscripts (1:1) → chapters → scenes.',
    'A Scene belongs to its Manuscript and is placed in a Chapter or Unplaced',
    '(chapter_id null). There are no manuscript Pages and no canonical Scenes.',
    '',
    'Prerequisite: a Supabase project (roles anon/authenticated/service_role,',
    'auth.users, auth.uid()/auth.role(), and Supabase\'s default privileges).',
    'Supabase-managed objects (extensions, the platform\'s rls_auto_enable event',
    'trigger) are intentionally not created here.',
    '',
    'To change the schema: write a new numbered migration, then regenerate this',
    'file with `npm --prefix tools/sync-harness run schema`.',
  ];
}

/** Captures tools/db-audit/catalog.sql from a database. */
export async function captureCatalog(db) {
  const res = await db.exec(readRepoFile('tools/db-audit/catalog.sql'));
  return catalogFromRows(res[res.length - 1].rows);
}

/** A fresh PGlite database holding the baseline plus every migration from 013. */
export async function migratedDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(BASELINE_PATH));
  for (const f of migrationsAfterBaseline()) await db.exec(readRepoFile(`${MIGRATIONS_DIR}/${f}`));
  return db;
}

/** Builds the Rune 2.0 schema text from baseline + migrations. */
export async function buildRune2Schema() {
  const migrations = migrationsAfterBaseline();
  const db = await migratedDb();
  const catalog = await captureCatalog(db);
  const ledger = (await db.query(`select version, name, note from public.schema_migrations order by version`)).rows;
  const { sql, stats } = generateSchemaSql(catalog, { header: header(migrations), notes: RUNE2_NOTES, ledger });
  await db.close();
  return { sql, stats, catalog, ledger };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const catalogIdx = process.argv.indexOf('--catalog');
  const { sql, stats, catalog } = await buildRune2Schema();
  if (catalogIdx > 0) {
    const file = process.argv[catalogIdx + 1];
    if (!file) { console.error('--catalog needs a file path'); process.exit(2); }
    fs.writeFileSync(file, JSON.stringify(catalog, null, 1));
    console.log(`wrote the built database's catalog to ${file}`);
  }
  const out = path.join(REPO_DIR, SCHEMA_PATH);
  if (check) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (current !== sql) {
      console.error(`${SCHEMA_PATH} is stale: run \`npm --prefix tools/sync-harness run schema\``);
      process.exit(1);
    }
    console.log(`${SCHEMA_PATH} is current`);
  } else {
    fs.writeFileSync(out, sql);
    console.log(`wrote ${SCHEMA_PATH}: ${stats.tables} tables, ${stats.constraints} constraints, ${stats.functions} functions, ${stats.policies} policies, ${stats.triggers} triggers`);
  }
}
