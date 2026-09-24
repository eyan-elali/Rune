// Production-shaped SYNTHETIC manuscript fixture for the Rune 2.0 migration
// invariants. It reproduces the data shapes the Phase 1 audit found in
// production (2026-09-24 catalog: canonical chapters with alternates, chapters
// without canonical pages, empty pages, a chapter without pages, projects
// without chapters, stale stored totals, page-keyed writing history), at a
// small scale.
//
// No real writing appears here. Every prose body is generated from a fixed
// invented vocabulary, and each non-empty page starts with a marker token
// (`fixture-marker-<label>`) so tests can recognise pages in rendered export
// output without reading prose.
import { createAuthUser } from '../lib/pg.mjs';
import { hashContent, modelAccountWordTotal } from '../lib/manuscript-invariants.mjs';

const id = (kind, n) => `${kind.repeat(8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ── users ───────────────────────────────────────────────────────────────────
// alice: starter_2k free writer whose all-pages total (3,035) is OVER the
//        2,000 limit while her ordered manuscripts total only 1,550 — the
//        exact gap a migration could open if Unplaced Scenes stopped counting.
// bram:  legacy_15k writer.
// cora:  owns only a project without chapters.
export const USERS = {
  alice: { id: id('a', 1), cohort: 'starter_2k' },
  bram: { id: id('a', 2), cohort: 'legacy_15k' },
  cora: { id: id('a', 3), cohort: 'starter_2k' },
};

// ── projects ────────────────────────────────────────────────────────────────
export const PROJECTS = {
  hollow: { id: id('b', 1), user: 'alice', storedWordCount: 1450, updatedAt: '2026-08-03 18:00:00.000001+00' },
  ash: { id: id('b', 2), user: 'alice', storedWordCount: 999, updatedAt: '2026-08-03 12:30:00.250000+00' }, // stale: true total is 100
  tide: { id: id('b', 3), user: 'bram', storedWordCount: 1320, updatedAt: '2026-08-06 07:15:00.500000+00' },
  bramEmpty: { id: id('b', 4), user: 'bram', storedWordCount: 0, updatedAt: '2026-06-01 10:00:00.000000+00' }, // no chapters
  coraEmpty: { id: id('b', 5), user: 'cora', storedWordCount: 0, updatedAt: '2026-06-02 11:00:00.000000+00' }, // no chapters
};

// ── chapters ────────────────────────────────────────────────────────────────
// Listed in a deliberately scrambled insert order; positions are 1-based with
// gaps, like production.
export const CHAPTERS = {
  'hollow.ch1': { id: id('c', 1), project: 'hollow', position: 1, shape: 'one-page chapter' },
  'hollow.ch2': { id: id('c', 2), project: 'hollow', position: 2, shape: 'single canonical page, no siblings' },
  'hollow.ch3': { id: id('c', 3), project: 'hollow', position: 3, shape: 'Case A: canonical A + alternates B, C' },
  'hollow.ch4': { id: id('c', 4), project: 'hollow', position: 5, shape: 'Case B: three pages incl. an empty one, inserted out of order' },
  'hollow.ch5': { id: id('c', 5), project: 'hollow', position: 4, shape: 'chapter without pages' },
  'hollow.ch6': { id: id('c', 6), project: 'hollow', position: 7, shape: 'canonical is the LAST page, alternates before it (position gap before chapter)' },
  'ash.ch1': { id: id('c', 7), project: 'ash', position: 1, shape: 'EMPTY canonical page with a prose sibling' },
  'ash.ch2': { id: id('c', 8), project: 'ash', position: 2, shape: 'Case B: two pages' },
  'tide.ch1': { id: id('c', 9), project: 'tide', position: 1, shape: 'canonical in the middle, alternates either side' },
  'tide.ch2': { id: id('c', 10), project: 'tide', position: 2, shape: 'one-page chapter whose page is empty (null content)' },
  'tide.ch3': { id: id('c', 11), project: 'tide', position: 3, shape: 'Case B: two pages' },
};

// ── pages ───────────────────────────────────────────────────────────────────
// content: 'prose' (synthetic, `words` tokens), 'null' (SQL NULL, like 46
// production pages) or 'empty-doc' (an empty TipTap document).
const P = (n, chapter, position, words, { canonical = false, content = 'prose', version = 1, updatedAt }) =>
  ({ id: id('d', n), chapter, position, words, canonical, content, version, updatedAt });

export const PAGES = {
  h1a: P(1, 'hollow.ch1', 0, 120, { version: 4, updatedAt: '2026-07-02 09:00:00.111111+00' }),
  h2a: P(2, 'hollow.ch2', 0, 300, { canonical: true, version: 6, updatedAt: '2026-07-03 09:00:00.222222+00' }),
  h3a: P(3, 'hollow.ch3', 0, 410, { canonical: true, version: 9, updatedAt: '2026-08-02 20:00:00.333333+00' }),
  h3b: P(4, 'hollow.ch3', 1, 380, { version: 3, updatedAt: '2026-08-01 21:00:00.444444+00' }),
  h3c: P(5, 'hollow.ch3', 2, 95, { version: 2, updatedAt: '2026-07-20 08:00:00.555555+00' }),
  h4c: P(8, 'hollow.ch4', 2, 150, { version: 5, updatedAt: '2026-08-02 22:00:00.666666+00' }), // inserted first
  h4a: P(6, 'hollow.ch4', 0, 200, { version: 2, updatedAt: '2026-07-25 10:00:00.777777+00' }),
  h4b: P(7, 'hollow.ch4', 1, 0, { content: 'null', version: 1, updatedAt: '2026-07-25 10:05:00.888888+00' }),
  h6a: P(9, 'hollow.ch6', 0, 250, { version: 2, updatedAt: '2026-08-03 09:00:00.000100+00' }),
  h6b: P(10, 'hollow.ch6', 1, 260, { version: 3, updatedAt: '2026-08-03 17:00:00.000200+00' }),
  h6c: P(11, 'hollow.ch6', 2, 270, { canonical: true, version: 7, updatedAt: '2026-08-03 18:00:00.000001+00' }),
  a1a: P(12, 'ash.ch1', 0, 500, { version: 4, updatedAt: '2026-08-03 12:00:00.000300+00' }),
  a1b: P(13, 'ash.ch1', 1, 0, { canonical: true, content: 'empty-doc', version: 2, updatedAt: '2026-08-03 12:30:00.250000+00' }),
  a2a: P(14, 'ash.ch2', 0, 60, { version: 1, updatedAt: '2026-07-10 08:00:00.000400+00' }),
  a2b: P(15, 'ash.ch2', 1, 40, { version: 1, updatedAt: '2026-07-10 08:10:00.000500+00' }),
  t1a: P(16, 'tide.ch1', 0, 700, { version: 5, updatedAt: '2026-08-05 06:00:00.000600+00' }),
  t1b: P(17, 'tide.ch1', 1, 650, { canonical: true, version: 8, updatedAt: '2026-08-05 07:00:00.000700+00' }),
  t1c: P(18, 'tide.ch1', 2, 720, { version: 4, updatedAt: '2026-08-05 07:30:00.000800+00' }),
  t2a: P(19, 'tide.ch2', 0, 0, { content: 'null', version: 1, updatedAt: '2026-07-01 07:00:00.000900+00' }),
  t3a: P(20, 'tide.ch3', 0, 330, { version: 3, updatedAt: '2026-08-06 07:00:00.001000+00' }),
  t3b: P(21, 'tide.ch3', 1, 340, { version: 2, updatedAt: '2026-08-06 07:15:00.500000+00' }),
};

// ── writing history ─────────────────────────────────────────────────────────
// Page-keyed rows on canonical pages, on alternates (future Unplaced Scenes)
// and on Case B pages, plus the legacy per-project (page_id null) and
// per-user (project_id and page_id null) rows production still holds.
const S = (n, user, project, page, words, date, createdAt) =>
  ({ id: id('e', n), user, project, page, words, date, createdAt });

export const WRITING_SESSIONS = [
  S(1, 'alice', 'hollow', 'h3b', 380, '2026-08-01', '2026-08-01 21:00:00.100000+00'),
  S(2, 'alice', 'hollow', 'h3a', 410, '2026-08-01', '2026-08-01 22:00:00.200000+00'),
  S(3, 'alice', 'hollow', 'h3a', 25, '2026-08-02', '2026-08-02 20:00:00.300000+00'),
  S(4, 'alice', 'hollow', 'h4c', 150, '2026-08-02', '2026-08-02 22:00:00.400000+00'),
  S(5, 'alice', 'hollow', 'h6b', 260, '2026-08-03', '2026-08-03 17:00:00.500000+00'),
  S(6, 'alice', 'ash', 'a1a', 500, '2026-08-03', '2026-08-03 12:00:00.600000+00'),
  S(7, 'alice', 'hollow', null, 40, '2026-07-30', '2026-07-30 19:00:00.700000+00'),
  S(8, 'alice', null, null, 12, '2026-07-29', '2026-07-29 18:00:00.800000+00'),
  S(9, 'bram', 'tide', 't1c', 720, '2026-08-05', '2026-08-05 07:30:00.900000+00'),
  S(10, 'bram', 'tide', 't1b', 650, '2026-08-05', '2026-08-05 07:00:00.000001+00'),
  S(11, 'bram', 'tide', 't3a', 330, '2026-08-06', '2026-08-06 07:00:00.000002+00'),
  S(12, 'bram', 'tide', null, 15, '2026-08-04', '2026-08-04 06:00:00.000003+00'),
];

// ── synthetic prose ─────────────────────────────────────────────────────────

const VOCAB = ['vellum', 'quill', 'lantern', 'ember', 'cinder', 'bramble', 'moth', 'ink', 'tallow', 'loam', 'sable', 'willow', 'flint'];

export const markerFor = (pageLabel) => `fixture-marker-${pageLabel}`;
export const chapterTitleFor = (chapterLabel) => `fixture-chapter-${chapterLabel.replace('.', '-')}`;

/** Deterministic TipTap document of exactly `words` tokens, the first being the page's marker. */
export function syntheticDoc(pageLabel, words) {
  const tokens = [markerFor(pageLabel)];
  for (let i = 1; i < words; i++) tokens.push(VOCAB[(i * 7 + pageLabel.length) % VOCAB.length]);
  const paragraphs = [];
  for (let i = 0; i < tokens.length; i += 40) {
    paragraphs.push({ type: 'paragraph', content: [{ type: 'text', text: tokens.slice(i, i + 40).join(' ') }] });
  }
  return { type: 'doc', content: paragraphs };
}

export function pageContent(pageLabel) {
  const p = PAGES[pageLabel];
  if (p.content === 'null') return null;
  if (p.content === 'empty-doc') return { type: 'doc', content: [{ type: 'paragraph' }] };
  return syntheticDoc(pageLabel, p.words);
}

// ── lookups ─────────────────────────────────────────────────────────────────

export const pageId = (label) => PAGES[label].id;
export const chapterId = (label) => CHAPTERS[label].id;
export const projectId = (label) => PROJECTS[label].id;

/** id → readable structural label, for failure messages. */
export const LABELS = Object.fromEntries([
  ...Object.entries(USERS).map(([k, v]) => [v.id, `user ${k}`]),
  ...Object.entries(PROJECTS).map(([k, v]) => [v.id, `project ${k}`]),
  ...Object.entries(CHAPTERS).map(([k, v]) => [v.id, k]),
  ...Object.entries(PAGES).map(([k, v]) => [v.id, `${v.chapter}.${k}${v.canonical ? '*' : ''}`]),
  ...WRITING_SESSIONS.map((s) => [s.id, `session ${s.id.slice(-2)}`]),
]);

/** Page label for a page id (reverse lookup). */
export const pageLabelOf = Object.fromEntries(Object.entries(PAGES).map(([k, v]) => [v.id, k]));

// ── model snapshot and seeding ──────────────────────────────────────────────

// timestamptz::text as Postgres prints it (UTC): trailing fractional zeros
// trimmed, e.g. '…09:00:00.000100+00' → '…09:00:00.0001+00'.
const pgText = (ts) => ts.replace(/\.(\d*?)0+\+/, (_, f) => (f ? `.${f}+` : '+'));

/** The fixture as a manuscript snapshot, without a database. */
export function snapshotFromFixture() {
  const snapshot = {
    projects: Object.values(PROJECTS).map((p) => ({
      id: p.id, userId: USERS[p.user].id, storedWordCount: p.storedWordCount, updatedAt: pgText(p.updatedAt),
    })),
    chapters: Object.values(CHAPTERS).map((c) => ({ id: c.id, projectId: PROJECTS[c.project].id, position: c.position })),
    pages: Object.entries(PAGES).map(([label, p]) => ({
      id: p.id,
      projectId: PROJECTS[CHAPTERS[p.chapter].project].id,
      chapterId: CHAPTERS[p.chapter].id,
      position: p.position,
      isCanonical: p.canonical,
      wordCount: p.words,
      contentHash: hashContent(pageContent(label)),
      version: p.version,
      updatedAt: pgText(p.updatedAt),
    })),
    writingSessions: WRITING_SESSIONS.map((s) => ({
      id: s.id,
      userId: USERS[s.user].id,
      projectId: s.project ? PROJECTS[s.project].id : null,
      pageId: s.page ? PAGES[s.page].id : null,
      wordsAdded: s.words,
      sessionDate: s.date,
      createdAt: pgText(s.createdAt),
    })),
    users: Object.values(USERS).map((u) => u.id),
    accountWordTotals: {},
  };
  const byId = (a, b) => (a.id < b.id ? -1 : 1);
  for (const k of ['projects', 'chapters', 'pages', 'writingSessions']) snapshot[k].sort(byId);
  snapshot.users.sort();
  for (const u of snapshot.users) snapshot.accountWordTotals[u] = modelAccountWordTotal(snapshot, u);
  return snapshot;
}

/**
 * Seeds the fixture into a database already holding the production baseline
 * (src/lib/supabase/schema.sql). Runs as the superuser; the signup trigger
 * creates each profile and entitlements row. No UPDATE touches `pages`, so
 * versions and timestamps are exactly the fixture's.
 */
export async function seedFixture(db) {
  for (const u of Object.values(USERS)) {
    await createAuthUser(db, u.id);
    await db.query(`update public.user_pricing_entitlements set pricing_cohort = $2 where user_id = $1`, [u.id, u.cohort]);
  }
  for (const [label, p] of Object.entries(PROJECTS)) {
    await db.query(
      `insert into public.projects (id, user_id, title, word_count, updated_at) values ($1, $2, $3, $4, $5)`,
      [p.id, USERS[p.user].id, `fixture-project-${label}`, p.storedWordCount, p.updatedAt]);
  }
  for (const [label, c] of Object.entries(CHAPTERS)) {
    await db.query(
      `insert into public.chapters (id, project_id, title, position) values ($1, $2, $3, $4)`,
      [c.id, PROJECTS[c.project].id, chapterTitleFor(label), c.position]);
  }
  for (const [label, p] of Object.entries(PAGES)) {
    const content = pageContent(label);
    await db.query(
      `insert into public.pages (id, chapter_id, title, content, word_count, position, is_canonical, version, updated_at)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
      [p.id, CHAPTERS[p.chapter].id, `Page ${p.position + 1}`, content === null ? null : JSON.stringify(content),
        p.words, p.position, p.canonical, p.version, p.updatedAt]);
  }
  for (const s of WRITING_SESSIONS) {
    await db.query(
      `insert into public.writing_sessions (id, user_id, project_id, page_id, words_added, session_date, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [s.id, USERS[s.user].id, s.project ? PROJECTS[s.project].id : null, s.page ? PAGES[s.page].id : null,
        s.words, s.date, s.createdAt]);
  }
}
