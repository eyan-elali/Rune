// Reads a manuscript snapshot (the shape documented in
// ./manuscript-invariants.mjs) from a test database. Rows are read as the
// loading superuser, so RLS cannot hide anything. The account totals are the
// exception: they call the REAL public.account_word_total() as each user,
// because that function (and its RLS-dependent joins) is what the invariant
// protects.
//
// Two schemas are understood, detected from the database:
//   legacy (Rune 1.x) — prose in `pages`, ownership Page → Chapter → Project.
//   rune2  (migration 015 / schema.sql) — prose in `scenes`, ownership
//          Scene → Manuscript → Project; chapter_id null = Unplaced.
// Both produce the same snapshot shape, so checkMigration() can compare a
// legacy database with a Rune 2.0 one. The prose list keeps the key `pages`
// (and history rows keep `pageId`): it is the list of prose rows, whose IDs a
// Rune 1.x → Rune 2.0 migration must carry over unchanged (Page ID = Scene ID).
// A rune2 snapshot additionally carries `manuscripts` and a `manuscriptId` on
// every chapter and prose row.
//
// Prose never leaves this function: `content` is hashed and dropped.
import { asUser } from './pg.mjs';
import { hashContent } from './manuscript-invariants.mjs';

/** 'rune2' if the database has the Rune 2.0 manuscript tables, 'legacy' if it has `pages`. */
export async function manuscriptSchemaOf(db) {
  const r = await db.query(`
    select to_regclass('public.scenes') is not null as scenes,
           to_regclass('public.manuscripts') is not null as manuscripts,
           to_regclass('public.pages') is not null as pages`);
  const { scenes, manuscripts, pages } = r.rows[0];
  if (scenes && manuscripts && !pages) return 'rune2';
  if (pages && !scenes && !manuscripts) return 'legacy';
  throw new Error(`takeManuscriptSnapshot: unrecognised manuscript schema (scenes: ${scenes}, manuscripts: ${manuscripts}, pages: ${pages})`);
}

const proseRow = (r, extra = {}) => ({
  id: r.id,
  projectId: r.project_id,
  chapterId: r.chapter_id,
  position: r.position,
  isCanonical: r.is_canonical,
  wordCount: r.word_count,
  contentHash: hashContent(r.content),
  version: r.version,
  updatedAt: r.updated_at,
  ...extra,
});

export async function takeManuscriptSnapshot(db) {
  const schema = await manuscriptSchemaOf(db);

  const projects = (await db.query(`
    select id, user_id, word_count, updated_at::text as updated_at
    from public.projects order by id`)).rows.map((r) => ({
    id: r.id, userId: r.user_id, storedWordCount: r.word_count, updatedAt: r.updated_at,
  }));

  let chapters;
  let pages;
  let manuscripts;
  let sessionKey;
  if (schema === 'legacy') {
    chapters = (await db.query(`
      select id, project_id, position from public.chapters order by id`)).rows.map((r) => ({
      id: r.id, projectId: r.project_id, position: r.position,
    }));
    // A Rune 1.x Page's Project is found only through its Chapter; a legacy
    // `pages` row cannot be Unplaced (chapter_id is NOT NULL there).
    const rows = (await db.query(`
      select p.id, p.chapter_id, c.project_id, p.position, p.is_canonical, p.word_count,
             p.content, p.version, p.updated_at::text as updated_at
      from public.pages p
      left join public.chapters c on c.id = p.chapter_id
      order by p.id`)).rows;
    pages = rows.map((r) => {
      if (r.project_id === null) throw new Error(`takeManuscriptSnapshot: legacy page ${r.id} has no Chapter`);
      return proseRow(r);
    });
    sessionKey = 'page_id';
  } else {
    manuscripts = (await db.query(`
      select id, project_id from public.manuscripts order by id`)).rows.map((r) => ({ id: r.id, projectId: r.project_id }));
    chapters = (await db.query(`
      select c.id, m.project_id, c.manuscript_id, c.position
      from public.chapters c join public.manuscripts m on m.id = c.manuscript_id
      order by c.id`)).rows.map((r) => ({
      id: r.id, projectId: r.project_id, position: r.position, manuscriptId: r.manuscript_id,
    }));
    // Ownership through the Manuscript, so Unplaced Scenes (chapter_id null)
    // are read like placed ones. Rune 2.0 has no canonical flag.
    pages = (await db.query(`
      select s.id, s.chapter_id, m.project_id, s.manuscript_id, s.position, false as is_canonical,
             s.word_count, s.content, s.version, s.updated_at::text as updated_at
      from public.scenes s
      join public.manuscripts m on m.id = s.manuscript_id
      order by s.id`)).rows.map((r) => proseRow(r, { manuscriptId: r.manuscript_id }));
    sessionKey = 'scene_id';
  }

  const writingSessions = (await db.query(`
    select id, user_id, project_id, ${sessionKey} as prose_id, words_added,
           session_date::text as session_date, created_at::text as created_at
    from public.writing_sessions order by id`)).rows.map((r) => ({
    id: r.id, userId: r.user_id, projectId: r.project_id, pageId: r.prose_id,
    wordsAdded: r.words_added, sessionDate: r.session_date, createdAt: r.created_at,
  }));

  const users = (await db.query(`select id from public.profiles order by id`)).rows.map((r) => r.id);
  const accountWordTotals = {};
  for (const userId of users) {
    const r = await asUser(db, userId, (tx) => tx.query(`select public.account_word_total() as n`));
    accountWordTotals[userId] = r.rows[0].n;
  }

  const snapshot = { projects, chapters, pages, writingSessions, users, accountWordTotals };
  if (manuscripts) snapshot.manuscripts = manuscripts;
  return snapshot;
}
