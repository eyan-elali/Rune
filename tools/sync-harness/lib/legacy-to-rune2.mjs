// TEST PROTOTYPE — not the production migration.
//
// Copies the manuscripts of a Rune 1.x database (the legacy baseline, `pages`)
// into an empty Rune 2.0 database (schema.sql, `scenes`) using the approved
// mapping (architecture doc §42):
//
//   * every Page becomes the Scene with the SAME id, content, word count,
//     position, version and timestamps — empty Pages included (an Unplaced
//     Scene's position is renumbered: see below);
//   * Case A: in a Chapter with a canonical Page, that Page stays placed and
//     every non-canonical sibling becomes Unplaced (chapter_id null);
//     Case B: every Page of a Chapter without a canonical Page stays placed;
//   * Projects and Chapters keep their ids, positions and timestamps; each
//     Project gets its Manuscript (created by trg_project_manuscript);
//   * writing history keeps its ids, with scene_id = the old page_id;
//   * projects.word_count is carried over verbatim, stale values included: the
//     Scene copy runs with the scenes_refresh_project_word_count trigger
//     (migration 020) disabled, so recomputing the cache stays a separate,
//     reported step (checkMigration's structure.project-stored-word-count).
//
// Its purpose is to prove, with checkMigration(), that the Rune 2.0 schema can
// receive real Rune 1.x manuscripts without loss. The real Rune 1.x → Rune 2.0
// migration is a separate, future task: it must also handle stale clients,
// queued offline saves keyed by Page ID, the save_page_checked contract, and
// production rollout, none of which this prototype addresses.
//
// Both databases are read and written as the loading superuser (no RLS).
// `faults` deliberately breaks one rule, for negative controls:
//   'new-ids'          Scenes get fresh ids instead of their Page ids
//   'reset-sync'       version and updated_at are left to their defaults
//   'keep-alternates'  canonical siblings stay placed (no Case A)
//   'drop-history'     writing history on Unplaced Scenes is not copied
import { grantBetaAccess } from './pg.mjs';
export async function prototypeLegacyToRune2(legacyDb, rune2Db, { faults = [] } = {}) {
  const fault = (name) => faults.includes(name);
  const rows = async (sql) => (await legacyDb.query(sql)).rows;

  // ── writers ──
  for (const u of await rows(`
      select u.id, u.raw_user_meta_data, p.subscription_tier, p.subscription_status, e.pricing_cohort
      from auth.users u
      join public.profiles p on p.id = u.id
      left join public.user_pricing_entitlements e on e.user_id = u.id
      order by u.id`)) {
    await rune2Db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, $2)`, [u.id, u.raw_user_meta_data ?? {}]);
    // Existing writers keep access (as 052 accepts every account it finds).
    await grantBetaAccess(rune2Db, u.id);
    await rune2Db.query(`update public.profiles set subscription_tier = $2, subscription_status = $3 where id = $1`,
      [u.id, u.subscription_tier, u.subscription_status]);
    if (u.pricing_cohort) {
      await rune2Db.query(`update public.user_pricing_entitlements set pricing_cohort = $2 where user_id = $1`, [u.id, u.pricing_cohort]);
    }
  }

  // ── projects (the trigger creates one Manuscript each) ──
  for (const p of await rows(`
      select id, user_id, title, description, cover_color, word_count, chapter_goal, is_pinned,
             created_at::text as created_at, updated_at::text as updated_at
      from public.projects order by id`)) {
    await rune2Db.query(
      `insert into public.projects (id, user_id, title, description, cover_color, word_count, chapter_goal, is_pinned, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [p.id, p.user_id, p.title, p.description, p.cover_color, p.word_count, p.chapter_goal, p.is_pinned, p.created_at, p.updated_at]);
  }
  const manuscriptOf = new Map((await rune2Db.query(`select id, project_id from public.manuscripts`)).rows.map((r) => [r.project_id, r.id]));

  // ── chapters ──
  for (const c of await rows(`
      select id, project_id, title, position, is_completed,
             created_at::text as created_at, updated_at::text as updated_at
      from public.chapters order by id`)) {
    await rune2Db.query(
      `insert into public.chapters (id, manuscript_id, title, position, is_completed, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [c.id, manuscriptOf.get(c.project_id), c.title, c.position, c.is_completed, c.created_at, c.updated_at]);
  }

  // ── pages → scenes, with the §42 placement ──
  // Unplaced positions must be unique per Manuscript (migration 022): the
  // alternates of different Chapters would otherwise keep tied in-Chapter
  // positions, so each Unplaced list is numbered 0..n-1 in (old position, id)
  // order. Placed Scenes keep their positions.
  await rune2Db.exec(`alter table public.scenes disable trigger scenes_refresh_project_word_count`);
  const idMap = new Map();
  const unplaced = new Set();
  const nextUnplaced = new Map();
  for (const p of await rows(`
      select p.id, p.chapter_id, c.project_id, p.title, p.content, p.word_count, p.position, p.version,
             p.created_at::text as created_at, p.updated_at::text as updated_at,
             (not p.is_canonical and exists (
                select 1 from public.pages k where k.chapter_id = p.chapter_id and k.is_canonical)) as becomes_unplaced
      from public.pages p join public.chapters c on c.id = p.chapter_id
      order by p.position, p.id`)) {
    const toUnplaced = p.becomes_unplaced && !fault('keep-alternates');
    const sceneId = fault('new-ids') ? crypto.randomUUID() : p.id;
    idMap.set(p.id, sceneId);
    let position = p.position;
    if (toUnplaced) {
      unplaced.add(p.id);
      position = nextUnplaced.get(p.project_id) ?? 0;
      nextUnplaced.set(p.project_id, position + 1);
    }
    const cols = ['id', 'manuscript_id', 'chapter_id', 'title', 'content', 'word_count', 'position'];
    const vals = [sceneId, manuscriptOf.get(p.project_id), toUnplaced ? null : p.chapter_id, p.title,
      p.content === null ? null : JSON.stringify(p.content), p.word_count, position];
    if (!fault('reset-sync')) {
      cols.push('version', 'created_at', 'updated_at');
      vals.push(p.version, p.created_at, p.updated_at);
    }
    await rune2Db.query(
      `insert into public.scenes (${cols.join(', ')}) values (${cols.map((_, i) => (cols[i] === 'content' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ')})`,
      vals);
  }
  await rune2Db.exec(`alter table public.scenes enable trigger scenes_refresh_project_word_count`);

  // ── writing history, still attached to the same prose ids ──
  for (const s of await rows(`
      select id, user_id, project_id, page_id, words_added, session_date::text as session_date, created_at::text as created_at
      from public.writing_sessions order by id`)) {
    if (fault('drop-history') && s.page_id && unplaced.has(s.page_id)) continue;
    await rune2Db.query(
      `insert into public.writing_sessions (id, user_id, project_id, scene_id, words_added, session_date, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [s.id, s.user_id, s.project_id, s.page_id ? idMap.get(s.page_id) : null, s.words_added, s.session_date, s.created_at]);
  }
}
