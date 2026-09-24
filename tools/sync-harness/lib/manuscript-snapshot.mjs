// Reads a manuscript snapshot (the shape documented in
// ./manuscript-invariants.mjs) from a test database. Rows are read as the
// loading superuser, so RLS cannot hide anything. The account totals are the
// exception: they call the REAL public.account_word_total() as each user,
// because that function (and its RLS-dependent joins) is what the invariant
// protects.
//
// Prose never leaves this function: `content` is hashed and dropped.
import { asUser } from './pg.mjs';
import { hashContent } from './manuscript-invariants.mjs';

export async function takeManuscriptSnapshot(db) {
  const projects = (await db.query(`
    select id, user_id, word_count, updated_at::text as updated_at
    from public.projects order by id`)).rows.map((r) => ({
    id: r.id, userId: r.user_id, storedWordCount: r.word_count, updatedAt: r.updated_at,
  }));

  const chapters = (await db.query(`
    select id, project_id, position from public.chapters order by id`)).rows.map((r) => ({
    id: r.id, projectId: r.project_id, position: r.position,
  }));

  // A Page's Project is found through its Chapter — the only ownership path
  // the schema has today. An Unplaced Scene (chapter_id null) needs the
  // Manuscript path, which does not exist yet.
  const pageRows = (await db.query(`
    select p.id, p.chapter_id, c.project_id, p.position, p.is_canonical, p.word_count,
           p.content, p.version, p.updated_at::text as updated_at
    from public.pages p
    left join public.chapters c on c.id = p.chapter_id
    order by p.id`)).rows;
  const pages = pageRows.map((r) => {
    if (r.project_id === null) {
      throw new Error(
        `takeManuscriptSnapshot: page ${r.id} has no chapter, and this reader has no Manuscript ownership path yet. ` +
        'Extend it to resolve the Project through pages.manuscript_id when the Manuscript ownership schema lands.'
      );
    }
    return {
      id: r.id,
      projectId: r.project_id,
      chapterId: r.chapter_id,
      position: r.position,
      isCanonical: r.is_canonical,
      wordCount: r.word_count,
      contentHash: hashContent(r.content),
      version: r.version,
      updatedAt: r.updated_at,
    };
  });

  const writingSessions = (await db.query(`
    select id, user_id, project_id, page_id, words_added,
           session_date::text as session_date, created_at::text as created_at
    from public.writing_sessions order by id`)).rows.map((r) => ({
    id: r.id, userId: r.user_id, projectId: r.project_id, pageId: r.page_id,
    wordsAdded: r.words_added, sessionDate: r.session_date, createdAt: r.created_at,
  }));

  const users = (await db.query(`select id from public.profiles order by id`)).rows.map((r) => r.id);
  const accountWordTotals = {};
  for (const userId of users) {
    const r = await asUser(db, userId, (tx) => tx.query(`select public.account_word_total() as n`));
    accountWordTotals[userId] = r.rows[0].n;
  }

  return { projects, chapters, pages, writingSessions, users, accountWordTotals };
}
