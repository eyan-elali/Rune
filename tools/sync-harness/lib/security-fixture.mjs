// Fixture for the security audit tests (tests/security-rls.test.mjs,
// tests/security-rpc.test.mjs): a Rune 2.0 database with an ATTACKER, a
// VICTIM and an ADMIN, each seeded through the real RPCs the app calls (so the
// data is shaped exactly as production data is), plus the rows only the
// server writes (seeded as the loading superuser). Also a whole-database
// snapshot so a test can prove an attack had NO side effect on any table.
import { createTestDb, readRepoFile, createAuthUser, RUNE2_SCHEMA } from './pg.mjs';
import { createSupabaseAdapter } from './supabase-adapter.mjs';

export const ATTACKER = '0a77ac4e-0000-4000-8000-000000000a77';
export const VICTIM = '0f1c7100-0000-4000-8000-000000000f1c';
export const ADMIN = '0ad00000-0000-4000-8000-000000000ad0';

export const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

export const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
export const anon = (db) => createSupabaseAdapter(db, { role: 'anon' });

export const ok = (r, what = '') => {
  if (r.error) throw new Error(`${what} failed: ${r.error.code ?? ''} ${r.error.message}`);
  if (r.data && typeof r.data === 'object' && !Array.isArray(r.data) && 'status' in r.data && r.data.status !== 'ok') {
    throw new Error(`${what} returned ${JSON.stringify(r.data)}`);
  }
  return r.data;
};

/** Every table in `public`, as the loading superuser sees it. */
export async function publicTables(db) {
  const res = await db.query(
    `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname`);
  return res.rows.map((r) => r.name);
}

/** One digest per table of every row's full text: equal digests mean nothing changed anywhere. */
export async function snapshot(db) {
  const out = {};
  for (const t of await publicTables(db)) {
    const res = await db.query(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h, count(*)::int as n from public."${t}" t`);
    out[t] = `${res.rows[0].n}:${res.rows[0].h}`;
  }
  return out;
}

export function diffSnapshots(before, after) {
  return Object.keys(before).filter((t) => before[t] !== after[t]);
}

/** Seeds one writer's whole estate through the real RPCs; returns every id a test may aim at. */
export async function seedWriter(db, userId, label) {
  const sb = as(db, userId);
  const w = { id: userId, label };

  const created = ok(await sb.rpc('create_project_checked', {
    p_title: `${label} novel`, p_description: null, p_cover_color: null,
    p_first_scene_content: doc(`${label} first words of the scene`), p_first_scene_word_count: 6, p_request_id: crypto.randomUUID(),
  }), 'create_project_checked');
  w.project = created.project.id;
  w.requestId = created.project.creation_request_id;
  w.chapter = created.chapter.id;
  w.scene = created.scene_id;
  w.manuscript = (await db.query(`select id from public.manuscripts where project_id = $1`, [w.project])).rows[0].id;
  w.sceneVersion = (await db.query(`select version from public.scenes where id = $1`, [w.scene])).rows[0].version;

  w.unplaced = ok(await sb.rpc('insert_unplaced_scene_checked', {
    p_manuscript_id: w.manuscript, p_title: 'Loose scene', p_content: doc(`${label} loose words`), p_word_count: 3,
  }), 'insert_unplaced_scene_checked').id;
  w.group = ok(await sb.rpc('create_manuscript_group', { p_manuscript_id: w.manuscript, p_parent_group_id: null, p_title: 'Part One' }), 'create_manuscript_group').group.id;
  const ch2 = ok(await sb.rpc('create_chapter_checked', {
    p_manuscript_id: w.manuscript, p_title: 'Chapter 2', p_scene_title: 'Scene 2', p_scene_content: doc(`${label} second chapter`), p_scene_word_count: 3,
  }), 'create_chapter_checked');
  w.chapter2 = ch2.chapter.id;
  w.scene2 = ch2.scene_id;
  const ch3 = ok(await sb.rpc('create_chapter_checked', {
    p_manuscript_id: w.manuscript, p_title: 'Chapter 3 (to trash)', p_scene_title: 'Scene 3', p_scene_content: doc(`${label} third`), p_scene_word_count: 2,
  }), 'create_chapter_checked');
  w.trashedChapter = ch3.chapter.id;
  w.sceneInTrashedChapter = ch3.scene_id;
  w.trashedScene = ok(await sb.rpc('insert_unplaced_scene_checked', {
    p_manuscript_id: w.manuscript, p_title: 'Trashed scene', p_content: doc(`${label} trashed words`), p_word_count: 3,
  }), 'insert_unplaced_scene_checked').id;

  // Workspace
  const folder = ok(await sb.rpc('create_workspace_folder', { p_project_id: w.project, p_parent_node_id: null, p_title: 'Research' }), 'create_workspace_folder');
  w.folder = folder.folder.id; w.folderNode = folder.node_id;
  const page = ok(await sb.rpc('create_workspace_document', { p_project_id: w.project, p_parent_node_id: w.folderNode, p_title: 'Notes' }), 'create_workspace_document');
  w.page = page.page.id; w.pageNode = page.node_id;
  const page2 = ok(await sb.rpc('create_workspace_document', { p_project_id: w.project, p_parent_node_id: null, p_title: 'Old notes' }), 'create_workspace_document');
  w.trashedPage = page2.page.id;
  const coll = ok(await sb.rpc('create_workspace_collection', { p_project_id: w.project, p_parent_node_id: null, p_title: 'People' }), 'create_workspace_collection');
  w.collection = coll.collection.id; w.collectionNode = coll.node_id;
  const canvas = ok(await sb.rpc('create_workspace_canvas', { p_project_id: w.project, p_parent_node_id: null, p_title: 'Board' }), 'create_workspace_canvas');
  w.canvas = canvas.canvas.id; w.canvasNode = canvas.node_id;
  w.view = (await db.query(`select id from public.workspace_collection_views where collection_id = $1`, [w.collection])).rows[0].id;

  const entry = ok(await sb.from('workspace_collection_entries').insert({ project_id: w.project, collection_id: w.collection, title: 'Ann', content: doc(`${label} entry Ann`) }).select('id').single(), 'entry insert');
  w.entry = entry.id;
  w.entry2 = ok(await sb.from('workspace_collection_entries').insert({ project_id: w.project, collection_id: w.collection, title: 'Bo', content: doc(`${label} entry Bo`) }).select('id').single(), 'entry insert').id;
  w.trashedEntry = ok(await sb.from('workspace_collection_entries').insert({ project_id: w.project, collection_id: w.collection, title: 'Gone', content: doc(`${label} entry gone`) }).select('id').single(), 'entry insert').id;

  w.property = ok(await sb.rpc('create_workspace_collection_property', { p_collection_id: w.collection, p_name: 'Role', p_type: 'text' }), 'create_workspace_collection_property').property.id;
  ok(await sb.rpc('set_workspace_entry_value', { p_entry_id: w.entry, p_property_id: w.property, p_value: 'Lead' }), 'set_workspace_entry_value');
  w.relProperty = ok(await sb.rpc('create_workspace_relationship_property', {
    p_collection_id: w.collection, p_name: 'Friends', p_target: 'entry', p_target_collection_id: w.collection, p_many: true,
  }), 'create_workspace_relationship_property').property.id;
  ok(await sb.rpc('set_workspace_entry_relationship', { p_entry_id: w.entry, p_property_id: w.relProperty, p_target_ids: [w.entry2] }), 'set_workspace_entry_relationship');
  w.relRef = (await db.query(`select id from public.object_references where property_id = $1`, [w.relProperty])).rows[0].id;

  w.sceneProperty = ok(await sb.rpc('create_scene_property', { p_project_id: w.project, p_name: 'POV', p_type: 'text' }), 'create_scene_property').property.id;
  ok(await sb.rpc('set_scene_property_value', { p_scene_id: w.scene, p_property_id: w.sceneProperty, p_value: 'Ann' }), 'set_scene_property_value');
  w.sceneRelProperty = ok(await sb.rpc('create_scene_relationship_property', {
    p_project_id: w.project, p_name: 'Cast', p_target: 'entry', p_target_collection_id: w.collection, p_many: true,
  }), 'create_scene_relationship_property').property.id;
  ok(await sb.rpc('set_scene_relationship', { p_scene_id: w.scene, p_property_id: w.sceneRelProperty, p_target_ids: [w.entry] }), 'set_scene_relationship');
  w.sceneView = ok(await sb.rpc('create_scene_view', { p_project_id: w.project, p_name: 'Scenes', p_type: 'table', p_config: null, p_group_id: null }), 'create_scene_view').view.id;
  w.groupSceneView = ok(await sb.rpc('create_scene_view', { p_project_id: w.project, p_name: 'Part scenes', p_type: 'list', p_config: null, p_group_id: w.group }), 'create_scene_view').view.id;

  w.link = ok(await sb.rpc('add_object_reference', { p_source_type: 'page', p_source_id: w.page, p_target_type: 'scene', p_target_id: w.scene }), 'add_object_reference').reference.id;

  w.note = crypto.randomUUID();
  ok(await sb.rpc('create_revision_note_item', {
    p_note_id: w.note, p_target_type: 'scene', p_target_id: w.scene, p_body: `${label}: tighten the opening`, p_details: null, p_resolved: false, p_anchor: null,
  }), 'create_revision_note_item');
  w.manuscriptNote = crypto.randomUUID();
  ok(await sb.rpc('create_revision_note_item', {
    p_note_id: w.manuscriptNote, p_target_type: 'manuscript', p_target_id: w.manuscript, p_body: `${label}: whole-book note`, p_details: null, p_resolved: false, p_anchor: null,
  }), 'create_revision_note_item');

  w.milestone = ok(await sb.rpc('create_manuscript_milestone', { p_manuscript_id: w.manuscript, p_name: 'First draft' }), 'create_manuscript_milestone').id;
  w.revision = (await db.query(`select id from public.scene_revisions where scene_id = $1 order by created_at limit 1`, [w.scene])).rows[0].id;

  // Canvas: a note, a Scene placement, a connection, an image.
  w.canvasNote = crypto.randomUUID(); w.canvasSceneItem = crypto.randomUUID(); w.connection = crypto.randomUUID();
  const written = ok(await sb.rpc('write_canvas_items', { p_canvas_id: w.canvas, p_changes: [
    { op: 'create', id: w.canvasNote, item_type: 'note', content: doc(`${label} canvas note`), x: 0, y: 0, width: 200, height: 100 },
    { op: 'create', id: w.canvasSceneItem, item_type: 'scene', target_id: w.scene, x: 300, y: 0, width: 200, height: 100 },
    { op: 'create', kind: 'connection', id: w.connection, source_id: w.canvasNote, target_id: w.canvasSceneItem },
  ] }), 'write_canvas_items');
  for (const r of written.results) if (r.status !== 'ok') throw new Error(`seed canvas: ${JSON.stringify(r)}`);
  w.attachment = crypto.randomUUID();
  ok(await sb.rpc('create_workspace_attachment', {
    p_id: w.attachment, p_project_id: w.project, p_kind: 'image', p_file_name: 'cover.png', p_mime_type: 'image/png', p_byte_size: 1234,
    p_width: 10, p_height: 10, p_storage_bucket: 'workspace-attachments', p_storage_key: `${w.project}/${w.attachment}/original.png`, p_display_key: null, p_display_width: null, p_display_height: null,
  }), 'create_workspace_attachment');
  w.imageItem = crypto.randomUUID();
  const img = ok(await sb.rpc('write_canvas_items', { p_canvas_id: w.canvas, p_changes: [
    { op: 'create', id: w.imageItem, item_type: 'image', target_id: w.attachment, x: 0, y: 300, width: 100, height: 100 },
  ] }), 'write_canvas_items');
  if (img.results[0].status !== 'ok') throw new Error(`seed image: ${JSON.stringify(img.results[0])}`);
  w.unreferencedAttachment = crypto.randomUUID();
  ok(await sb.rpc('create_workspace_attachment', {
    p_id: w.unreferencedAttachment, p_project_id: w.project, p_kind: 'image', p_file_name: 'spare.png', p_mime_type: 'image/png', p_byte_size: 99,
    p_width: 4, p_height: 4, p_storage_bucket: 'workspace-attachments', p_storage_key: `${w.project}/${w.unreferencedAttachment}/original.png`, p_display_key: null, p_display_width: null, p_display_height: null,
  }), 'create_workspace_attachment');

  // Trash states
  ok(await sb.rpc('trash_workspace_object', { p_type: 'scene', p_id: w.trashedScene }), 'trash scene');
  ok(await sb.rpc('trash_workspace_object', { p_type: 'chapter', p_id: w.trashedChapter }), 'trash chapter');
  ok(await sb.rpc('trash_workspace_object', { p_type: 'page', p_id: w.trashedPage }), 'trash page');
  ok(await sb.rpc('trash_workspace_object', { p_type: 'entry', p_id: w.trashedEntry }), 'trash entry');
  const tp = ok(await sb.rpc('create_project_checked', {
    p_title: `${label} abandoned novel`, p_description: null, p_cover_color: null,
    p_first_scene_content: doc(`${label} abandoned words`), p_first_scene_word_count: 2, p_request_id: crypto.randomUUID(),
  }), 'create_project_checked');
  w.trashedProject = tp.project.id;
  ok(await sb.rpc('trash_project', { p_project_id: w.trashedProject }), 'trash_project');

  // Account-level rows the app writes directly (own-row policies) …
  ok(await sb.rpc('onboarding_begin', {}), 'onboarding_begin');
  ok(await sb.from('beta_feedback').insert({ user_id: userId, category: 'broken', body: `${label} feedback body` }), 'beta_feedback');
  ok(await sb.from('writing_sessions').insert({ user_id: userId, project_id: w.project, scene_id: w.scene, words_added: 6 }), 'writing_sessions');
  ok(await sb.from('writing_goals').insert({ user_id: userId, project_id: w.project, type: 'daily_project', target_words: 500 }), 'writing_goals');
  ok(await sb.from('future_letters').insert({ user_id: userId, project_id: w.project, content: `${label} letter to the future` }), 'future_letters');
  ok(await sb.from('project_notes').insert({ user_id: userId, project_id: w.project, content: `${label} checklist item` }), 'project_notes');
  ok(await sb.from('game_sessions').insert({ user_id: userId, mode: 'race', words_written: 50 }), 'game_sessions');
  ok(await sb.from('xp_events').insert({ user_id: userId, amount: 5, reason: 'words' }), 'xp_events');
  ok(await sb.from('user_unlockables').insert({ user_id: userId, unlockable_id: 'theme_candlelight' }), 'user_unlockables');
  // … and the rows only the server writes.
  await db.query(`insert into public.game_tickets (user_id, week_start, tickets_used) values ($1, date '2026-09-28', 1)`, [userId]);
  await db.query(`insert into public.subscription_events (user_id, stripe_event_id, event_type, tier, status) values ($1, $2, 'customer.subscription.created', 'scribe', 'active')`, [userId, `evt_${label}`]);
  await db.query(`insert into public.project_storage_purges (user_id, project_id, storage_bucket, storage_keys) values ($1, $2, 'attachments', array['${w.project}/old.png'])`, [userId, w.project]);
  await db.query(`insert into public.analytics_events (user_id, event_name, project_id, metadata) values ($1, 'first_save', $2, '{}')`, [userId, w.project]);
  await db.query(`insert into public.acquisition_attribution (user_id, source, medium) values ($1, 'newsletter', 'email')`, [userId]);
  await db.query(`update public.profiles set stripe_customer_id = $2, subscription_tier = 'scribe', subscription_status = 'active' where id = $1`, [userId, `cus_${label}`]);
  w.purge = (await db.query(`select id from public.project_storage_purges where user_id = $1`, [userId])).rows[0].id;
  w.futureLetter = (await db.query(`select id from public.future_letters where user_id = $1`, [userId])).rows[0].id;
  w.writingSession = (await db.query(`select id from public.writing_sessions where user_id = $1`, [userId])).rows[0].id;
  w.nodes = (await db.query(`select id from public.workspace_nodes where project_id = $1`, [w.project])).rows.map((r) => r.id);
  w.canvasNoteOnTrashed = null;
  return w;
}

/**
 * A fresh Rune 2.0 database with three accounts: the attacker and the victim
 * (both accepted beta members with a profile and a full estate), and an admin
 * (profile.is_admin, no estate). Server-only rows: a deleted account, a
 * founder note, an analytics exclusion, a waitlist entry, an approved-but-
 * unclaimed beta invitation.
 */
export async function securityDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await createAuthUser(db, ATTACKER, { display_name: 'Mallory' }, { email: 'mallory@harness.test' });
  await createAuthUser(db, VICTIM, { display_name: 'Vera' }, { email: 'vera@harness.test' });
  await createAuthUser(db, ADMIN, { display_name: 'Founder' }, { beta: false, email: 'founder@harness.test' });
  await db.query(`update public.profiles set is_admin = true where id = $1`, [ADMIN]);
  const victim = await seedWriter(db, VICTIM, 'vera');
  const attacker = await seedWriter(db, ATTACKER, 'mallory');
  await db.query(`insert into public.deleted_accounts (original_user_id, email, display_name) values (gen_random_uuid(), 'gone@harness.test', 'Gone Writer')`);
  await db.query(`insert into public.founder_notes (author_id, content) values ($1, 'private founder note')`, [ADMIN]);
  await db.query(`insert into public.analytics_excluded_users (user_id, reason, created_by) values ($1, 'founder', $1)`, [ADMIN]);
  await db.query(`insert into public.beta_waitlist (email, name, writes) values ('hopeful@harness.test', 'Hope', 'fantasy')`);
  await db.query(`insert into public.beta_access (email) values ('invited@harness.test')`);
  return { db, victim, attacker };
}
