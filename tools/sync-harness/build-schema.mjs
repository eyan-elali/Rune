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
    'and duplicate_project_checked. A Chapter that still holds a Scene cannot be',
    'deleted (scenes FK is NO ACTION): delete_chapter first moves its Scenes to',
    'Unplaced.',
    'Placed directly under the Manuscript (group_id null) or in a Manuscript Group.',
    'position orders it among its parent\'s children, Groups and Chapters together',
    '(unique across both tables); group_id/position change only via move_chapter.',
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
    'Project. Writers read and rename their own; creation and deletion (empty',
    'only) go through create_workspace_folder and delete_workspace_folder.',
  ],
  workspace_collections: [
    'Workspace Collection: many Entries of one writer-defined kind. Belongs directly',
    'to its Project and owns its Entries. Writers read and rename their own;',
    'creation and deletion (empty only) go through create_workspace_collection and',
    'delete_workspace_collection. Never a parent in the Workspace tree.',
  ],
  workspace_collection_entries: [
    'Collection Entry: title + freeform rich text (never manuscript prose). Belongs',
    'to one Collection for life; project_id is that Collection\'s (composite FK).',
    'version bumps on content changes only. No client DELETE until Trash exists.',
  ],
  workspace_nodes: [
    'The Workspace tree: navigation only, never ownership. One canonical node per',
    'Page (document_id), Folder (folder_id) or Collection (collection_id), created',
    'with the object by place_new_workspace_object. Only a Folder has children; no cycles.',
    'Siblings are numbered 1..n. Clients only read nodes; placement changes',
    'through create_workspace_document, create_workspace_folder, move_workspace_node.',
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
    'ownership checked in each). Deleting a Chapter never deletes its Scenes.',
    'Unplaced Scenes have unique positions per Manuscript (scenes_unplaced_position_excl).',
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
