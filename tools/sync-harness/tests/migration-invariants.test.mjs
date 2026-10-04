// Rune 2.0 Phase 1 migration safety harness: the manuscript invariants every
// later Phase 1 step must keep passing (architecture doc §42).
//
//   1. the synthetic, production-shaped fixture and its database snapshot;
//   2. conformance: the REAL Rune 2.0 app code (manuscript.ts,
//      projectWordCount.ts, the export loader + PDF export), run on the
//      approved mapping of the legacy fixture, reproduces the legacy ordered
//      totals and export selection; account_word_total still counts every
//      Page. (The app on this branch no longer implements the legacy
//      canonical rule, so the legacy model is pinned by the fixture's
//      literal expectations and the Rune 1.x baseline's account total.);
//   3. the approved Page → Scene mapping preserves the ordered manuscript,
//      export selection, account totals and writing history;
//   4. checkMigration() accepts a correct migration and names what a broken
//      one breaks (negative controls), without printing prose;
//   5. the Rune 2.0 schema (schema.sql: manuscripts, scenes) can receive the
//      legacy fixture through the approved mapping with every invariant intact
//      — database to database, via the test prototype in
//      lib/legacy-to-rune2.mjs — and database-level defects are caught.
//
// Sections 1–4 use the Rune 1.x production baseline (the `pages` schema real
// writers are on today). The cutover there is a model (applyApprovedMapping);
// section 5 runs it for real into the Rune 2.0 schema. The production
// Rune 1.x → Rune 2.0 migration is a future task and must pass the same
// checkMigration(before, after, { stage: 'cutover' }).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTestDb, readRepoFile, HARNESS_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { takeManuscriptSnapshot } from '../lib/manuscript-snapshot.mjs';
import {
  applyApprovedMapping, assertNoViolations, chaptersInOrder, checkMigration, checkUnambiguousOrder,
  expectedRune2Mapping, formatViolations, hashContent, legacyExportSelection, legacyOrderedManuscriptIds,
  legacyOrderedWordTotal, modelAccountWordTotal, placedPagesInOrder, rune2ExportSelection,
  rune2OrderedPlacedSceneIds, rune2PlacedWordTotal, unplacedSceneIds,
} from '../lib/manuscript-invariants.mjs';
import {
  CHAPTERS, LABELS, PAGES, PROJECTS, USERS, WRITING_SESSIONS, chapterId, chapterTitleFor, markerFor,
  pageId, projectId, seedFixture, snapshotFromFixture,
} from '../fixtures/manuscript-fixture.mjs';

const ids = (...labels) => labels.map(pageId);
const named = (list) => list.map((id) => LABELS[id] ?? id);

let db;
let baseline; // snapshot of the seeded database, taken once, never mutated

async function freshSeededDb() {
  const d = await createTestDb();
  await d.exec(readRepoFile(LEGACY_BASELINE)); // Rune 1.x production baseline
  await seedFixture(d);
  return d;
}

before(async () => {
  db = await freshSeededDb();
  baseline = await takeManuscriptSnapshot(db);
});

// ── 1. fixture and snapshot ──────────────────────────────────────────────────

test('fixture covers every production shape the migration must handle', () => {
  const s = snapshotFromFixture();
  const chapterPages = (cid) => s.pages.filter((p) => p.chapterId === cid);
  const canonicalChapters = s.chapters.filter((c) => chapterPages(c.id).some((p) => p.isCanonical));
  const shapes = {
    projects: s.projects.length,
    usersWithSeveralProjects: s.users.filter((u) => s.projects.filter((p) => p.userId === u).length > 1).length,
    chaptersWithSeveralChaptersPerProject: s.projects.filter((p) => s.chapters.filter((c) => c.projectId === p.id).length > 1).length,
    canonicalWithoutSiblings: canonicalChapters.filter((c) => chapterPages(c.id).length === 1).length,
    canonicalWithAlternates: canonicalChapters.filter((c) => chapterPages(c.id).length > 1).length,
    canonicalNotFirst: canonicalChapters.filter((c) => chapterPages(c.id).find((p) => p.isCanonical).position > 0).length,
    emptyCanonicalWithProseSibling: canonicalChapters.filter((c) => {
      const ps = chapterPages(c.id);
      return ps.find((p) => p.isCanonical).wordCount === 0 && ps.some((p) => !p.isCanonical && p.wordCount > 0);
    }).length,
    noncanonicalMultiPage: s.chapters.filter((c) => chapterPages(c.id).length > 1 && !chapterPages(c.id).some((p) => p.isCanonical)).length,
    onePageChapters: s.chapters.filter((c) => chapterPages(c.id).length === 1 && !chapterPages(c.id)[0].isCanonical).length,
    emptyPagesNullContent: s.pages.filter((p) => p.wordCount === 0 && p.contentHash === hashContent(null)).length,
    emptyPagesEmptyDoc: s.pages.filter((p) => p.wordCount === 0 && p.contentHash !== hashContent(null)).length,
    chaptersWithoutPages: s.chapters.filter((c) => chapterPages(c.id).length === 0).length,
    projectsWithoutChapters: s.projects.filter((p) => !s.chapters.some((c) => c.projectId === p.id)).length,
    pagesWithHistory: new Set(s.writingSessions.filter((w) => w.pageId).map((w) => w.pageId)).size,
    alternatesWithHistory: s.writingSessions.filter((w) => w.pageId && expectedRune2Mapping(s).placement.get(w.pageId) === null).length,
    sessionsWithoutPage: s.writingSessions.filter((w) => !w.pageId).length,
    staleStoredTotals: s.projects.filter((p) => p.storedWordCount !== legacyOrderedWordTotal(s, p.id)).length,
    chapterPositionGaps: s.projects.filter((p) => chaptersInOrder(s, p.id).some((c, i, a) => i > 0 && c.position !== a[i - 1].position + 1)).length,
  };
  for (const [shape, n] of Object.entries(shapes)) assert.ok(n > 0, `fixture lost a required shape: ${shape}`);
  assert.ok(shapes.projects >= 5 && shapes.projectsWithoutChapters >= 2);
});

test('the database snapshot of the seeded fixture equals the fixture model (ids, hashes, counts, placement, history, totals)', () => {
  assert.deepEqual(baseline, snapshotFromFixture());
  assert.deepEqual(baseline.accountWordTotals, {
    [USERS.alice.id]: 3035, [USERS.bram.id]: 2740, [USERS.cora.id]: 0,
  }, 'real account_word_total() per user');
});

test('fixture order is unambiguous (production has 0 position ties)', () => {
  assert.deepEqual(checkUnambiguousOrder(baseline), []);
});

test('snapshots never carry prose: content is reduced to a hash', () => {
  const text = JSON.stringify(baseline);
  for (const label of Object.keys(PAGES)) assert.ok(!text.includes(markerFor(label)), `prose leaked for ${label}`);
  assert.ok(!/\b(vellum|lantern|bramble)\b/.test(text));
});

// ── 2. the legacy rule matches the real application code ─────────────────────

test('conformance: src/lib/manuscript.ts on the mapped placement equals the legacy ordered total', async () => {
  const mod = await bundleForTest('src/lib/manuscript.ts', { name: 'inv_manuscript' });
  const after = applyApprovedMapping(baseline);
  for (const p of baseline.projects) {
    const chapters = chaptersInOrder(after, p.id).map((c) => ({
      scenes: placedPagesInOrder(after, c.id).map((s) => ({ word_count: s.wordCount })),
    }));
    assert.equal(mod.calculateProjectWordCount(chapters), legacyOrderedWordTotal(baseline, p.id), LABELS[p.id]);
  }
  assert.deepEqual(baseline.projects.map((p) => legacyOrderedWordTotal(baseline, p.id)), [1450, 100, 1320, 0, 0], 'hollow, ash, tide, bramEmpty, coraEmpty');
});

test('conformance: the REAL ordered_manuscript_word_total() on the Rune 2.0 schema is the legacy ordered total; the stale stored total is carried, then healed', async () => {
  const target = await rune2FromLegacy();
  // As the owner, through the RPC (SECURITY INVOKER: RLS applies).
  const ordered = async (p) => {
    const { id } = (await target.query(`select id from public.manuscripts where project_id = $1`, [p.id])).rows[0];
    return (await createSupabaseAdapter(target, { userId: p.userId }).rpc('ordered_manuscript_word_total', { p_manuscript_id: id })).data;
  };
  const stored = async (p) => (await target.query(`select word_count from public.projects where id = $1`, [p.id])).rows[0].word_count;
  for (const p of baseline.projects) {
    assert.equal(await ordered(p), legacyOrderedWordTotal(baseline, p.id), LABELS[p.id]);
  }
  // The data move carries projects.word_count verbatim (the recompute is a
  // separate, reported step) — ash's stale 999 included.
  assert.equal(PROJECTS.ash.storedWordCount, 999, 'the stored cache stays stale in the fixture on purpose');
  assert.equal(await stored({ id: projectId('ash') }), 999);
  // Migration 020's backfill statement is that step: every stored total becomes the rule.
  const backfill = readRepoFile('src/lib/supabase/migrations/020_manuscript_totals.sql').match(/^update public\.projects p[\s\S]*?;$/m)[0];
  await target.exec(backfill);
  for (const p of baseline.projects) assert.equal(await stored(p), legacyOrderedWordTotal(baseline, p.id), LABELS[p.id]);
  assert.equal(legacyOrderedWordTotal(baseline, projectId('ash')), 100);
});

test('conformance: account totals equal the REAL account_word_total() — every stored Page counts', () => {
  for (const u of baseline.users) assert.equal(baseline.accountWordTotals[u], modelAccountWordTotal(baseline, u), LABELS[u]);
  const alice = USERS.alice.id;
  const orderedOnly = baseline.projects.filter((p) => p.userId === alice).reduce((n, p) => n + legacyOrderedWordTotal(baseline, p.id), 0);
  assert.equal(orderedOnly, 1550);
  assert.ok(baseline.accountWordTotals[alice] > 2000 && orderedOnly < 2000,
    'alice is over the starter limit only because alternates count — the gap a migration must not open');
});

// Runs the REAL manuscript export — loadManuscriptForExport (what
// ManuscriptExportButton calls, as the owner) and the real
// exportProjectAsPdf/tiptapToPdf with a recording jsPDF — against the Rune 2.0
// database the approved mapping produces. Rendered chapter headings and page
// markers reveal what was selected, in order. Empty Scenes render nothing, so
// their selection is covered by the selection helper.
async function renderRealExport(exportModule, sb, pid) {
  const recording = (globalThis.__runeTestPdf ??= { texts: [], saved: [] }); // shared with mocks/jspdf.js
  recording.texts.length = 0;
  recording.saved.length = 0;
  const { chapters, scenesPerChapter } = await exportModule.loadManuscriptForExport(sb, pid);
  if (chapters.length === 0) return null; // the button toasts "No chapters to export."
  await exportModule.exportProjectAsPdf({ title: 'fixture-project' }, chapters, scenesPerChapter);
  const texts = recording.texts;
  const titleToChapter = Object.fromEntries(Object.keys(CHAPTERS).map((l) => [chapterTitleFor(l).toUpperCase(), chapterId(l)]));
  const markerToPage = Object.fromEntries(Object.keys(PAGES).map((l) => [markerFor(l), pageId(l)]));
  return {
    headings: texts.filter((t) => titleToChapter[t]).map((t) => titleToChapter[t]),
    pages: texts.filter((t) => markerToPage[t]).map((t) => markerToPage[t]),
    saved: recording.saved.length,
  };
}

const expectedRender = (selection, snapshot) => ({
  headings: selection.map((c) => c.chapterId),
  pages: selection.flatMap((c) => c.pageIds).filter((id) => snapshot.pages.find((p) => p.id === id).wordCount > 0),
});

test('conformance: the REAL export (loader + exportProjectAsPdf) on the Rune 2.0 schema renders exactly legacyExportSelection', async () => {
  const mod = await bundleForTest('src/lib/export/projectExport.ts', {
    name: 'inv_projectExport', aliases: { jspdf: path.join(HARNESS_DIR, 'mocks/jspdf.js') },
  });
  const target = await rune2FromLegacy();
  for (const p of baseline.projects) {
    const rendered = await renderRealExport(mod, createSupabaseAdapter(target, { userId: p.userId }), p.id);
    const selection = legacyExportSelection(baseline, p.id);
    if (rendered === null) { assert.deepEqual(selection, [], LABELS[p.id]); continue; }
    assert.equal(rendered.saved, 1);
    const want = expectedRender(selection, baseline);
    assert.deepEqual(named(rendered.headings), named(want.headings), `${LABELS[p.id]}: exported chapter headings`);
    assert.deepEqual(named(rendered.pages), named(want.pages), `${LABELS[p.id]}: exported Scenes`);
  }
});

// ── 3. the approved Page → Scene mapping ─────────────────────────────────────

test('KEY INVARIANT: legacyOrderedManuscriptIds === expectedRune2PlacedSceneIds for every project', () => {
  const { byProject } = expectedRune2Mapping(baseline);
  for (const p of baseline.projects) {
    assert.deepEqual(named(byProject.get(p.id).placedIds), named(legacyOrderedManuscriptIds(baseline, p.id)), LABELS[p.id]);
    const after = applyApprovedMapping(baseline);
    assert.deepEqual(named(rune2OrderedPlacedSceneIds(after, p.id)), named(legacyOrderedManuscriptIds(baseline, p.id)), LABELS[p.id]);
    assert.equal(rune2PlacedWordTotal(after, p.id), legacyOrderedWordTotal(baseline, p.id), LABELS[p.id]);
  }
  assert.deepEqual(named(legacyOrderedManuscriptIds(baseline, projectId('hollow'))),
    named(ids('h1a', 'h2a', 'h3a', 'h4a', 'h4b', 'h4c', 'h6c')), 'hollow: chapters by position (ch5 at 4 before ch4 at 5), pages by position');
});

test('Case A: a canonical Page stays placed; its alternates become Unplaced; nothing is deleted', () => {
  const after = applyApprovedMapping(baseline);
  const placedIn = (ch) => placedPagesInOrder(after, chapterId(ch)).map((p) => p.id);
  const cases = [
    ['hollow.ch3', ['h3a'], ['h3b', 'h3c']], // A* B C
    ['hollow.ch6', ['h6c'], ['h6a', 'h6b']], // A B C*
    ['tide.ch1', ['t1b'], ['t1a', 't1c']], // A B* C
    ['ash.ch1', ['a1b'], ['a1a']], // empty canonical, prose sibling
    ['hollow.ch2', ['h2a'], []], // canonical with no siblings
  ];
  for (const [ch, placed, unplaced] of cases) {
    assert.deepEqual(named(placedIn(ch)), named(ids(...placed)), `${ch} placed`);
    for (const l of unplaced) assert.equal(after.pages.find((p) => p.id === pageId(l)).chapterId, null, `${ch}: ${l} Unplaced`);
  }
  assert.deepEqual(named(unplacedSceneIds(after, projectId('hollow'))), named(ids('h3b', 'h3c', 'h6a', 'h6b').sort()));
  assert.deepEqual(expectedRune2Mapping(baseline).byProject.get(projectId('hollow')).unplacedIds, ids('h3b', 'h3c', 'h6a', 'h6b'),
    'recommended pool order: former chapter order, then former page position');
  assert.ok(after.pages.every((p) => !p.isCanonical), 'every canonical flag cleared');
});

test('Case B: a chapter without a canonical Page keeps every Page placed, in position order', () => {
  const after = applyApprovedMapping(baseline);
  const placedIn = (ch) => placedPagesInOrder(after, chapterId(ch)).map((p) => p.id);
  assert.deepEqual(named(placedIn('hollow.ch4')), named(ids('h4a', 'h4b', 'h4c')), 'position order, not insert order');
  assert.deepEqual(named(placedIn('ash.ch2')), named(ids('a2a', 'a2b')));
  assert.deepEqual(named(placedIn('tide.ch3')), named(ids('t3a', 't3b')));
  assert.deepEqual(named(placedIn('hollow.ch1')), named(ids('h1a')), 'one-page chapter');
});

test('every Page becomes exactly one Scene with the same ID — empty Pages included; no Scene is invented', () => {
  const { placement } = expectedRune2Mapping(baseline);
  assert.equal(placement.size, baseline.pages.length);
  assert.deepEqual([...placement.keys()].sort(), baseline.pages.map((p) => p.id));
  for (const l of ['h4b', 't2a', 'a1b']) {
    assert.ok(placement.has(pageId(l)), `empty page ${l} survives as a Scene`);
    assert.notEqual(placement.get(pageId(l)), null, `empty page ${l} stays placed`);
  }
  const after = applyApprovedMapping(baseline);
  assert.equal(after.pages.length, baseline.pages.length);
  assert.equal(after.pages.filter((p) => p.chapterId === null).length, 7, '7 alternates become Unplaced');
});

test('a chapter without Pages and projects without Chapters: nothing invented, nothing deleted', () => {
  const after = applyApprovedMapping(baseline);
  assert.deepEqual(placedPagesInOrder(after, chapterId('hollow.ch5')), []);
  assert.ok(after.chapters.some((c) => c.id === chapterId('hollow.ch5')), 'empty chapter still exists');
  assert.ok(!legacyExportSelection(baseline, projectId('hollow')).some((c) => c.chapterId === chapterId('hollow.ch5')));
  assert.ok(!rune2ExportSelection(after, projectId('hollow')).some((c) => c.chapterId === chapterId('hollow.ch5')), 'no heading either way');
  for (const pr of ['bramEmpty', 'coraEmpty']) {
    assert.deepEqual(legacyOrderedManuscriptIds(baseline, projectId(pr)), []);
    assert.deepEqual(rune2OrderedPlacedSceneIds(after, projectId(pr)), []);
    assert.deepEqual(unplacedSceneIds(after, projectId(pr)), []);
    assert.ok(after.projects.some((p) => p.id === projectId(pr)));
  }
});

test('account totals: the mapping keeps every user total; counting only placed Scenes would open a bypass', () => {
  const after = applyApprovedMapping(baseline);
  for (const u of baseline.users) {
    assert.equal(modelAccountWordTotal(after, u), baseline.accountWordTotals[u], `${LABELS[u]}: placed + Unplaced`);
  }
  const alice = USERS.alice.id;
  const placedOnly = after.pages
    .filter((p) => p.chapterId !== null && after.projects.find((pr) => pr.id === p.projectId).userId === alice)
    .reduce((n, p) => n + p.wordCount, 0);
  assert.equal(placedOnly, 1550, 'a placed-only (chapter-joined) total would drop alice from 3035 to 1550 — under her 2000 limit');
});

test('export selection: legacy export before === Rune 2.0 export after; Unplaced Scenes never export', () => {
  const after = applyApprovedMapping(baseline);
  for (const p of baseline.projects) {
    assert.deepEqual(rune2ExportSelection(after, p.id), legacyExportSelection(baseline, p.id), LABELS[p.id]);
    const exported = new Set(rune2ExportSelection(after, p.id).flatMap((c) => c.pageIds));
    for (const u of unplacedSceneIds(after, p.id)) assert.ok(!exported.has(u), `${LABELS[u]} must not export`);
  }
});

test('writing history stays attached to the same IDs: every page-keyed session still has its Scene', () => {
  const after = applyApprovedMapping(baseline);
  const scenes = new Set(after.pages.map((p) => p.id));
  const keyed = WRITING_SESSIONS.filter((s) => s.page);
  for (const s of keyed) assert.ok(scenes.has(pageId(s.page)), `session ${s.id} → ${s.page}`);
  const onUnplaced = keyed.filter((s) => after.pages.find((p) => p.id === pageId(s.page)).chapterId === null).map((s) => s.page);
  assert.deepEqual(onUnplaced.sort(), ['a1a', 'h3b', 'h6b', 't1c'], 'history on alternates survives with them');
  assert.deepEqual(after.writingSessions, baseline.writingSessions);
});

// ── 4. checkMigration: accepts correct migrations, names broken ones ─────────

test('checkMigration(additive): the database, re-read after a no-op stage, passes', async () => {
  const again = await takeManuscriptSnapshot(db);
  assertNoViolations(checkMigration(baseline, again, { stage: 'additive' }), { labels: LABELS });
});

test('checkMigration(cutover): the approved mapping passes', () => {
  assertNoViolations(checkMigration(baseline, applyApprovedMapping(baseline), { stage: 'cutover' }), { labels: LABELS });
});

test('checkMigration(cutover): doing nothing is NOT a cutover', () => {
  const found = new Set(checkMigration(baseline, structuredClone(baseline), { stage: 'cutover' }).map((v) => v.invariant));
  for (const inv of ['cutover.placement', 'cutover.canonical-cleared', 'manuscript.ordered-ids', 'export.selection', 'manuscript.ordered-word-total']) {
    assert.ok(found.has(inv), `expected ${inv}`);
  }
});

const find = (s, label) => s.pages.find((p) => p.id === pageId(label));
const session = (s, n) => s.writingSessions.find((w) => w.id === WRITING_SESSIONS[n - 1].id);

// Each broken "migration" is the approved mapping plus one defect.
const NEGATIVE_CONTROLS = [
  ['a Page is deleted', (s) => { s.pages = s.pages.filter((p) => p.id !== pageId('h3c')); }, ['prose.row-survives']],
  ['a Page is re-created under a new ID', (s) => { find(s, 'h3b').id = 'dddddddd-0000-4000-8000-999999999999'; },
    ['prose.row-survives', 'prose.no-invented-rows', 'history.page-exists']],
  ['prose content changes', (s) => { find(s, 'h1a').contentHash = hashContent({ type: 'doc' }); }, ['prose.content-hash']],
  ['a word count changes', (s) => { find(s, 'h4a').wordCount += 1; },
    ['prose.word-count', 'manuscript.ordered-word-total', 'account.definition']],
  ['a Page moves to another project', (s) => { find(s, 'h3c').projectId = projectId('ash'); }, ['prose.project']],
  ['the data step fires the version trigger', (s) => { find(s, 'h3b').version += 1; find(s, 'h3b').updatedAt = '2026-09-30 00:00:00+00'; },
    ['sync.page-version', 'sync.page-updated-at']],
  ['the data step bumps projects.updated_at', (s) => { s.projects.find((p) => p.id === projectId('hollow')).updatedAt = '2026-09-30 00:00:00+00'; },
    ['sync.project-updated-at']],
  ['an alternate stays placed', (s) => { find(s, 'h3b').chapterId = chapterId('hollow.ch3'); },
    ['cutover.placement', 'manuscript.ordered-ids', 'manuscript.ordered-word-total', 'export.selection']],
  ['the canonical Page is unplaced instead', (s) => { find(s, 'h3a').chapterId = null; },
    ['cutover.placement', 'manuscript.ordered-ids', 'export.selection']],
  ['a canonical flag survives', (s) => { find(s, 't1b').isCanonical = true; }, ['cutover.canonical-cleared']],
  ['placed Scenes are reordered', (s) => { find(s, 'h4a').position = 5; }, ['manuscript.ordered-ids', 'export.selection']],
  ['two placed Scenes share a position', (s) => { find(s, 'h4c').position = 0; }, ['order.page-position-tie']],
  ['an empty Chapter is dropped', (s) => { s.chapters = s.chapters.filter((c) => c.id !== chapterId('hollow.ch5')); }, ['structure.chapter-survives']],
  ['a Chapter is invented', (s) => { s.chapters.push({ id: 'cccccccc-0000-4000-8000-999999999999', projectId: projectId('coraEmpty'), position: 1 }); },
    ['structure.no-invented-chapters']],
  ['the stored project total is recomputed inside the migration', (s) => { s.projects.find((p) => p.id === projectId('ash')).storedWordCount = 100; },
    ['structure.project-stored-word-count']],
  ['a writing session is deleted (Page cascade)', (s) => { s.writingSessions = s.writingSessions.filter((w) => w.id !== WRITING_SESSIONS[0].id); },
    ['history.row-survives', 'history.row-count']],
  ['a writing session is re-pointed to another Page', (s) => { session(s, 1).pageId = pageId('h3a'); }, ['history.row-unchanged']],
  ['a writing session is duplicated', (s) => { s.writingSessions.push({ ...session(s, 5), id: 'eeeeeeee-0000-4000-8000-999999999999' }); },
    ['history.no-invented-rows', 'history.row-count']],
  ['recorded words change', (s) => { session(s, 9).wordsAdded = 0; }, ['history.row-unchanged']],
  ['account_word_total stops counting Unplaced Scenes (chapter inner join)', (s) => {
    for (const u of s.users) s.accountWordTotals[u] -= s.pages.filter((p) => p.chapterId === null && s.projects.find((pr) => pr.id === p.projectId).userId === u).reduce((n, p) => n + p.wordCount, 0);
  }, ['account.word-total', 'account.definition']],
];

for (const [name, defect, expected] of NEGATIVE_CONTROLS) {
  test(`negative control: ${name} → ${expected.join(', ')}`, () => {
    const after = structuredClone(applyApprovedMapping(baseline));
    defect(after);
    const violations = checkMigration(baseline, after, { stage: 'cutover' });
    const found = new Set(violations.map((v) => v.invariant));
    for (const inv of expected) assert.ok(found.has(inv), `expected ${inv}; got ${[...found].join(', ') || 'nothing'}`);
    const message = (() => { try { assertNoViolations(violations, { labels: LABELS }); return ''; } catch (e) { return e.message; } })();
    assert.ok(message.length > 0, 'assertNoViolations must throw');
    assert.ok(!/\b(vellum|quill|lantern|ember|cinder|bramble|tallow|willow)\b/.test(message) && !message.includes('fixture-marker-'),
      'failure output must not contain prose');
  });
}

test('checkMigration(additive): moving any Page is a violation', () => {
  const after = structuredClone(baseline);
  find(after, 'h3b').chapterId = chapterId('hollow.ch1');
  const found = new Set(checkMigration(baseline, after, { stage: 'additive' }).map((v) => v.invariant));
  assert.ok(found.has('placement.unchanged'));
  assert.ok(found.has('manuscript.ordered-ids'), 'a stale reader would now see B in chapter 1');
});

test('checkMigration: `ignore` exempts a deliberately reported step (the stored-total recompute)', () => {
  const after = structuredClone(applyApprovedMapping(baseline));
  after.projects.find((p) => p.id === projectId('ash')).storedWordCount = 100;
  assert.deepEqual(checkMigration(baseline, after, { stage: 'cutover', ignore: ['structure.project-stored-word-count'] }), []);
});

test('failure output names the invariant, the fixture IDs and labels, and the ordering difference', () => {
  const after = structuredClone(applyApprovedMapping(baseline));
  find(after, 'h4a').position = 5;
  const text = formatViolations(checkMigration(baseline, after, { stage: 'cutover' }), LABELS);
  assert.match(text, /\[manuscript\.ordered-ids\] project=bbbbbbbb-0000-4000-8000-000000000001 \(project hollow\)/);
  assert.match(text, /first difference at index 3/);
  assert.ok(text.includes(pageId('h4b')));
});

// ── 5. the Rune 2.0 schema receives the legacy fixture ───────────────────────

/** A fresh Rune 2.0 database (schema.sql) filled from the seeded legacy database by the prototype mapping. */
async function rune2FromLegacy(opts) {
  const target = await createTestDb();
  await target.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(db, target, opts);
  return target;
}

test('Rune 2.0 schema: the legacy fixture, mapped into scenes/manuscripts, passes checkMigration(cutover) against the Rune 1.x baseline', async () => {
  const after = await takeManuscriptSnapshot(await rune2FromLegacy());
  assert.ok(after.manuscripts, 'read through the Rune 2.0 path');
  assertNoViolations(checkMigration(baseline, after, { stage: 'cutover' }), { labels: LABELS, context: 'legacy → Rune 2.0 schema' });
});

test('Rune 2.0 schema: Page ID = Scene ID, alternates are Unplaced in their Manuscript, and the REAL account_word_total still counts them', async () => {
  const target = await rune2FromLegacy();
  const after = await takeManuscriptSnapshot(target);
  assert.deepEqual(after.pages.map((p) => p.id), baseline.pages.map((p) => p.id), 'same prose ids, none invented');
  const { byProject } = expectedRune2Mapping(baseline);
  for (const p of baseline.projects) {
    assert.deepEqual(named(unplacedSceneIds(after, p.id)), named([...byProject.get(p.id).unplacedIds].sort()), LABELS[p.id]);
    assert.deepEqual(named(rune2OrderedPlacedSceneIds(after, p.id)), named(legacyOrderedManuscriptIds(baseline, p.id)), LABELS[p.id]);
  }
  assert.deepEqual(after.accountWordTotals, { [USERS.alice.id]: 3035, [USERS.bram.id]: 2740, [USERS.cora.id]: 0 });
  assert.equal(after.manuscripts.length, baseline.projects.length, 'one Manuscript per Project, including projects without chapters');
  const r = await target.query(`select count(*)::int as n from public.scenes where chapter_id is null`);
  assert.equal(r.rows[0].n, 7, 'h3b, h3c, h6a, h6b, a1a, t1a, t1c');
});

const RUNE2_NEGATIVE_CONTROLS = [
  ['Scenes get new ids', { faults: ['new-ids'] }, ['prose.row-survives', 'prose.no-invented-rows', 'history.row-unchanged']],
  ['version/updated_at are not carried over', { faults: ['reset-sync'] }, ['sync.page-version', 'sync.page-updated-at']],
  ['canonical siblings stay placed', { faults: ['keep-alternates'] }, ['cutover.placement', 'manuscript.ordered-ids', 'export.selection']],
  ['history on Unplaced Scenes is dropped', { faults: ['drop-history'] }, ['history.row-survives', 'history.row-count']],
  ['account_word_total counts placed Scenes only', {
    after: (d) => d.exec(`
      create or replace function public.account_word_total(p_candidate_scene_id uuid default null, p_candidate_word_count integer default null)
      returns integer language sql stable set search_path to '' as $$
        select coalesce(sum(s.word_count), 0)::int from public.scenes s
        join public.chapters c on c.id = s.chapter_id
        join public.manuscripts m on m.id = c.manuscript_id
        join public.projects p on p.id = m.project_id where p.user_id = auth.uid() $$;`),
  }, ['account.word-total', 'account.definition']],
];

for (const [name, { faults, after: sabotage }, expected] of RUNE2_NEGATIVE_CONTROLS) {
  test(`Rune 2.0 negative control: ${name} → ${expected.join(', ')}`, async () => {
    const target = await rune2FromLegacy({ faults });
    if (sabotage) await sabotage(target);
    const found = new Set(checkMigration(baseline, await takeManuscriptSnapshot(target), { stage: 'cutover' }).map((v) => v.invariant));
    for (const inv of expected) assert.ok(found.has(inv), `expected ${inv}; got ${[...found].join(', ') || 'nothing'}`);
  });
}
