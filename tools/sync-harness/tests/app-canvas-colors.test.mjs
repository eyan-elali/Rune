// Canvas note and Section colour (Rune 2.0, migration 059): a curated tone
// on a note or a Section, persisted with the placement and shown as a tint
// of its surface — against the Rune 2.0 schema in real Postgres + RLS, the
// Canvas session with a fake server and deterministic timers, the theme
// registry, and the surface's source.
//
//   * the column: nullable, seven tones, notes and Sections only; the
//     version bumps on a change; write_canvas_items takes it on create and
//     update and refuses it on a live card alone
//   * the session: setColor on the selection (notes and Sections only), one
//     undo entry, saved as a create's field or an update's, Neutral restores
//     the default, a duplicate keeps the tone, a conflict adopts the server
//   * a pre-059 client never sends `color`; a pre-059 read is neutral
//   * every theme defines every tone; the ink stays legible on a toned note
//   * the CSS reads tokens only and selection keeps its own halo
//   * nothing of the manuscript is touched
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, readRepoFile, asUser, LEGACY_BASELINE, RUNE2_SCHEMA, REPO_DIR } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');

const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});
let idSeq = 0;
const uuid = () => `44444444-4444-4333-8444-${String(++idSeq).padStart(12, '0')}`;
const settle = () => new Promise((r) => setImmediate(r));
const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };

let legacy;
let canvas, sessionMod, canvasModel, themes;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  canvas = await bundleForTest('src/lib/actions/workspaceCanvas.ts', { name: 'cc_canvas' });
  sessionMod = await bundleForTest('src/lib/rune2/canvasSession.ts', { name: 'cc_session' });
  canvasModel = await bundleForTest('src/lib/rune2/canvas.ts', { name: 'cc_model' });
  themes = await bundleForTest('src/lib/rune2/themes.ts', { name: 'cc_themes' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  canvas.setServerClient(sb);
  return sb;
}

const create = (type, targetId, extra = {}) => ({
  op: 'create', id: uuid(), item_type: type, target_id: targetId, label: extra.label ?? null, content: extra.content ?? null,
  x: extra.x ?? 10, y: extra.y ?? 20, width: extra.width ?? 240, height: extra.height ?? 120, z: extra.z ?? 0,
  section_id: extra.section_id ?? null, manual_size: extra.manual_size ?? false,
  ...(extra.color !== undefined ? { color: extra.color } : {}),
});
const results = (r) => { assert.equal(r.status, 'ok', JSON.stringify(r)); return r.results; };
const allOk = (r) => { const rs = results(r); for (const x of rs) assert.equal(x.status, 'ok', JSON.stringify(x)); return rs; };

async function manuscriptState(db) {
  return {
    projects: await all(db, `select id, word_count from public.projects order by id`),
    scenes: await all(db, `select id, chapter_id, position, version, word_count from public.scenes order by id`),
    sessions: await all(db, `select * from public.writing_sessions order by id`),
  };
}

// ── 1. The database ───────────────────────────────────────────────────────────

test('db: a note and a Section take a tone on create and on update, neutral by default and on null; the version bumps on a change and not on the same tone; a live card and an image refuse one; an unknown tone is refused; a pre-059 shape still writes', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const plot = ok(await canvas.createWorkspaceCanvas(HOLLOW, 'Plot')).canvas;
  const before = await manuscriptState(db);

  const note = create('note', null, { content: doc('Nerai leaves'), color: 'sage' });
  const plain = create('note', null, { content: doc('Plain') }); // a pre-059 client's create: no color key at all
  const section = create('section', null, { label: 'Act II', width: 600, height: 400, color: 'ochre' });
  const scene = create('scene', pageId('h1a'));
  allOk(await canvas.writeCanvasItems(plot.id, [note, plain, section, scene]));
  const rows = new Map((await all(db, `select id, item_type, color, version from public.workspace_canvas_items where canvas_id = $1`, [plot.id])).map((r) => [r.id, r]));
  assert.deepEqual([rows.get(note.id).color, rows.get(plain.id).color, rows.get(section.id).color, rows.get(scene.id).color], ['sage', null, 'ochre', null]);

  // Update: a new tone bumps the version; the same tone does not; null restores neutral.
  const [changed] = allOk(await canvas.writeCanvasItems(plot.id, [{ op: 'update', id: note.id, expected_version: 1, color: 'rust' }]));
  assert.equal(changed.version, 2);
  const [same] = allOk(await canvas.writeCanvasItems(plot.id, [{ op: 'update', id: note.id, expected_version: 2, color: 'rust' }]));
  assert.equal(same.version, 2, 'the same tone is not a change');
  const [neutral] = allOk(await canvas.writeCanvasItems(plot.id, [{ op: 'update', id: note.id, expected_version: 2, color: null }]));
  assert.equal(neutral.version, 3);
  assert.equal((await one(db, `select color from public.workspace_canvas_items where id = $1`, [note.id])).color, null);
  const [sec] = allOk(await canvas.writeCanvasItems(plot.id, [{ op: 'update', id: section.id, expected_version: 1, color: 'plum' }]));
  assert.equal(sec.version, 2);

  // A live card: refused for that change alone; the others in the batch go through.
  const mixed = results(await canvas.writeCanvasItems(plot.id, [
    { op: 'update', id: scene.id, expected_version: 1, color: 'sage' },
    { op: 'update', id: plain.id, expected_version: 1, color: 'slate' },
  ]));
  assert.equal(mixed[0].status, 'error');
  assert.match(mixed[0].error, /Only a note or a Section has a colour/);
  assert.equal(mixed[1].status, 'ok');
  assert.equal((await one(db, `select color from public.workspace_canvas_items where id = $1`, [scene.id])).color, null);
  // A live card created with a colour simply has none (never an error: the key is ignored for it).
  const [liveCreate] = allOk(await canvas.writeCanvasItems(plot.id, [create('scene', pageId('h4a'), { color: 'rose' })]));
  assert.equal((await one(db, `select color from public.workspace_canvas_items where id = $1`, [liveCreate.id])).color, null);

  // An unknown tone: refused by the constraint.
  const [bad] = results(await canvas.writeCanvasItems(plot.id, [{ op: 'update', id: plain.id, expected_version: 2, color: 'neon' }]));
  assert.equal(bad.status, 'error');
  assert.match(bad.error, /workspace_canvas_items_color_check/);
  const [badCreate] = results(await canvas.writeCanvasItems(plot.id, [create('note', null, { content: doc('x'), color: '#ff0000' })]));
  assert.equal(badCreate.status, 'error');

  // The constraint itself, past the function.
  await assert.rejects(db.query(`update public.workspace_canvas_items set color = 'sage' where id = $1`, [scene.id]), /workspace_canvas_items_color_check/);

  // Read back as the client does: the tone is on the row; another writer sees nothing.
  const mine = ok(await canvas.getWorkspaceCanvas(plot.id));
  assert.deepEqual(mine.items.filter((i) => i.id === section.id).map((i) => i.color), ['plum']);
  signIn(db, BRAM);
  assert.ok((await canvas.getWorkspaceCanvas(plot.id)).error);
  // Clients never write the column directly.
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`update public.workspace_canvas_items set color = 'sage' where id = $1`, [note.id])), /permission denied/);

  assert.deepEqual(await manuscriptState(db), before, 'nothing of the manuscript changes');
});

test('db: the ledger records 059 after 058; the column is nullable text; convert_canvas_note still makes a live placement with no tone', async () => {
  const db = await seededDb();
  const ledger = (await all(db, `select version from public.schema_migrations order by version`)).map((r) => r.version);
  assert.ok(ledger.includes('059'));
  assert.ok(ledger.indexOf('059') > ledger.indexOf('058'));
  const col = await one(db, `select data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'workspace_canvas_items' and column_name = 'color'`);
  assert.deepEqual(col, { data_type: 'text', is_nullable: 'YES' });
  signIn(db, ALICE);
  const plot = ok(await canvas.createWorkspaceCanvas(HOLLOW, 'Plot')).canvas;
  const note = create('note', null, { content: doc('A toned note'), color: 'rose' });
  allOk(await canvas.writeCanvasItems(plot.id, [note]));
  const converted = await canvas.convertCanvasNote(note.id, 'page', uuid(), 'A toned note', doc('A toned note'), 3);
  assert.equal(converted.status, 'ok', JSON.stringify(converted));
  assert.equal(converted.item.item_type, 'page');
  assert.equal(converted.item.color ?? null, null, 'a Page card is never toned');
});

// ── 2. The session ────────────────────────────────────────────────────────────

function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map();
  return {
    set: (fn, ms) => { const id = ++seq; pending.set(id, { fn, at: now + ms }); return id; },
    clear: (id) => pending.delete(id),
    async advance(ms) {
      now += ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        due[1].fn();
        await settle();
      }
      await settle();
    },
  };
}

/** write_canvas_items as the database behaves after 059: a tone on a note or a Section; refused on anything else. */
function fakeServer(items = []) {
  const server = { rows: new Map(items.map((i) => [i.id, { ...i }])), calls: [], fail: 0 };
  server.write = async (changes) => {
    server.calls.push(structuredClone(changes));
    if (server.fail > 0) { server.fail -= 1; throw new Error('Failed to fetch'); }
    const results = [];
    for (const c of changes) {
      const row = server.rows.get(c.id);
      if (c.op === 'delete') { server.rows.delete(c.id); results.push({ id: c.id, status: 'ok' }); continue; }
      if (c.op === 'create') {
        if (row) { results.push({ id: c.id, status: 'ok', version: row.version }); continue; }
        const { op, target_id, ...rest } = c;
        const color = c.item_type === 'note' || c.item_type === 'section' ? (c.color ?? null) : null;
        server.rows.set(c.id, { ...rest, color, scene_id: c.item_type === 'scene' ? target_id : null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, version: 1, canvas_id: 'cv', project_id: 'p', created_at: 't', updated_at: 't' });
        results.push({ id: c.id, status: 'ok', version: 1 });
        continue;
      }
      if (!row) { results.push({ id: c.id, status: 'missing' }); continue; }
      if (row.version !== c.expected_version) { results.push({ id: c.id, status: 'conflict', version: row.version, item: { ...row } }); continue; }
      const { op, id, expected_version, kind, ...fields } = c;
      if ('color' in fields && row.item_type !== 'note' && row.item_type !== 'section') { results.push({ id: c.id, status: 'error', error: 'Only a note or a Section has a colour' }); continue; }
      Object.assign(row, fields, { version: row.version + 1 });
      results.push({ id: c.id, status: 'ok', version: row.version });
    }
    return { status: 'ok', results };
  };
  server.elsewhere = (id, fields) => { const row = server.rows.get(id); Object.assign(row, fields, { version: row.version + 1 }); };
  return server;
}

function makeSession(server) {
  const timers = fakeTimers();
  const drafts = [];
  let n = 0;
  const session = new sessionMod.CanvasSession({
    canvasId: 'cv',
    projectId: 'p',
    items: structuredClone([...server.rows.values()]),
    write: server.write,
    persist: (d) => drafts.push(structuredClone(d)),
    delay: 400,
    retryDelays: [2000, 5000],
    timers,
    now: () => '2026-10-17T00:00:00.000Z',
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  return { session, timers, drafts };
}
const SIZE = { width: 220, height: 64 };

test('model: seven tones, each with a label; Neutral is null; toneOf reads a pre-059 row and an unknown value as neutral and a live card as none; commonTone is the shared tone, "mixed", or undefined', () => {
  const m = canvasModel;
  assert.deepEqual(m.CANVAS_TONES.map((t) => t.id), ['ink', 'sage', 'ochre', 'rust', 'plum', 'slate', 'rose']);
  for (const t of m.CANVAS_TONES) assert.ok(t.label && t.label !== 'Neutral');
  assert.equal(m.toneLabel(null), 'Neutral');
  assert.equal(m.toneLabel('sage'), 'Sage');
  assert.ok(m.isCanvasTone('plum') && !m.isCanvasTone('neon') && !m.isCanvasTone(null));
  assert.equal(m.toneOf({ item_type: 'note' }), null, 'pre-059 read: neutral');
  assert.equal(m.toneOf({ item_type: 'note', color: 'bogus' }), null);
  assert.equal(m.toneOf({ item_type: 'note', color: 'rust' }), 'rust');
  assert.equal(m.toneOf({ item_type: 'scene', color: 'rust' }), null, 'a live card is never toned');
  assert.ok(m.canTone({ item_type: 'section' }) && !m.canTone({ item_type: 'image' }));
  assert.equal(m.commonTone([{ item_type: 'note', color: 'sage' }, { item_type: 'section', color: 'sage' }, { item_type: 'scene' }]), 'sage');
  assert.equal(m.commonTone([{ item_type: 'note', color: 'sage' }, { item_type: 'note' }]), 'mixed');
  assert.equal(m.commonTone([{ item_type: 'note' }, { item_type: 'note', color: null }]), null);
  assert.equal(m.commonTone([{ item_type: 'scene' }, { item_type: 'image' }]), undefined);
});

test('session: setColor tones the notes and Sections of a selection (a live card among them is left alone), as ONE undo entry; saved as an update with the tone; Neutral restores null; nothing happens when nothing would change', async () => {
  const server = fakeServer([
    { id: 'n1', item_type: 'note', content: doc('one'), label: null, x: 0, y: 0, width: 220, height: 64, z: 1, section_id: null, manual_size: false, color: null, version: 1, scene_id: null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, canvas_id: 'cv', project_id: 'p', created_at: 't', updated_at: 't' },
    { id: 'sec', item_type: 'section', content: null, label: 'Arc', x: -10, y: -10, width: 600, height: 400, z: 0, section_id: null, manual_size: false, color: null, version: 1, scene_id: null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, canvas_id: 'cv', project_id: 'p', created_at: 't', updated_at: 't' },
    { id: 'sc', item_type: 'scene', content: null, label: 'Scene', x: 300, y: 0, width: 248, height: 132, z: 2, section_id: null, manual_size: false, color: null, version: 1, scene_id: 's-1', chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, canvas_id: 'cv', project_id: 'p', created_at: 't', updated_at: 't' },
  ]);
  const { session, timers, drafts } = makeSession(server);
  session.setColor(['n1', 'sec', 'sc'], 'ochre');
  assert.deepEqual([session.get('n1').color, session.get('sec').color, session.get('sc').color], ['ochre', 'ochre', null]);
  assert.equal(session.status, 'pending');
  assert.ok(drafts.at(-1).entries.every((e) => e.op === 'update' && e.fields.includes('color')), 'the device copy carries the tone');
  await timers.advance(400);
  assert.equal(session.status, 'saved');
  assert.deepEqual(server.calls.at(-1).map((c) => [c.id, c.op, c.color]).sort(), [['n1', 'update', 'ochre'], ['sec', 'update', 'ochre']], 'only the two that can take a tone are sent');
  assert.deepEqual([server.rows.get('n1').color, server.rows.get('sec').color, server.rows.get('sc').color], ['ochre', 'ochre', null]);

  // One undo entry for the lot.
  session.undo();
  assert.deepEqual([session.get('n1').color, session.get('sec').color], [null, null]);
  session.redo();
  assert.deepEqual([session.get('n1').color, session.get('sec').color], ['ochre', 'ochre']);
  await timers.advance(400);

  // Neutral restores the default, sent as null.
  session.setColor(['n1'], null);
  assert.equal(session.get('n1').color, null);
  await timers.advance(400);
  assert.deepEqual(server.calls.at(-1), [{ op: 'update', id: 'n1', expected_version: 3, color: null }]);
  assert.equal(server.rows.get('n1').color, null);

  // Nothing to change: no entry, nothing sent.
  const calls = server.calls.length;
  const canUndo = session.canUndo;
  session.setColor(['n1'], null);
  session.setColor(['sc'], 'sage');
  await timers.advance(400);
  assert.equal(server.calls.length, calls);
  assert.equal(session.canUndo, canUndo);
});

test('session: a new note or Section created then toned is saved as ONE create carrying the tone; a create of a neutral one carries no color key (exactly a pre-059 client\'s batch); a duplicate keeps the tone; a failed save keeps the tone on the device and retries', async () => {
  const server = fakeServer([]);
  const { session, timers, drafts } = makeSession(server);
  const noteId = session.createNote({ x: 10, y: 10 }, SIZE, 'Toned');
  const plainId = session.createNote({ x: 10, y: 100 }, SIZE, 'Plain');
  const sectionId = session.createSection({ x: 0, y: 0, width: 600, height: 400 }, 'Arc');
  session.setColor([noteId, sectionId], 'plum');
  server.fail = 1;
  await timers.advance(400);
  assert.equal(session.status, 'retrying');
  assert.equal(session.get(noteId).color, 'plum', 'kept on the device');
  assert.ok(drafts.at(-1).entries.find((e) => e.id === noteId).item.color === 'plum');
  await timers.advance(2000);
  assert.equal(session.status, 'saved');
  const creates = server.calls.at(-1).filter((c) => c.op === 'create');
  assert.equal(creates.length, 3);
  const byId = new Map(creates.map((c) => [c.id, c]));
  assert.equal(byId.get(noteId).color, 'plum');
  assert.equal(byId.get(sectionId).color, 'plum');
  assert.ok(!('color' in byId.get(plainId)), 'a neutral create has no color key');
  assert.deepEqual([server.rows.get(noteId).color, server.rows.get(plainId).color, server.rows.get(sectionId).color], ['plum', null, 'plum']);

  const [copyId] = session.duplicate([noteId]);
  assert.equal(session.get(copyId).color, 'plum');
  await timers.advance(400);
  assert.equal(server.rows.get(copyId).color, 'plum');
});

test('session: a tone changed elsewhere wins over a stale window\'s (the row stands; the window shows the server\'s tone); a note\'s text conflict is still the writer\'s to resolve and never loses the other window\'s tone', async () => {
  const server = fakeServer([
    { id: 'n1', item_type: 'note', content: doc('one'), label: null, x: 0, y: 0, width: 220, height: 64, z: 1, section_id: null, manual_size: false, color: null, version: 1, scene_id: null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, canvas_id: 'cv', project_id: 'p', created_at: 't', updated_at: 't' },
  ]);
  const { session, timers } = makeSession(server);
  server.elsewhere('n1', { color: 'rose' });
  session.setColor(['n1'], 'sage');
  await timers.advance(400);
  assert.equal(session.status, 'saved');
  assert.equal(session.get('n1').color, 'rose', 'the other window\'s tone stands');
  assert.equal(session.get('n1').version, 2);
  assert.equal(server.rows.get('n1').color, 'rose');
  assert.equal(session.conflicts.size, 0, 'a tone is never a conflict the writer must resolve');

  // A text change against a row re-toned elsewhere: the text is the writer's choice, the tone is the server's.
  server.elsewhere('n1', { color: 'slate' });
  session.setNoteText('n1', 'mine');
  session.endNoteEdit('n1');
  await timers.advance(400);
  assert.equal(session.conflicts.size, 1);
  assert.equal(session.get('n1').color, 'slate');
  session.keepMine('n1');
  await timers.advance(400);
  assert.equal(server.rows.get('n1').color, 'slate');
  assert.equal(server.rows.get('n1').content.content[0].content[0].text, 'mine');
});

// ── 3. Themes and the surface ────────────────────────────────────────────────

const TONE_TOKENS = ['tone-ink', 'tone-sage', 'tone-ochre', 'tone-rust', 'tone-plum', 'tone-slate', 'tone-rose'];

/** color-mix(in srgb, A p%, B) as the browser computes it (sRGB, premultiplied is moot: both opaque). */
const mix = (a, pct, b) => a.map((x, i) => Math.round(x * pct + b[i] * (1 - pct)));
const rgb = (hex) => themes.parseColour(hex);

test('themes: every theme defines every tone as a colour and the two mixes; the tones are each distinct from the accent and quiet (a dusky set, no neon); the completion tone is the warning’s warm ochre, never the danger red', () => {
  for (const id of ['light', 'candlelight', 'dark']) {
    const p = themes.PALETTES[id];
    for (const t of TONE_TOKENS) assert.match(p[t], /^#[0-9a-f]{6}$/, `${id} ${t}`);
    assert.match(p['tone-note-mix'], /^\d+%$/);
    assert.match(p['tone-section-mix'], /^\d+%$/);
    assert.ok(parseInt(p['tone-section-mix']) < parseInt(p['tone-note-mix']), `${id}: a Section's tint is quieter than a note's`);
    assert.equal(p.complete, 'var(--r2-warning)');
    assert.notEqual(p.complete, p.danger);
    // Low chroma: no channel saturated, and the spread between channels modest.
    for (const t of TONE_TOKENS) {
      const [r, g, b] = rgb(p[t]);
      assert.ok(Math.max(r, g, b) <= 215 && Math.min(r, g, b) >= 40, `${id} ${t}: within a quiet range`);
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 115, `${id} ${t}: not saturated`);
    }
    const dusky = TONE_TOKENS.map((t) => rgb(p[t]).reduce((s, c) => s + c, 0) / 3);
    const light = id !== 'dark';
    assert.ok(dusky.every((m) => (light ? m < 135 : m > 120)), `${id}: tones sit at a theme-appropriate depth`);
  }
});

test('themes: the ink keeps reading on a toned note in every theme (≥ 7:1), and the tone remains visible against the plain paper (a tint, not nothing)', () => {
  for (const id of ['light', 'candlelight', 'dark']) {
    const p = themes.PALETTES[id];
    const paper = themes.parseColour(themes.resolveToken(p, p['field-bg']));
    const ink = themes.parseColour(themes.resolveToken(p, p['ink-1']));
    const noteMix = parseInt(p['tone-note-mix']) / 100;
    for (const t of TONE_TOKENS) {
      const tinted = mix(rgb(p[t]), noteMix, paper);
      const contrast = themes.contrastRatio(ink, tinted);
      assert.ok(contrast >= 7, `${id} ${t}: ink on the tinted note ${contrast.toFixed(2)}`);
      // A note's only faint ink is its placeholder ("Note"); it must still be there to read.
      const faint = themes.parseColour(themes.resolveToken(p, p['ink-3']));
      assert.ok(themes.contrastRatio(faint, tinted) >= 2.5, `${id} ${t}: faint ink on the tinted note ${themes.contrastRatio(faint, tinted).toFixed(2)}`);
      // Visible: the tint moves the paper by a perceptible amount.
      const delta = tinted.reduce((s, c, i) => s + Math.abs(c - paper[i]), 0);
      assert.ok(delta >= 18, `${id} ${t}: the tint is visible (${delta})`);
    }
  }
});

test('themes: the stylesheet paints --r2-tone-* and --r2-complete on every theme root', () => {
  const css = themes.buildThemeCss();
  for (const sel of ['.r2{', '.r2[data-theme="candlelight"]{', '.r2[data-theme="dark"]{']) {
    const block = css.slice(css.indexOf(sel));
    const end = block.indexOf('}');
    const decl = block.slice(0, end);
    for (const t of TONE_TOKENS) assert.match(decl, new RegExp(`--r2-${t}:#[0-9a-f]{6};`), `${sel} ${t}`);
    assert.match(decl, /--r2-complete:var\(--r2-warning\);/);
  }
});

test('surface: the CSS reads the tone through --r2-tone and the theme mixes (no colour of its own); a note is tinted on its paper, a Section on nothing and quieter; selection keeps the accent halo; the ink is never coloured', () => {
  const css = read('src/app/(rune2)/rune2.css');
  const block = code(css.slice(css.indexOf('Tones: a note'), css.indexOf('The picker: a row of swatches')));
  for (const t of ['ink', 'sage', 'ochre', 'rust', 'plum', 'slate', 'rose']) {
    assert.match(block, new RegExp(`\\[data-tone="${t}"\\] \\{ --r2-tone: var\\(--r2-tone-${t}\\); \\}`));
  }
  assert.match(block, /\.r2-canvas-card--note\[data-tone\] \{[^}]*color-mix\(in srgb, var\(--r2-tone\) var\(--r2-tone-note-mix\), var\(--r2-field-bg\)\)/);
  assert.match(block, /\.r2-canvas-section\[data-tone\] \{[^}]*color-mix\(in srgb, var\(--r2-tone\) var\(--r2-tone-section-mix\), transparent\)/);
  assert.match(block, /\.r2-canvas-card--note\[data-tone\]\[data-selected\][^{]*\{[^}]*var\(--r2-accent-line\)[^}]*var\(--r2-accent-soft\)/);
  assert.match(block, /\.r2-canvas-section\[data-tone\]\[data-selected\] \{[^}]*var\(--r2-accent-line\)/);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
  // No rule in the tone block sets text colour from the tone.
  for (const m of block.matchAll(/\{[^}]*\}/g)) {
    assert.doesNotMatch(m[0], /(^|[^-])color: color-mix\(in srgb, var\(--r2-tone\)/, 'text is never toned');
  }
});

test('surface: the control sits in the Canvas tools, enabled only when a note or a Section is selected; the picker is a radiogroup of labelled swatches with Neutral first, Escape closes, a swatch applies at once to the selection; the card menu offers Colour for a note and a Section only; the keyboard guard knows the popover', () => {
  const surface = code(read('src/components/rune2/CanvasSurface.tsx'));
  assert.match(surface, /className="r2-icon-button r2-canvas-tone-control"/);
  assert.match(surface, /disabled=\{selectionTone === undefined\}/);
  assert.match(surface, /aria-haspopup="dialog"[\s\S]{0,200}aria-expanded=\{toneAt !== null\}/);
  assert.match(surface, /if \(canTone\(item\)\) \{[\s\S]{0,300}label: "Colour"/);
  assert.match(surface, /onChoose=\{\(tone\) => session\.setColor\(\[\.\.\.selected\], tone\)\}/);
  assert.match(surface, /closest\("\.r2-canvas-ui, \.r2-menu, \.r2-popover"\)/, 'Enter and arrows inside the picker never reach the board');
  assert.match(surface, /if \(insert \|\| notice \|\| find \|\| arrangeAt \|\| toneAt\) clearTransient\(\);/, 'Escape closes it');
  const picker = code(read('src/components/rune2/CanvasTonePicker.tsx'));
  assert.match(picker, /role="radiogroup"/);
  assert.match(picker, /aria-label="Colour"/);
  assert.match(picker, /role="radio"/);
  assert.match(picker, /aria-checked=\{checked\}/);
  assert.match(picker, /aria-label=\{o\.label\}/);
  assert.match(picker, /\{ id: null, label: NEUTRAL_TONE_LABEL \}, \.\.\.CANVAS_TONES/);
  assert.match(picker, /e\.key === "Escape"/);
  assert.match(picker, /onChoose\(o\.id\);\s*onClose\(\);/);
  assert.doesNotMatch(picker, /type="color"|<input/, 'no arbitrary colour picker');
  const card = code(read('src/components/rune2/CanvasCard.tsx'));
  assert.match(card, /"data-tone": toneOf\(item\) \?\? undefined/);
  const section = code(read('src/components/rune2/CanvasSection.tsx'));
  assert.match(section, /data-tone=\{toneOf\(item\) \?\? undefined\}/);
});
