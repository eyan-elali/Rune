// Security audit (G): Row Level Security on every public table of the Rune 2.0
// schema, through real Postgres (PGlite) as PostgREST runs it — one
// transaction per request, `set local role` + the JWT claims.
//
// A malicious authenticated writer (the ATTACKER) and a signed-out browser
// (anon), both with only the public client credentials, must not read,
// infer, modify, delete or enumerate another writer's (the VICTIM's) rows or
// admin state — in every state, trashed included. Every attack is followed by
// a whole-database digest comparison (as the superuser): nothing changed.
//
// Seeded through the real RPCs: tools/sync-harness/lib/security-fixture.mjs.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACKER, VICTIM, ADMIN, securityDb, snapshot, diffSnapshots, publicTables, as, anon, doc } from '../lib/security-fixture.mjs';

let db, victim, attacker, baseline, tables;
before(async () => {
  ({ db, victim, attacker } = await securityDb());
  tables = await publicTables(db);
  baseline = await snapshot(db);
});

const unchanged = async (what) => {
  const changed = diffSnapshots(baseline, await snapshot(db));
  assert.deepEqual(changed, [], `${what}: these tables changed: ${changed.join(', ')}`);
};
const count = async (sb, table, filter) => {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = q.eq(filter[0], filter[1]);
  const r = await q;
  if (r.error) return { error: r.error };
  return { count: r.count };
};

// ── The catalog itself ──────────────────────────────────────────────────────

test('every public table has RLS enabled; none is left open to anon or authenticated without a policy that scopes it', async () => {
  const res = await db.query(`
    select c.relname, c.relrowsecurity,
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);
  for (const r of res.rows) assert.equal(r.relrowsecurity, true, `${r.relname} has no RLS`);
  // Tables with no policy at all are closed to every client role (RLS denies by default).
  const closed = res.rows.filter((r) => r.policies === 0).map((r) => r.relname);
  assert.deepEqual(closed, [
    'acquisition_attribution', 'analytics_events', 'analytics_excluded_users', 'beta_access', 'beta_waitlist',
    'deleted_accounts', 'founder_notes', 'scene_revision_notes_038', 'schema_migrations',
  ]);
  // No policy grants a row to a role by anything but auth.uid() (directly or via the owner's Project).
  const pol = await db.query(`select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public'`);
  for (const p of pol.rows) {
    const body = `${p.qual ?? ''} ${p.with_check ?? ''}`;
    assert.match(body, /auth\.uid\(\)/, `${p.tablename}.${p.policyname} does not scope rows by auth.uid()`);
    assert.doesNotMatch(body, /\btrue\b\s*$/, `${p.tablename}.${p.policyname} ends in an unconditional true`);
  }
  assert.ok(pol.rows.every((p) => p.qual !== 'true' && p.with_check !== 'true'));
});

test('no view or materialized view exists in public (nothing bypasses the tables\' RLS)', async () => {
  const res = await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm')`);
  assert.deepEqual(res.rows, []);
});

// ── Reading ─────────────────────────────────────────────────────────────────

test('the attacker reads no row of the victim in any table; every row the attacker can read is their own', async () => {
  const sb = as(db, ATTACKER);
  const mine = new Set([attacker.project, attacker.trashedProject]);
  const myManuscripts = new Set((await db.query(`select id from public.manuscripts where project_id = any($1)`, [[...mine]])).rows.map((r) => r.id));
  const own = {
    user_id: (r) => r.user_id === ATTACKER,
    id_is_user: (r) => r.id === ATTACKER,
    project_id: (r) => mine.has(r.project_id),
    manuscript_id: (r) => myManuscripts.has(r.manuscript_id),
    canvas_id: (r) => r.canvas_id === attacker.canvas,
    milestone_id: (r) => r.milestone_id === attacker.milestone,
    collection_id: (r) => r.collection_id === attacker.collection,
    entry_id: (r) => r.entry_id === attacker.entry,
    scene_id: (r) => [attacker.scene, attacker.scene2, attacker.unplaced].includes(r.scene_id),
  };
  const scope = {
    profiles: own.id_is_user, user_pricing_entitlements: own.user_id, account_onboarding: own.user_id, subscription_events: own.user_id,
    writing_sessions: own.user_id, writing_goals: own.user_id, future_letters: own.user_id, project_notes: own.user_id,
    game_sessions: own.user_id, game_tickets: own.user_id, xp_events: own.user_id, user_unlockables: own.user_id, project_storage_purges: own.user_id,
    projects: own.user_id, manuscripts: own.project_id, chapters: own.manuscript_id, scenes: own.manuscript_id, manuscript_groups: own.manuscript_id,
    manuscript_milestones: own.manuscript_id, manuscript_milestone_scenes: own.milestone_id, scene_revisions: own.manuscript_id,
    scene_property_definitions: own.project_id, scene_property_values: own.project_id, scene_views: own.project_id, revision_notes: own.project_id,
    object_references: own.project_id, workspace_documents: own.project_id, workspace_folders: own.project_id, workspace_collections: own.project_id,
    workspace_collection_entries: own.project_id, workspace_collection_properties: own.project_id, workspace_collection_views: own.project_id,
    workspace_entry_values: own.project_id, workspace_nodes: own.project_id, workspace_canvases: own.project_id, workspace_canvas_items: own.project_id,
    workspace_canvas_connections: own.project_id, workspace_attachments: own.project_id,
  };
  for (const t of tables) {
    const r = await sb.from(t).select('*');
    if (r.error) {
      // No SELECT grant at all (beta_access, beta_waitlist, schema_migrations, scene_revision_notes_038, beta_feedback).
      assert.equal(r.error.code, '42501', `${t}: ${r.error.message}`);
      continue;
    }
    const rows = r.data;
    if (!(t in scope)) {
      assert.equal(rows.length, 0, `${t}: ${rows.length} rows readable with the public client (expected none)`);
      continue;
    }
    for (const row of rows) assert.ok(scope[t](row), `${t}: a row not the attacker's is readable: ${JSON.stringify(row).slice(0, 200)}`);
    assert.ok(rows.length > 0, `${t}: the attacker should see their own rows (the fixture seeds some)`);
  }
});

test('reading by the victim\'s ids returns nothing: no existence oracle through filters, counts or single-row reads', async () => {
  const sb = as(db, ATTACKER);
  const probes = [
    ['projects', 'id', victim.project], ['projects', 'id', victim.trashedProject], ['manuscripts', 'id', victim.manuscript],
    ['chapters', 'id', victim.chapter], ['chapters', 'id', victim.trashedChapter], ['scenes', 'id', victim.scene], ['scenes', 'id', victim.trashedScene],
    ['scenes', 'chapter_id', victim.chapter], ['scenes', 'manuscript_id', victim.manuscript], ['manuscript_groups', 'id', victim.group],
    ['workspace_documents', 'id', victim.page], ['workspace_documents', 'id', victim.trashedPage], ['workspace_folders', 'id', victim.folder],
    ['workspace_collections', 'id', victim.collection], ['workspace_collection_entries', 'id', victim.entry], ['workspace_collection_entries', 'id', victim.trashedEntry],
    ['workspace_collection_properties', 'id', victim.property], ['workspace_collection_views', 'id', victim.view], ['workspace_entry_values', 'entry_id', victim.entry],
    ['workspace_nodes', 'project_id', victim.project], ['workspace_canvases', 'id', victim.canvas], ['workspace_canvas_items', 'canvas_id', victim.canvas],
    ['workspace_canvas_connections', 'id', victim.connection], ['workspace_attachments', 'id', victim.attachment],
    ['scene_property_definitions', 'id', victim.sceneProperty], ['scene_property_values', 'scene_id', victim.scene], ['scene_views', 'id', victim.sceneView],
    ['object_references', 'id', victim.link], ['revision_notes', 'id', victim.note], ['manuscript_milestones', 'id', victim.milestone],
    ['manuscript_milestone_scenes', 'milestone_id', victim.milestone], ['scene_revisions', 'id', victim.revision], ['scene_revisions', 'scene_id', victim.scene],
    ['writing_sessions', 'user_id', VICTIM], ['writing_goals', 'user_id', VICTIM], ['future_letters', 'user_id', VICTIM], ['project_notes', 'user_id', VICTIM],
    ['game_sessions', 'user_id', VICTIM], ['game_tickets', 'user_id', VICTIM], ['xp_events', 'user_id', VICTIM], ['user_unlockables', 'user_id', VICTIM],
    ['project_storage_purges', 'user_id', VICTIM], ['subscription_events', 'user_id', VICTIM], ['user_pricing_entitlements', 'user_id', VICTIM],
    ['account_onboarding', 'user_id', VICTIM], ['profiles', 'id', VICTIM], ['profiles', 'id', ADMIN], ['profiles', 'is_admin', true],
    ['analytics_events', 'user_id', VICTIM], ['acquisition_attribution', 'user_id', VICTIM], ['deleted_accounts', 'email', 'gone@harness.test'],
    ['founder_notes', 'author_id', ADMIN], ['analytics_excluded_users', 'user_id', ADMIN],
  ];
  for (const [t, col, v] of probes) {
    const r = await count(sb, t, [col, v]);
    assert.equal(r.count, 0, `${t}.${col} = ${v}: ${r.count} rows (${r.error?.message ?? ''})`);
    const single = await sb.from(t).select('*').eq(col, v).maybeSingle();
    assert.equal(single.data, null, `${t}.${col} maybeSingle`);
  }
  for (const t of ['beta_access', 'beta_waitlist', 'beta_feedback', 'schema_migrations', 'scene_revision_notes_038']) {
    const r = await count(sb, t);
    assert.equal(r.error?.code, '42501', `${t} must have no SELECT grant for authenticated`);
  }
});

test('anon reads nothing from any table', async () => {
  const sb = anon(db);
  for (const t of tables) {
    const r = await sb.from(t).select('*');
    if (r.error) { assert.equal(r.error.code, '42501', `${t}: ${r.error.message}`); continue; }
    assert.equal(r.data.length, 0, `${t}: anon reads ${r.data.length} rows`);
  }
});

// ── Writing ─────────────────────────────────────────────────────────────────

test('UPDATE by the victim\'s ids touches no row, in every state (active, trashed, admin, billing)', async () => {
  const sb = as(db, ATTACKER);
  const attempts = [
    ['profiles', 'id', VICTIM, { display_name: 'pwned' }], ['profiles', 'id', ADMIN, { is_admin: false }],
    ['projects', 'id', victim.project, { title: 'pwned' }], ['projects', 'id', victim.project, { user_id: ATTACKER }],
    ['projects', 'id', victim.trashedProject, { trashed_at: null }], ['manuscripts', 'id', victim.manuscript, { project_id: attacker.project }],
    ['chapters', 'id', victim.chapter, { title: 'pwned' }], ['chapters', 'id', victim.chapter, { manuscript_id: attacker.manuscript }],
    ['chapters', 'id', victim.trashedChapter, { trashed_at: null }],
    ['scenes', 'id', victim.scene, { content: doc('pwned'), word_count: 1 }], ['scenes', 'id', victim.scene, { chapter_id: attacker.chapter }],
    ['scenes', 'id', victim.scene, { manuscript_id: attacker.manuscript, chapter_id: attacker.chapter }],
    ['scenes', 'id', victim.trashedScene, { trashed_at: null }], ['scenes', 'id', victim.sceneInTrashedChapter, { trashed_at: null, trashed_with_chapter: false }],
    ['manuscript_groups', 'id', victim.group, { title: 'pwned' }],
    ['workspace_documents', 'id', victim.page, { content: doc('pwned') }], ['workspace_documents', 'id', victim.page, { project_id: attacker.project }],
    ['workspace_documents', 'id', victim.trashedPage, { trashed_at: null }],
    ['workspace_folders', 'id', victim.folder, { title: 'pwned' }], ['workspace_collections', 'id', victim.collection, { title: 'pwned' }],
    ['workspace_collection_entries', 'id', victim.entry, { title: 'pwned' }], ['workspace_collection_entries', 'id', victim.trashedEntry, { trashed_at: null }],
    ['workspace_collection_entries', 'id', victim.entry, { collection_id: attacker.collection, project_id: attacker.project }],
    ['workspace_collection_properties', 'id', victim.property, { name: 'pwned' }], ['workspace_collection_views', 'id', victim.view, { name: 'pwned' }],
    ['workspace_entry_values', 'entry_id', victim.entry, { value: '"pwned"' }], ['workspace_nodes', 'id', victim.pageNode, { parent_node_id: null }],
    ['workspace_canvases', 'id', victim.canvas, { title: 'pwned' }], ['workspace_canvas_items', 'id', victim.canvasNote, { content: doc('pwned') }],
    ['workspace_canvas_items', 'id', victim.canvasSceneItem, { canvas_id: attacker.canvas }],
    ['workspace_canvas_connections', 'id', victim.connection, { label: 'pwned' }], ['workspace_attachments', 'id', victim.attachment, { project_id: attacker.project }],
    ['scene_property_definitions', 'id', victim.sceneProperty, { name: 'pwned' }], ['scene_property_values', 'scene_id', victim.scene, { value: '"pwned"' }],
    ['scene_views', 'id', victim.sceneView, { name: 'pwned' }], ['object_references', 'id', victim.link, { position: 99 }],
    ['revision_notes', 'id', victim.note, { body: 'pwned' }], ['manuscript_milestones', 'id', victim.milestone, { name: 'pwned' }],
    ['manuscript_milestone_scenes', 'milestone_id', victim.milestone, { position: 99 }], ['scene_revisions', 'id', victim.revision, { content: doc('pwned') }],
    ['writing_sessions', 'user_id', VICTIM, { words_added: 0 }], ['writing_goals', 'user_id', VICTIM, { target_words: 1 }],
    ['future_letters', 'user_id', VICTIM, { content: 'pwned' }], ['project_notes', 'user_id', VICTIM, { content: 'pwned' }],
    ['game_sessions', 'user_id', VICTIM, { words_written: 0 }], ['game_tickets', 'user_id', VICTIM, { tickets_used: 99 }],
    ['xp_events', 'user_id', VICTIM, { amount: 0 }], ['user_unlockables', 'user_id', VICTIM, { unlockable_id: 'none' }],
    ['project_storage_purges', 'user_id', VICTIM, { storage_keys: [] }], ['subscription_events', 'user_id', VICTIM, { status: 'canceled' }],
    ['user_pricing_entitlements', 'user_id', VICTIM, { pricing_cohort: 'legacy_15k' }], ['user_pricing_entitlements', 'user_id', ATTACKER, { pricing_cohort: 'legacy_15k' }],
    ['account_onboarding', 'user_id', VICTIM, { completed_at: null }], ['account_onboarding', 'user_id', ATTACKER, { completed_at: null }],
    ['analytics_events', 'user_id', VICTIM, { event_name: 'x' }], ['acquisition_attribution', 'user_id', VICTIM, { source: 'x' }],
    ['deleted_accounts', 'email', 'gone@harness.test', { email: 'x' }], ['founder_notes', 'author_id', ADMIN, { content: 'x' }],
    ['analytics_excluded_users', 'user_id', ADMIN, { reason: 'x' }],
    ['beta_access', 'email', 'invited@harness.test', { user_id: ATTACKER }], ['beta_access', 'user_id', VICTIM, { user_id: ATTACKER }],
    ['beta_waitlist', 'email', 'hopeful@harness.test', { email: 'x' }], ['beta_feedback', 'user_id', VICTIM, { body: 'x' }],
    ['schema_migrations', 'version', '053', { note: 'x' }],
  ];
  for (const [t, col, v, patch] of attempts) {
    const r = await sb.from(t).update(patch).eq(col, v).select('*');
    if (r.error) { assert.ok(['42501'].includes(r.error.code), `${t} update: unexpected ${r.error.code} ${r.error.message}`); continue; }
    assert.equal(r.data.length, 0, `${t}.${col} = ${v}: UPDATE changed ${r.data.length} rows`);
  }
  await unchanged('UPDATE attempts');
});

test('DELETE by the victim\'s ids removes nothing, trashed rows and purge records included', async () => {
  const sb = as(db, ATTACKER);
  const targets = [
    ['projects', 'id', victim.project], ['projects', 'id', victim.trashedProject], ['manuscripts', 'id', victim.manuscript],
    ['chapters', 'id', victim.chapter], ['chapters', 'id', victim.trashedChapter], ['scenes', 'id', victim.scene], ['scenes', 'id', victim.trashedScene],
    ['manuscript_groups', 'id', victim.group], ['workspace_documents', 'id', victim.page], ['workspace_documents', 'id', victim.trashedPage],
    ['workspace_folders', 'id', victim.folder], ['workspace_collections', 'id', victim.collection], ['workspace_collection_entries', 'id', victim.entry],
    ['workspace_collection_entries', 'id', victim.trashedEntry], ['workspace_collection_properties', 'id', victim.property], ['workspace_collection_views', 'id', victim.view],
    ['workspace_entry_values', 'entry_id', victim.entry], ['workspace_nodes', 'project_id', victim.project], ['workspace_canvases', 'id', victim.canvas],
    ['workspace_canvas_items', 'canvas_id', victim.canvas], ['workspace_canvas_connections', 'id', victim.connection], ['workspace_attachments', 'id', victim.attachment],
    ['scene_property_definitions', 'id', victim.sceneProperty], ['scene_property_values', 'scene_id', victim.scene], ['scene_views', 'id', victim.sceneView],
    ['object_references', 'project_id', victim.project], ['revision_notes', 'project_id', victim.project], ['manuscript_milestones', 'id', victim.milestone],
    ['manuscript_milestone_scenes', 'milestone_id', victim.milestone], ['scene_revisions', 'manuscript_id', victim.manuscript],
    ['writing_sessions', 'user_id', VICTIM], ['writing_goals', 'user_id', VICTIM], ['future_letters', 'user_id', VICTIM], ['project_notes', 'user_id', VICTIM],
    ['game_sessions', 'user_id', VICTIM], ['game_tickets', 'user_id', VICTIM], ['xp_events', 'user_id', VICTIM], ['user_unlockables', 'user_id', VICTIM],
    ['project_storage_purges', 'user_id', VICTIM], ['subscription_events', 'user_id', VICTIM], ['user_pricing_entitlements', 'user_id', VICTIM],
    ['account_onboarding', 'user_id', VICTIM], ['profiles', 'id', VICTIM], ['profiles', 'id', ADMIN],
    ['analytics_events', 'user_id', VICTIM], ['acquisition_attribution', 'user_id', VICTIM], ['deleted_accounts', 'email', 'gone@harness.test'],
    ['founder_notes', 'author_id', ADMIN], ['analytics_excluded_users', 'user_id', ADMIN], ['beta_access', 'email', 'invited@harness.test'],
    ['beta_access', 'user_id', VICTIM], ['beta_waitlist', 'email', 'hopeful@harness.test'], ['beta_feedback', 'user_id', VICTIM], ['schema_migrations', 'version', '053'],
  ];
  for (const [t, col, v] of targets) {
    const r = await sb.from(t).delete().eq(col, v).select('*');
    if (r.error) { assert.equal(r.error.code, '42501', `${t} delete: ${r.error.message}`); continue; }
    assert.equal(r.data.length, 0, `${t}.${col} = ${v}: DELETE removed ${r.data.length} rows`);
  }
  await unchanged('DELETE attempts');
});

test('INSERT as the victim (their user_id, Project, Manuscript or Collection) is refused everywhere', async () => {
  const sb = as(db, ATTACKER);
  const inserts = [
    ['profiles', { id: crypto.randomUUID(), display_name: 'ghost' }],
    ['user_pricing_entitlements', { user_id: ATTACKER, pricing_cohort: 'legacy_15k' }],
    ['projects', { user_id: VICTIM, title: 'planted' }], ['projects', { user_id: ATTACKER, title: 'direct' }],
    ['manuscripts', { project_id: victim.project }], ['chapters', { manuscript_id: victim.manuscript, title: 'planted', position: 50 }],
    ['scenes', { manuscript_id: victim.manuscript, chapter_id: victim.chapter, title: 'planted', content: doc('planted'), word_count: 1, position: 50 }],
    ['scenes', { manuscript_id: attacker.manuscript, chapter_id: victim.chapter, title: 'planted', content: doc('planted'), word_count: 1, position: 50 }],
    ['manuscript_groups', { manuscript_id: victim.manuscript, title: 'planted', position: 50 }],
    ['workspace_documents', { project_id: victim.project, title: 'planted' }], ['workspace_folders', { project_id: victim.project, title: 'planted' }],
    ['workspace_collections', { project_id: victim.project, title: 'planted' }], ['workspace_canvases', { project_id: victim.project, title: 'planted' }],
    ['workspace_collection_entries', { project_id: victim.project, collection_id: victim.collection, title: 'planted' }],
    ['workspace_collection_entries', { project_id: attacker.project, collection_id: victim.collection, title: 'planted' }],
    ['workspace_collection_properties', { project_id: victim.project, collection_id: victim.collection, name: 'planted', type: 'text', position: 50 }],
    ['workspace_collection_views', { project_id: victim.project, collection_id: victim.collection, name: 'planted', type: 'list', position: 50, config: {} }],
    ['workspace_entry_values', { project_id: victim.project, collection_id: victim.collection, entry_id: victim.entry2, property_id: victim.property, value: '"x"' }],
    ['workspace_nodes', { project_id: victim.project, target_type: 'folder', folder_id: victim.folder, position: 50 }],
    ['workspace_canvas_items', { project_id: victim.project, canvas_id: victim.canvas, item_type: 'note', content: doc('x'), x: 0, y: 0, width: 10, height: 10 }],
    ['workspace_canvas_items', { project_id: attacker.project, canvas_id: attacker.canvas, item_type: 'scene', scene_id: victim.scene, x: 0, y: 0, width: 10, height: 10 }],
    ['workspace_canvas_connections', { project_id: victim.project, canvas_id: victim.canvas, source_item_id: victim.canvasNote, target_item_id: victim.imageItem }],
    ['workspace_attachments', { id: crypto.randomUUID(), project_id: victim.project, kind: 'image', file_name: 'x.png', mime_type: 'image/png', byte_size: 1, width: 1, height: 1, storage_bucket: 'workspace-attachments', storage_key: 'x/original.png' }],
    ['scene_property_definitions', { project_id: victim.project, manuscript_id: victim.manuscript, name: 'planted', type: 'text', position: 50 }],
    ['scene_property_values', { project_id: victim.project, manuscript_id: victim.manuscript, scene_id: victim.scene2, property_id: victim.sceneProperty, value: '"x"' }],
    ['scene_views', { project_id: victim.project, manuscript_id: victim.manuscript, name: 'planted', type: 'list', position: 50, config: {} }],
    ['object_references', { project_id: victim.project, source_type: 'page', source_document_id: victim.page, target_type: 'scene', target_scene_id: victim.scene2, position: 50 }],
    ['object_references', { project_id: attacker.project, source_type: 'page', source_document_id: attacker.page, target_type: 'scene', target_scene_id: victim.scene, position: 50 }],
    ['revision_notes', { project_id: victim.project, manuscript_id: victim.manuscript, target_type: 'manuscript', target_id: victim.manuscript, body: 'planted' }],
    ['manuscript_milestones', { manuscript_id: victim.manuscript, name: 'planted', structure: {}, manuscript_words: 0, unplaced_words: 0, scene_count: 0 }],
    ['manuscript_milestone_scenes', { milestone_id: victim.milestone, scene_id: victim.scene, revision_id: victim.revision, position: 50 }],
    ['scene_revisions', { manuscript_id: victim.manuscript, scene_id: victim.scene, title: 'x', content: doc('x'), word_count: 1, saved_at: new Date().toISOString(), reason: 'checkpoint' }],
    ['writing_sessions', { user_id: VICTIM, project_id: victim.project, words_added: 1000 }], ['writing_goals', { user_id: VICTIM, type: 'daily_global', target_words: 1 }],
    ['future_letters', { user_id: VICTIM, project_id: victim.project, content: 'planted' }], ['project_notes', { user_id: VICTIM, project_id: victim.project, content: 'planted' }],
    ['game_sessions', { user_id: VICTIM, mode: 'race' }], ['game_tickets', { user_id: VICTIM, week_start: '2026-10-05', tickets_used: 9 }],
    ['xp_events', { user_id: VICTIM, amount: -1000, reason: 'drain' }], ['user_unlockables', { user_id: VICTIM, unlockable_id: 'planted' }],
    ['project_storage_purges', { user_id: VICTIM, project_id: victim.project, storage_bucket: 'workspace-attachments', storage_keys: ['x'] }],
    ['project_storage_purges', { user_id: ATTACKER, project_id: victim.project, storage_bucket: 'workspace-attachments', storage_keys: [`${victim.project}/${victim.attachment}/original.png`] }],
    ['subscription_events', { user_id: ATTACKER, stripe_event_id: 'evt_forged', event_type: 'customer.subscription.created', tier: 'scribe', status: 'active' }],
    ['account_onboarding', { user_id: VICTIM }], ['analytics_events', { user_id: VICTIM, event_name: 'subscription_started' }],
    ['acquisition_attribution', { user_id: VICTIM, source: 'x' }], ['deleted_accounts', { original_user_id: VICTIM }],
    ['founder_notes', { author_id: ATTACKER, content: 'x' }], ['analytics_excluded_users', { user_id: ATTACKER }],
    ['beta_access', { email: 'mallory2@harness.test' }], ['beta_waitlist', { email: 'x@harness.test' }],
    ['beta_feedback', { user_id: VICTIM, body: 'planted' }], ['schema_migrations', { version: '999', name: 'x' }],
  ];
  for (const [t, row] of inserts) {
    const r = await sb.from(t).insert(row).select('*');
    assert.ok(r.error, `${t}: INSERT as/for the victim succeeded: ${JSON.stringify(r.data)}`);
    assert.ok(['42501', '23503', '23514', '23505'].includes(r.error.code), `${t}: ${r.error.code} ${r.error.message}`);
  }
  await unchanged('INSERT attempts');
});

test('anon can write nothing', async () => {
  const sb = anon(db);
  for (const t of tables) {
    const u = await sb.from(t).update({}).eq('id', victim.project).select('*');
    if (!u.error) assert.equal(u.data.length, 0, `${t}: anon UPDATE`);
    const d = await sb.from(t).delete().eq('user_id', VICTIM).select('*');
    if (!d.error) assert.equal(d.data.length, 0, `${t}: anon DELETE`);
  }
  for (const [t, row] of [
    ['projects', { user_id: VICTIM, title: 'anon' }], ['scenes', { manuscript_id: victim.manuscript, title: 'anon', position: 77 }],
    ['writing_sessions', { user_id: VICTIM, words_added: 1 }], ['beta_waitlist', { email: 'anon@harness.test' }], ['beta_feedback', { user_id: VICTIM, body: 'anon' }],
    ['analytics_events', { event_name: 'anon' }], ['future_letters', { user_id: VICTIM, project_id: victim.project, content: 'anon' }],
  ]) {
    const r = await sb.from(t).insert(row);
    assert.ok(r.error, `${t}: anon INSERT succeeded`);
  }
  await unchanged('anon writes');
});

// ── Admin and billing state on the writer's own profile ─────────────────────

test('profiles.is_admin and the billing columns cannot be set by the writer, not even on their own row', async () => {
  const sb = as(db, ATTACKER);
  const before = (await db.query(`select is_admin, subscription_tier, subscription_status, subscription_price_id, subscription_period_end, stripe_customer_id from public.profiles where id = $1`, [ATTACKER])).rows[0];
  const r = await sb.from('profiles').update({
    is_admin: true, subscription_tier: 'scribe', subscription_status: 'active', subscription_price_id: 'price_forged',
    subscription_period_end: '2099-01-01T00:00:00Z', stripe_customer_id: 'cus_forged', display_name: 'Mallory the Great',
  }).eq('id', ATTACKER).select('*').single();
  assert.equal(r.error, null, r.error?.message);
  assert.equal(r.data.display_name, 'Mallory the Great', 'an ordinary own-profile edit still works');
  const after = (await db.query(`select is_admin, subscription_tier, subscription_status, subscription_price_id, subscription_period_end, stripe_customer_id from public.profiles where id = $1`, [ATTACKER])).rows[0];
  assert.deepEqual(after, before, 'the protected columns were changed');
  assert.equal(after.is_admin, false);
  // Through a pure column update as well (no other column in the statement).
  const only = await sb.from('profiles').update({ is_admin: true }).eq('id', ATTACKER).select('is_admin').single();
  assert.equal(only.data.is_admin, false);
  // And the admin's row cannot be reached.
  assert.equal((await db.query(`select is_admin from public.profiles where id = $1`, [ADMIN])).rows[0].is_admin, true);
  await db.query(`update public.profiles set display_name = 'Mallory' where id = $1`, [ATTACKER]);
  baseline = await snapshot(db);
});

test('the writer cannot give themselves beta access, approve an invitation or read the waitlist; claim_beta_access only ever claims their own email', async () => {
  const sb = as(db, ATTACKER);
  for (const t of ['beta_access', 'beta_waitlist']) {
    assert.equal((await sb.from(t).select('*')).error?.code, '42501', `${t} select`);
    assert.equal((await sb.from(t).insert({ email: 'me@harness.test' })).error?.code, '42501', `${t} insert`);
    assert.equal((await sb.from(t).update({ email: 'mallory@harness.test' }).eq('email', 'invited@harness.test')).error?.code, '42501', `${t} update`);
    assert.equal((await sb.from(t).delete().eq('email', 'invited@harness.test')).error?.code, '42501', `${t} delete`);
  }
  const claim = await sb.rpc('claim_beta_access', {});
  assert.equal(claim.data, 'member');
  const state = await sb.rpc('beta_access_state', { p_user: VICTIM, p_claim: true });
  assert.equal(state.error?.code, '42501', 'beta_access_state is not callable by writers');
  const hook = await sb.rpc('beta_before_user_created', { event: { user: { email: 'invited@harness.test' } } });
  assert.equal(hook.error?.code, '42501', 'the auth hook is not callable by writers');
  assert.equal((await db.query(`select user_id from public.beta_access where email = 'invited@harness.test'`)).rows[0].user_id, null);
  await unchanged('beta attempts');
});

test('the writer can read and send feedback only as themselves, and cannot read anyone\'s feedback back', async () => {
  const sb = as(db, ATTACKER);
  assert.equal((await sb.from('beta_feedback').select('*')).error?.code, '42501');
  assert.equal((await sb.from('beta_feedback').insert({ user_id: VICTIM, body: 'as vera' })).error?.code, '42501');
  const mine = await sb.from('beta_feedback').insert({ user_id: ATTACKER, category: 'idea', body: 'own feedback' });
  assert.equal(mine.error, null, mine.error?.message);
  await db.query(`delete from public.beta_feedback where body = 'own feedback'`);
  await unchanged('feedback attempts');
});

// ── Trash and purge paths ───────────────────────────────────────────────────

test('trashed rows are invisible to their owner through RLS too, and only the RPCs bring them back', async () => {
  const sb = as(db, VICTIM);
  for (const [t, id] of [['scenes', victim.trashedScene], ['chapters', victim.trashedChapter], ['workspace_documents', victim.trashedPage], ['workspace_collection_entries', victim.trashedEntry]]) {
    assert.equal((await count(sb, t, ['id', id])).count, 0, `${t}: the owner reads a trashed row directly`);
    const r = await sb.from(t).update({ trashed_at: null }).eq('id', id).select('id');
    assert.equal(r.data?.length ?? 0, 0, `${t}: the owner restored a row by direct UPDATE`);
  }
  // A writer cannot trash a row by direct UPDATE either (trashed_at is set only by the RPCs).
  const trash = await sb.from('scenes').update({ trashed_at: new Date().toISOString(), chapter_id: null }).eq('id', victim.scene2).select('id');
  assert.equal(trash.data?.length ?? 0, 0);
  const project = await sb.from('projects').update({ trashed_at: new Date().toISOString() }).eq('id', victim.project);
  assert.equal(project.error?.code, '42501', 'projects.trashed_at is guarded by a trigger');
  await unchanged('owner trash attempts');
});

test('a purge record (object-storage keys owed a removal) is readable and deletable only by its owner', async () => {
  const sb = as(db, ATTACKER);
  assert.equal((await count(sb, 'project_storage_purges', ['id', victim.purge])).count, 0);
  assert.equal((await sb.from('project_storage_purges').delete().eq('id', victim.purge).select('id')).data.length, 0);
  assert.equal((await sb.from('project_storage_purges').update({ storage_keys: [] }).eq('id', victim.purge)).error?.code, '42501', 'no UPDATE grant');
  const own = await sb.from('project_storage_purges').select('id').eq('id', attacker.purge);
  assert.equal(own.data.length, 1);
  await unchanged('purge attempts');
});

test('a Project\'s word_count and a Chapter\'s or Group\'s placement cannot be rewritten directly by its own writer', async () => {
  const sb = as(db, VICTIM);
  assert.equal((await sb.from('projects').update({ word_count: 999999 }).eq('id', victim.project)).error?.code, '42501');
  assert.equal((await sb.from('chapters').update({ position: 0, group_id: victim.group }).eq('id', victim.chapter)).error?.code, '42501');
  assert.equal((await sb.from('manuscript_groups').update({ position: 7 }).eq('id', victim.group)).error?.code, '42501');
  // A Scene cannot be moved under a Chapter of another Manuscript (composite foreign key).
  const r = await sb.from('scenes').update({ chapter_id: attacker.chapter }).eq('id', victim.scene);
  assert.ok(r.error, 'a Scene changed Manuscript through chapter_id');
  await unchanged('direct structure edits');
});
