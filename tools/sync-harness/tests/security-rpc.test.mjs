// Security audit (H): every Postgres function a client can call on the Rune
// 2.0 schema, called as a malicious authenticated writer (the ATTACKER) and
// as a signed-out browser (anon) with the VICTIM's ids and forged ids —
// through real Postgres (PGlite) as PostgREST runs it.
//
//   * catalog: every SECURITY DEFINER function pins search_path; the only
//     functions anon can call are the three the front door needs; the
//     helpers the RPCs build on are not callable at all
//   * every RPC that takes an id refuses the victim's, in both directions
//     (victim object into attacker container, attacker object into victim
//     container), and writes nothing — proven by a whole-database digest
//   * no RPC leaks another writer's data: not a title, not a count, not
//     whether an id exists
//
// Seeded through the real RPCs: tools/sync-harness/lib/security-fixture.mjs.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACKER, VICTIM, ADMIN, securityDb, snapshot, diffSnapshots, as, anon, doc } from '../lib/security-fixture.mjs';

let db, victim, attacker, baseline, sb;
before(async () => {
  ({ db, victim, attacker } = await securityDb());
  sb = as(db, ATTACKER);
  baseline = await snapshot(db);
});

const unchanged = async (what) => {
  const changed = diffSnapshots(baseline, await snapshot(db));
  assert.deepEqual(changed, [], `${what}: these tables changed: ${changed.join(', ')}`);
};
const rebase = async () => { baseline = await snapshot(db); };

/** Calls an RPC as the attacker and asserts it was refused: an error status, a "missing"-type status, or a Postgres error — never a leak. */
async function refused(fn, args, { statuses = ['error', 'missing', 'unavailable', 'stale'], errorCodes = ['42501', '23503', '23514', 'P0001', '22023', '23505'] } = {}) {
  const r = await sb.rpc(fn, args);
  if (r.error) {
    assert.ok(errorCodes.includes(r.error.code), `${fn}: unexpected error ${r.error.code} ${r.error.message}`);
    return r;
  }
  const d = r.data;
  assert.ok(d && typeof d === 'object' && !Array.isArray(d), `${fn}: ${JSON.stringify(d)}`);
  assert.ok(statuses.includes(d.status), `${fn}(${JSON.stringify(args).slice(0, 120)}) answered ${JSON.stringify(d).slice(0, 300)}`);
  const text = JSON.stringify(d);
  assert.doesNotMatch(text, /vera/i, `${fn} leaked the victim's text: ${text.slice(0, 200)}`);
  return r;
}

// ── The catalog ─────────────────────────────────────────────────────────────

test('every SECURITY DEFINER function in public pins its search_path', async () => {
  const res = await db.query(`
    select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
     order by 1`);
  assert.deepEqual(res.rows.map((r) => r.proname), [], 'SECURITY DEFINER functions without a pinned search_path');
});

test('every function in public pins its search_path (trigger functions included)', async () => {
  const res = await db.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
     order by 1`);
  assert.deepEqual(res.rows.map((r) => r.proname), []);
});

test('anon can call only the front-door functions; every other function needs a signed-in writer or the server', async () => {
  const res = await db.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
       and (has_function_privilege('anon', p.oid, 'execute'))
     order by 1`);
  assert.deepEqual(res.rows.map((r) => r.proname), ['free_word_limit_for_caller', 'join_beta_waitlist', 'lock_account_word_budget']);
  // Of those, the two legacy ones refuse a signed-out caller outright.
  const a = anon(db);
  assert.equal((await a.rpc('free_word_limit_for_caller', {})).error?.code, 'P0001');
  assert.equal((await a.rpc('lock_account_word_budget', {})).error?.code, 'P0001');
});

test('the internal helpers (ownership resolvers, placement, pruning, import, beta state, trash primitives) are not callable by writers', async () => {
  const internal = [
    ['beta_access_state', { p_user: VICTIM, p_claim: true }], ['beta_before_user_created', { event: {} }],
    ['trash_manuscript_scene', { p_id: victim.scene }], ['restore_manuscript_scene', { p_id: victim.trashedScene }],
    ['delete_trashed_manuscript_scene', { p_id: victim.trashedScene }], ['trash_manuscript_chapter', { p_id: victim.chapter }],
    ['restore_manuscript_chapter', { p_id: victim.trashedChapter }], ['delete_trashed_manuscript_chapter', { p_id: victim.trashedChapter }],
    ['import_manuscript_items', { p_manuscript_id: victim.manuscript, p_parent_group_id: null, p_items: [] }], ['import_manuscript_shape', { p_items: [], p_depth: 0 }],
    ['lock_project_workspace', { p_project_id: victim.project }], ['owned_project_manuscript', { p_project_id: victim.project }],
    ['owned_workspace_object_project', { p_type: 'page', p_id: victim.page }], ['prune_scene_revisions', { p_scene_id: victim.scene }],
    ['next_structure_position', { p_manuscript_id: victim.manuscript, p_parent_group_id: null }],
    ['place_in_manuscript_structure', { p_manuscript_id: victim.manuscript, p_parent_group_id: null, p_kind: 'chapter', p_id: victim.chapter, p_index: 0 }],
    ['place_workspace_node', { p_node_id: victim.pageNode, p_parent_node_id: null, p_index: 0 }],
    ['renumber_workspace_siblings', { p_project_id: victim.project, p_parent_node_id: null }],
    ['revision_note_target_active', { p_target_type: 'scene', p_target_id: victim.scene }], ['revision_note_anchor_valid', { p_anchor: {} }],
  ];
  for (const [fn, args] of internal) {
    const r = await sb.rpc(fn, args);
    assert.equal(r.error?.code, '42501', `${fn}: ${r.error ? r.error.message : 'was callable: ' + JSON.stringify(r.data)}`);
  }
  await unchanged('internal helpers');
});

// ── Manuscript ──────────────────────────────────────────────────────────────

test('manuscript RPCs refuse the victim\'s Manuscript, Chapter, Group and Scene, in both directions', async () => {
  await refused('save_scene_checked', { p_scene_id: victim.scene, p_content: doc('pwned'), p_word_count: 1, p_expected_version: null });
  await refused('save_scene_checked', { p_scene_id: victim.scene, p_content: doc('pwned'), p_word_count: 1, p_expected_version: 1 });
  await refused('save_scene_checked', { p_scene_id: victim.trashedScene, p_content: doc('pwned'), p_word_count: 1, p_expected_version: null });
  await refused('insert_scene_checked', { p_chapter_id: victim.chapter, p_title: 'planted', p_content: doc('x'), p_word_count: 1, p_position: 0 });
  await refused('insert_unplaced_scene_checked', { p_manuscript_id: victim.manuscript, p_title: 'planted', p_content: doc('x'), p_word_count: 1 });
  await refused('create_chapter_checked', { p_manuscript_id: victim.manuscript, p_title: 'planted', p_scene_title: 'x', p_scene_content: doc('x'), p_scene_word_count: 1 });
  await refused('create_manuscript_group', { p_manuscript_id: victim.manuscript, p_parent_group_id: null, p_title: 'planted' });
  await refused('create_manuscript_group', { p_manuscript_id: attacker.manuscript, p_parent_group_id: victim.group, p_title: 'planted' });
  await refused('delete_chapter', { p_chapter_id: victim.chapter });
  await refused('delete_manuscript_group', { p_group_id: victim.group });
  await refused('move_scene', { p_scene_id: victim.scene, p_chapter_id: attacker.chapter });
  await refused('move_scene', { p_scene_id: victim.scene, p_chapter_id: null });
  await refused('move_scene', { p_scene_id: attacker.unplaced, p_chapter_id: victim.chapter });
  await refused('place_scene', { p_scene_id: victim.scene, p_chapter_id: attacker.chapter, p_index: 0 });
  await refused('place_scene', { p_scene_id: victim.scene, p_chapter_id: null, p_index: 0 });
  await refused('place_scene', { p_scene_id: attacker.unplaced, p_chapter_id: victim.chapter, p_index: 0 });
  await refused('place_scene', { p_scene_id: victim.trashedScene, p_chapter_id: attacker.chapter, p_index: 0 });
  await refused('move_chapter', { p_chapter_id: victim.chapter, p_parent_group_id: null, p_index: 0 });
  await refused('move_chapter', { p_chapter_id: attacker.chapter, p_parent_group_id: victim.group, p_index: 0 });
  await refused('move_manuscript_group', { p_group_id: victim.group, p_parent_group_id: null, p_index: 0 });
  await refused('move_manuscript_group', { p_group_id: attacker.group, p_parent_group_id: victim.group, p_index: 0 });
  await refused('reorder_chapter_scenes', { p_chapter_id: victim.chapter, p_scene_ids: [victim.scene] });
  // The victim's Scene ids inside the attacker's own Chapter: "stale", nothing moves.
  await refused('reorder_chapter_scenes', { p_chapter_id: attacker.chapter, p_scene_ids: [victim.scene] });
  // The victim's Manuscript total is not even computable: zero, not the real number.
  const total = await sb.rpc('ordered_manuscript_word_total', { p_manuscript_id: victim.manuscript });
  assert.equal(total.data, 0);
  const fields = await sb.rpc('manuscript_scene_view_fields', { p_manuscript_id: victim.manuscript });
  assert.deepEqual(fields.data.filter((f) => !f.native), [], 'the victim\'s Scene properties surfaced as view fields');
  // account_word_total counts the caller's words only: naming the victim's Scene changes nothing.
  const own = (await sb.rpc('account_word_total', { p_candidate_scene_id: null, p_candidate_word_count: null })).data;
  const probe = (await sb.rpc('account_word_total', { p_candidate_scene_id: victim.scene, p_candidate_word_count: 100000 })).data;
  assert.equal(probe, own, 'account_word_total reflected the victim\'s Scene');
  await unchanged('manuscript RPCs');
});

test('Trash RPCs refuse the victim\'s objects of every type; workspace_trash_state answers "missing", never "trashed"', async () => {
  const objects = [
    ['scene', victim.scene], ['scene', victim.trashedScene], ['scene', victim.sceneInTrashedChapter], ['chapter', victim.chapter], ['chapter', victim.trashedChapter],
    ['page', victim.page], ['page', victim.trashedPage], ['folder', victim.folder], ['collection', victim.collection],
    ['entry', victim.entry], ['entry', victim.trashedEntry], ['canvas', victim.canvas],
  ];
  for (const [type, id] of objects) {
    await refused('trash_workspace_object', { p_type: type, p_id: id });
    await refused('restore_workspace_object', { p_type: type, p_id: id });
    await refused('delete_trashed_workspace_object', { p_type: type, p_id: id });
    const state = await sb.rpc('workspace_trash_state', { p_type: type, p_id: id });
    assert.equal(state.data.state, 'missing', `${type} ${id}: ${JSON.stringify(state.data)}`);
  }
  await refused('list_workspace_trash', { p_project_id: victim.project });
  await refused('trash_project', { p_project_id: victim.project });
  await refused('restore_project', { p_project_id: victim.trashedProject });
  await refused('delete_trashed_project', { p_project_id: victim.trashedProject });
  await refused('delete_trashed_project', { p_project_id: victim.project });
  await unchanged('trash RPCs');
});

test('Project RPCs: duplication, backup, search, onboarding and creation retries never reach the victim\'s Project', async () => {
  await refused('duplicate_project_checked', { p_project_id: victim.project });
  for (const kind of ['groups', 'chapters', 'scenes', 'scene_property_definitions', 'scene_property_values', 'scene_views', 'revision_notes', 'scene_revisions',
    'milestones', 'milestone_scenes', 'workspace_nodes', 'workspace_folders', 'workspace_documents', 'workspace_collections', 'workspace_collection_properties',
    'workspace_collection_views', 'workspace_collection_entries', 'workspace_entry_values', 'workspace_canvases', 'workspace_canvas_items',
    'workspace_canvas_connections', 'workspace_attachments', 'object_references', 'writing_sessions', 'writing_goals', 'project_notes']) {
    await refused('read_project_backup', { p_project_id: victim.project, p_kind: kind, p_after: null, p_limit: 500 });
  }
  // A bad cursor on the attacker's own Project is an error, not a different query.
  const cursor = await sb.rpc('read_project_backup', { p_project_id: attacker.project, p_kind: 'scenes', p_after: `' or true --`, p_limit: 10 });
  assert.ok(cursor.error, 'a malformed cursor was accepted');
  const search = await sb.rpc('search_project_content', { p_project_id: victim.project, p_query: 'vera', p_limit: 100 });
  assert.deepEqual(search.data, []);
  const ownSearch = await sb.rpc('search_project_content', { p_project_id: attacker.project, p_query: 'vera', p_limit: 100 });
  assert.deepEqual(ownSearch.data, [], 'the victim\'s text surfaced in the attacker\'s search');
  await refused('onboarding_attach_project', { p_project: victim.project });
  await refused('list_unreferenced_attachments', { p_project_id: victim.project, p_older_than: null });
  // Replaying the victim's creation request id makes the ATTACKER a new Project, never returns the victim's.
  const replay = await sb.rpc('create_project_checked', {
    p_title: 'replay', p_description: null, p_cover_color: null, p_first_scene_content: doc('r'), p_first_scene_word_count: 1, p_request_id: victim.requestId,
  });
  assert.equal(replay.data.status, 'ok');
  assert.equal(replay.data.project.user_id, ATTACKER);
  assert.notEqual(replay.data.project.id, victim.project);
  const imp = await sb.rpc('import_manuscript_checked', { p_title: 'replay import', p_manuscript: { items: [], unplaced: [{ title: 'x', content: doc('x'), word_count: 1 }] }, p_request_id: victim.requestId });
  assert.equal(imp.data.status, 'ok');
  assert.equal(imp.data.project.user_id, ATTACKER);
  assert.notEqual(imp.data.project.id, victim.project);
  await db.query(`delete from public.projects where id = any($1)`, [[replay.data.project.id, imp.data.project.id]]);
  await db.query(`delete from public.writing_sessions where user_id = $1 and project_id is null`, [ATTACKER]);
  await rebase();
});

// ── Workspace ───────────────────────────────────────────────────────────────

test('Workspace creation and tree RPCs refuse the victim\'s Project and Folder nodes, in both directions', async () => {
  for (const fn of ['create_workspace_document', 'create_workspace_folder', 'create_workspace_collection', 'create_workspace_canvas']) {
    await refused(fn, { p_project_id: victim.project, p_parent_node_id: null, p_title: 'planted' });
    await refused(fn, { p_project_id: attacker.project, p_parent_node_id: victim.folderNode, p_title: 'planted' });
  }
  await refused('move_workspace_node', { p_node_id: victim.pageNode, p_parent_node_id: null, p_index: 0 });
  await refused('move_workspace_node', { p_node_id: victim.pageNode, p_parent_node_id: attacker.folderNode, p_index: 0 });
  await refused('move_workspace_node', { p_node_id: attacker.pageNode, p_parent_node_id: victim.folderNode, p_index: 0 });
  await refused('delete_workspace_folder', { p_folder_id: victim.folder });
  await refused('delete_workspace_collection', { p_collection_id: victim.collection });
  await unchanged('workspace tree RPCs');
});

test('Collection property, view and value RPCs refuse the victim\'s ids and cross-project targets', async () => {
  await refused('create_workspace_collection_property', { p_collection_id: victim.collection, p_name: 'planted', p_type: 'text' });
  await refused('create_workspace_relationship_property', { p_collection_id: victim.collection, p_name: 'planted', p_target: 'entry', p_target_collection_id: victim.collection, p_many: true });
  await refused('create_workspace_relationship_property', { p_collection_id: attacker.collection, p_name: 'spy', p_target: 'entry', p_target_collection_id: victim.collection, p_many: true });
  await refused('update_workspace_collection_property', { p_property_id: victim.property, p_changes: { name: 'pwned' } });
  await refused('update_workspace_relationship_property', { p_property_id: victim.relProperty, p_changes: { many: false } });
  await refused('update_workspace_relationship_property', { p_property_id: attacker.relProperty, p_changes: { target: 'entry', target_collection_id: victim.collection } });
  await refused('delete_workspace_collection_property', { p_property_id: victim.property, p_expected_values: 1 });
  await refused('delete_workspace_collection_property', { p_property_id: victim.property, p_expected_values: 0 });
  await refused('move_workspace_collection_property', { p_property_id: victim.property, p_index: 0 });
  await refused('create_workspace_collection_view', { p_collection_id: victim.collection, p_name: 'planted', p_type: 'list', p_config: null });
  await refused('update_workspace_collection_view', { p_view_id: victim.view, p_changes: { name: 'pwned' } });
  await refused('delete_workspace_collection_view', { p_view_id: victim.view });
  await refused('move_workspace_collection_view', { p_view_id: victim.view, p_index: 0 });
  await refused('set_workspace_entry_value', { p_entry_id: victim.entry, p_property_id: victim.property, p_value: 'pwned' });
  await refused('set_workspace_entry_value', { p_entry_id: attacker.entry, p_property_id: victim.property, p_value: 'pwned' });
  await refused('set_workspace_entry_relationship', { p_entry_id: victim.entry, p_property_id: victim.relProperty, p_target_ids: [attacker.entry] });
  await refused('set_workspace_entry_relationship', { p_entry_id: attacker.entry, p_property_id: victim.relProperty, p_target_ids: [attacker.entry2] });
  await refused('set_workspace_entry_relationship', { p_entry_id: attacker.entry, p_property_id: attacker.relProperty, p_target_ids: [victim.entry] });
  // The default-config helpers read through RLS: the victim's Collection yields an empty shape, not its properties.
  const cfg = await sb.rpc('default_workspace_view_config', { p_collection_id: victim.collection, p_type: 'table' });
  assert.deepEqual(cfg.data.columns ?? cfg.data.fields ?? [], []);
  assert.doesNotMatch(JSON.stringify(cfg.data), /Role|Friends/);
  await unchanged('collection RPCs');
});

test('Scene property and view RPCs refuse the victim\'s Project, Group, Scene, property and view', async () => {
  await refused('create_scene_property', { p_project_id: victim.project, p_name: 'planted', p_type: 'text' });
  await refused('create_scene_relationship_property', { p_project_id: victim.project, p_name: 'planted', p_target: 'scene', p_target_collection_id: null, p_many: true });
  await refused('create_scene_relationship_property', { p_project_id: attacker.project, p_name: 'spy', p_target: 'entry', p_target_collection_id: victim.collection, p_many: true });
  await refused('update_scene_property', { p_property_id: victim.sceneProperty, p_changes: { name: 'pwned' } });
  await refused('update_scene_property', { p_property_id: attacker.sceneRelProperty, p_changes: { target: 'entry', target_collection_id: victim.collection } });
  await refused('delete_scene_property', { p_property_id: victim.sceneProperty, p_expected_values: 1 });
  await refused('move_scene_property', { p_property_id: victim.sceneProperty, p_index: 0 });
  await refused('set_scene_property_value', { p_scene_id: victim.scene, p_property_id: victim.sceneProperty, p_value: 'pwned' });
  await refused('set_scene_property_value', { p_scene_id: attacker.scene, p_property_id: victim.sceneProperty, p_value: 'pwned' });
  await refused('set_scene_relationship', { p_scene_id: victim.scene, p_property_id: victim.sceneRelProperty, p_target_ids: [attacker.entry] });
  await refused('set_scene_relationship', { p_scene_id: attacker.scene, p_property_id: victim.sceneRelProperty, p_target_ids: [attacker.entry] });
  await refused('set_scene_relationship', { p_scene_id: attacker.scene, p_property_id: attacker.sceneRelProperty, p_target_ids: [victim.entry] });
  await refused('create_scene_view', { p_project_id: victim.project, p_name: 'planted', p_type: 'list', p_config: null, p_group_id: null });
  await refused('create_scene_view', { p_project_id: attacker.project, p_name: 'planted', p_type: 'list', p_config: null, p_group_id: victim.group });
  await refused('update_scene_view', { p_view_id: victim.sceneView, p_changes: { name: 'pwned' } });
  await refused('update_scene_view', { p_view_id: victim.groupSceneView, p_changes: { name: 'pwned' } });
  await refused('delete_scene_view', { p_view_id: victim.sceneView });
  await refused('move_scene_view', { p_view_id: victim.sceneView, p_index: 0 });
  const cfg = await sb.rpc('default_scene_view_config', { p_manuscript_id: victim.manuscript, p_type: 'table' });
  assert.doesNotMatch(JSON.stringify(cfg.data), /POV|Cast/);
  await unchanged('scene property RPCs');
});

test('references: a link to or from the victim\'s object is "not found"; the victim\'s link cannot be removed', async () => {
  await refused('add_object_reference', { p_source_type: 'page', p_source_id: attacker.page, p_target_type: 'scene', p_target_id: victim.scene });
  await refused('add_object_reference', { p_source_type: 'page', p_source_id: attacker.page, p_target_type: 'page', p_target_id: victim.page });
  await refused('add_object_reference', { p_source_type: 'page', p_source_id: attacker.page, p_target_type: 'entry', p_target_id: victim.entry });
  await refused('add_object_reference', { p_source_type: 'page', p_source_id: victim.page, p_target_type: 'scene', p_target_id: attacker.scene });
  await refused('add_object_reference', { p_source_type: 'scene', p_source_id: victim.scene, p_target_type: 'scene', p_target_id: victim.scene2 });
  await refused('remove_object_reference', { p_reference_id: victim.link });
  await refused('remove_object_reference', { p_reference_id: victim.relRef });
  // An inline mention of the victim's Scene in the attacker's own Page creates no backlink.
  const mention = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'reference', attrs: { targetType: 'scene', targetId: victim.scene } }, { type: 'text', text: 'x' }] }] };
  const saved = await sb.from('workspace_documents').update({ content: mention }).eq('id', attacker.page).select('id');
  assert.equal(saved.data.length, 1);
  const refs = await db.query(`select count(*)::int as n from public.object_references where target_scene_id = $1 and source_document_id = $2`, [victim.scene, attacker.page]);
  assert.equal(refs.rows[0].n, 0, 'an inline mention reached across Projects');
  await db.query(`update public.workspace_documents set content = '{"type":"doc","content":[]}' where id = $1`, [attacker.page]);
  await rebase();
});

// ── Canvas and attachments ──────────────────────────────────────────────────

test('write_canvas_items refuses the victim\'s Canvas, and on the attacker\'s Canvas refuses every placement of a victim object', async () => {
  await refused('write_canvas_items', { p_canvas_id: victim.canvas, p_changes: [{ op: 'create', id: crypto.randomUUID(), item_type: 'note', content: doc('x') }] });
  await refused('write_canvas_items', { p_canvas_id: victim.canvas, p_changes: [{ op: 'delete', id: victim.canvasNote }] });
  const changes = [
    { op: 'create', id: crypto.randomUUID(), item_type: 'scene', target_id: victim.scene },
    { op: 'create', id: crypto.randomUUID(), item_type: 'chapter', target_id: victim.chapter },
    { op: 'create', id: crypto.randomUUID(), item_type: 'page', target_id: victim.page },
    { op: 'create', id: crypto.randomUUID(), item_type: 'entry', target_id: victim.entry },
    { op: 'create', id: crypto.randomUUID(), item_type: 'canvas', target_id: victim.canvas },
    { op: 'create', id: crypto.randomUUID(), item_type: 'image', target_id: victim.attachment },
    { op: 'create', id: crypto.randomUUID(), item_type: 'image', target_id: victim.unreferencedAttachment },
    { op: 'create', id: crypto.randomUUID(), item_type: 'note', content: doc('x'), section_id: victim.canvasNote },
    { op: 'create', id: victim.canvasNote, item_type: 'note', content: doc('x') },                       // the victim's id: "another canvas"
    { op: 'update', id: victim.canvasNote, expected_version: 1, content: doc('pwned') },                // missing
    { op: 'delete', id: victim.canvasNote },                                                            // scoped to this canvas: no-op
    { op: 'create', kind: 'connection', id: crypto.randomUUID(), source_id: attacker.canvasNote, target_id: victim.canvasSceneItem },
    { op: 'create', kind: 'connection', id: victim.connection, source_id: attacker.canvasNote, target_id: attacker.canvasSceneItem },
    { op: 'update', kind: 'connection', id: victim.connection, expected_version: 1, label: 'pwned' },
    { op: 'delete', kind: 'connection', id: victim.connection },
  ];
  const r = await sb.rpc('write_canvas_items', { p_canvas_id: attacker.canvas, p_changes: changes });
  assert.equal(r.error, null, r.error?.message);
  for (const res of r.data.results) {
    assert.ok(['error', 'missing'].includes(res.status) || (res.status === 'ok' && res.version === undefined),
      `a change touching the victim's object was accepted: ${JSON.stringify(res)}`);
    assert.doesNotMatch(JSON.stringify(res), /vera/i);
  }
  const items = await db.query(`select count(*)::int as n from public.workspace_canvas_items where canvas_id = $1`, [attacker.canvas]);
  assert.equal(items.rows[0].n, 3, 'a placement of a victim object landed on the attacker\'s Canvas');
  await refused('convert_canvas_note', { p_item_id: victim.canvasNote, p_target: 'page', p_new_item_id: crypto.randomUUID(), p_title: 'x', p_content: null, p_word_count: 0 });
  await refused('convert_canvas_note', { p_item_id: attacker.canvasNote, p_target: 'page', p_new_item_id: victim.canvasSceneItem, p_title: 'x', p_content: null, p_word_count: 0 });
  await unchanged('canvas RPCs');
});

test('attachment RPCs: the victim\'s Project and attachment ids are refused; a sweep of the victim\'s ids deletes nothing', async () => {
  const meta = { p_kind: 'image', p_file_name: 'x.png', p_mime_type: 'image/png', p_byte_size: 10, p_width: 1, p_height: 1, p_display_key: null, p_display_width: null, p_display_height: null, p_storage_bucket: 'workspace-attachments' };
  await refused('create_workspace_attachment', { p_id: crypto.randomUUID(), p_project_id: victim.project, p_storage_key: `${victim.project}/x/original.png`, ...meta });
  await refused('create_workspace_attachment', { p_id: victim.attachment, p_project_id: attacker.project, p_storage_key: `${attacker.project}/${victim.attachment}/original.png`, ...meta });
  // A key under the victim's prefix, registered to the attacker's Project: refused.
  const id = crypto.randomUUID();
  await refused('create_workspace_attachment', { p_id: id, p_project_id: attacker.project, p_storage_key: `${victim.project}/${id}/original.png`, ...meta });
  await refused('delete_workspace_attachments', { p_project_id: victim.project, p_ids: [victim.unreferencedAttachment] });
  const sweep = await sb.rpc('delete_workspace_attachments', { p_project_id: attacker.project, p_ids: [victim.attachment, victim.unreferencedAttachment] });
  assert.deepEqual(sweep.data, { status: 'ok', deleted: [], purges: [] });
  await unchanged('attachment RPCs');
});

// ── History, milestones, revision notes ─────────────────────────────────────

test('Scene history and milestone RPCs refuse the victim\'s Scene, revision, Manuscript and Milestone', async () => {
  await refused('list_scene_history', { p_scene_id: victim.scene });
  await refused('get_scene_revision', { p_revision_id: victim.revision });
  await refused('restore_scene_revision', { p_revision_id: victim.revision, p_expected_version: victim.sceneVersion });
  await refused('restore_scene_revision', { p_revision_id: victim.revision, p_expected_version: null });
  await refused('create_manuscript_milestone', { p_manuscript_id: victim.manuscript, p_name: 'planted' });
  await refused('get_manuscript_milestone', { p_milestone_id: victim.milestone });
  await refused('list_manuscript_milestones', { p_manuscript_id: victim.manuscript });
  await refused('delete_manuscript_milestone', { p_milestone_id: victim.milestone });
  await refused('list_object_milestones', { p_type: 'scene', p_id: victim.scene });
  await refused('list_object_milestones', { p_type: 'chapter', p_id: victim.chapter });
  await unchanged('history RPCs');
});

test('revision note RPCs: a note on the victim\'s Scene, Chapter, Group or Manuscript is "unavailable"; the victim\'s note ids are inert', async () => {
  for (const [type, id] of [['scene', victim.scene], ['chapter', victim.chapter], ['group', victim.group], ['manuscript', victim.manuscript], ['scene', victim.trashedScene]]) {
    await refused('create_revision_note', { p_note_id: crypto.randomUUID(), p_target_type: type, p_target_id: id, p_body: 'planted' });
    await refused('create_revision_note_item', { p_note_id: crypto.randomUUID(), p_target_type: type, p_target_id: id, p_body: 'planted', p_details: null, p_resolved: false, p_anchor: null });
  }
  // Replaying the victim's note id (a "retry") on any target: invalid, and the note is not echoed back.
  await refused('create_revision_note', { p_note_id: victim.note, p_target_type: 'scene', p_target_id: victim.scene, p_body: 'planted' });
  await refused('create_revision_note', { p_note_id: victim.note, p_target_type: 'scene', p_target_id: attacker.scene, p_body: 'planted' });
  await refused('create_revision_note_item', { p_note_id: victim.manuscriptNote, p_target_type: 'manuscript', p_target_id: attacker.manuscript, p_body: 'planted', p_details: null, p_resolved: false, p_anchor: null });
  await refused('update_revision_note', { p_note_id: victim.note, p_body: 'pwned', p_base_version: null });
  await refused('update_revision_note_item', { p_note_id: victim.note, p_body: 'pwned', p_details: 'pwned', p_resolved: true, p_base_version: null });
  const del = await sb.rpc('delete_revision_note', { p_note_id: victim.note, p_base_version: null });
  assert.equal(del.data.status, 'ok', 'a delete of an invisible note is a silent no-op');
  await unchanged('revision note RPCs');
});

// ── Account ─────────────────────────────────────────────────────────────────

test('account RPCs act on the caller only: profile, onboarding, beta claim, game tickets', async () => {
  const profile = await sb.rpc('complete_profile', { p_display_name: 'Mallory Again' });
  assert.equal(profile.data.id, ATTACKER);
  assert.equal((await db.query(`select display_name from public.profiles where id = $1`, [VICTIM])).rows[0].display_name, 'Vera');
  await db.query(`update public.profiles set display_name = 'Mallory' where id = $1`, [ATTACKER]);
  for (const fn of ['onboarding_begin', 'onboarding_complete']) {
    const r = await sb.rpc(fn, {});
    assert.equal(r.data.user_id, ATTACKER);
  }
  assert.equal((await sb.rpc('onboarding_choose_path', { p_path: 'new' })).data.user_id, ATTACKER);
  assert.equal((await db.query(`select completed_at from public.account_onboarding where user_id = $1`, [VICTIM])).rows[0].completed_at, null);
  await db.query(`update public.account_onboarding set completed_at = null, path = null where user_id = $1`, [ATTACKER]);
  assert.equal((await sb.rpc('claim_beta_access', {})).data, 'member');

  // Game tickets (legacy Arena): another writer's weekly ticket count cannot be spent by anyone else.
  const before = (await db.query(`select tickets_used from public.game_tickets where user_id = $1`, [VICTIM])).rows[0].tickets_used;
  const asAttacker = await sb.rpc('increment_game_ticket', { p_user_id: VICTIM, p_week_start: '2026-09-28' });
  assert.ok(asAttacker.error, 'increment_game_ticket spent the victim\'s ticket for the attacker');
  const asAnon = await anon(db).rpc('increment_game_ticket', { p_user_id: VICTIM, p_week_start: '2026-09-28' });
  assert.ok(asAnon.error, 'increment_game_ticket spent the victim\'s ticket for anon');
  const forged = await anon(db).rpc('increment_game_ticket', { p_user_id: ADMIN, p_week_start: '2026-10-05' });
  assert.ok(forged.error, 'increment_game_ticket created a ticket row for another account from anon');
  assert.equal((await db.query(`select tickets_used from public.game_tickets where user_id = $1`, [VICTIM])).rows[0].tickets_used, before);
  assert.equal((await db.query(`select count(*)::int as n from public.game_tickets where user_id = $1`, [ADMIN])).rows[0].n, 0);
  // The writer's own ticket still works.
  const own = await sb.rpc('increment_game_ticket', { p_user_id: ATTACKER, p_week_start: '2026-09-28' });
  assert.equal(own.error, null, own.error?.message);
  assert.equal((await db.query(`select tickets_used from public.game_tickets where user_id = $1`, [ATTACKER])).rows[0].tickets_used, 2);
  await db.query(`update public.game_tickets set tickets_used = 1 where user_id = $1`, [ATTACKER]);
  await unchanged('account RPCs');
});

test('the waitlist is write-only from the front door: anon can add an email, nobody can read it back, and a repeat is silent', async () => {
  const a = anon(db);
  const r = await a.rpc('join_beta_waitlist', { p_email: 'New@Harness.test', p_name: 'N', p_writes: 'w' });
  assert.equal(r.error, null, r.error?.message);
  const again = await a.rpc('join_beta_waitlist', { p_email: 'hopeful@harness.test', p_name: 'Someone Else', p_writes: 'overwrite' });
  assert.equal(again.error, null);
  const row = (await db.query(`select name, writes from public.beta_waitlist where email = 'hopeful@harness.test'`)).rows[0];
  assert.deepEqual(row, { name: 'Hope', writes: 'fantasy' }, 'a repeat join overwrote the earlier entry');
  assert.ok((await a.rpc('join_beta_waitlist', { p_email: 'not an email', p_name: null, p_writes: null })).error);
  await db.query(`delete from public.beta_waitlist where email = 'new@harness.test'`);
  await unchanged('waitlist');
});

test('anon gets nothing from any writer RPC', async () => {
  const a = anon(db);
  const calls = [
    ['save_scene_checked', { p_scene_id: victim.scene, p_content: doc('x'), p_word_count: 1, p_expected_version: null }],
    ['read_project_backup', { p_project_id: victim.project, p_kind: 'scenes', p_after: null, p_limit: 10 }],
    ['search_project_content', { p_project_id: victim.project, p_query: 'vera', p_limit: 10 }],
    ['list_workspace_trash', { p_project_id: victim.project }], ['write_canvas_items', { p_canvas_id: victim.canvas, p_changes: [] }],
    ['claim_beta_access', {}], ['complete_profile', { p_display_name: 'anon' }], ['onboarding_begin', {}],
    ['create_project_checked', { p_title: 'anon', p_description: null, p_cover_color: null, p_first_scene_content: null, p_first_scene_word_count: 0, p_request_id: null }],
  ];
  for (const [fn, args] of calls) {
    const r = await a.rpc(fn, args);
    assert.equal(r.error?.code, '42501', `${fn}: ${r.error ? r.error.message : JSON.stringify(r.data)}`);
  }
  await unchanged('anon RPCs');
});
