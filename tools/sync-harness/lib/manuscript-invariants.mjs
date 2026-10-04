// Rune 2.0 migration safety invariants: what it means to preserve a manuscript.
//
// Everything here is pure: it works on manuscript SNAPSHOTS, never on a live
// database. Snapshots come from `takeManuscriptSnapshot(db)`
// (./manuscript-snapshot.mjs) or `snapshotFromFixture(fixture)`
// (../fixtures/manuscript-fixture.mjs). Every Phase 1 stage is judged the same
// way:
//
//   const before = await takeManuscriptSnapshot(db);
//   …apply the migration step…
//   const after = await takeManuscriptSnapshot(db);
//   assertNoViolations(checkMigration(before, after, { stage: 'additive' }));
//
// Stages:
//   'additive' — schema introduction, ownership backfill, function-body
//                rewrites. No Page moves: placement and canonical flags are
//                unchanged, and the legacy canonical-aware rule is used on both
//                sides.
//   'cutover'  — the approved canonical cutover (architecture doc §42). Every
//                non-canonical sibling of a canonical Page becomes Unplaced,
//                every `is_canonical` is cleared, and the Rune 2.0 rule
//                ("every placed Scene") on `after` must reproduce the legacy
//                rule on `before`. Final Phase 1 verification runs this stage
//                against the original pre-Phase-1 baseline snapshot.
//
// Privacy: snapshots hold a content HASH, never prose. Violations carry IDs,
// counts, hashes and orderings only.
//
// Snapshot shape (all arrays sorted by id; timestamps are Postgres text so
// microseconds survive):
//   projects:        [{ id, userId, storedWordCount, updatedAt }]
//   chapters:        [{ id, projectId, position }]
//   pages:           [{ id, projectId, chapterId /* null = Unplaced */, position,
//                       isCanonical, wordCount, contentHash, version, updatedAt }]
//   writingSessions: [{ id, userId, projectId, pageId, wordsAdded, sessionDate, createdAt }]
//   users:           [userId]
//   accountWordTotals: { [userId]: number }   // what the free-limit total reports
// A snapshot of a Rune 2.0 database (scenes/manuscripts) uses the same shape
// (`pages` = Scenes, `pageId` = scene_id) and adds:
//   manuscripts:     [{ id, projectId }]
//   manuscriptId on every chapter and prose row.
// checkMigration() then also runs checkManuscriptOwnership() on `after`.
import { createHash } from 'node:crypto';

// ── content hashing ─────────────────────────────────────────────────────────

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Deterministic hash of a Page's TipTap JSON content, independent of key
 * order (jsonb does not preserve it). `null` content hashes to a fixed value.
 */
export function hashContent(content) {
  return 'sha256:' + createHash('sha256').update(content == null ? 'null' : stableStringify(content)).digest('hex');
}

// ── snapshot indexing ───────────────────────────────────────────────────────

const byPosition = (a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function index(snapshot) {
  if (snapshot.__index) return snapshot.__index;
  const chaptersByProject = new Map();
  for (const c of snapshot.chapters) {
    if (!chaptersByProject.has(c.projectId)) chaptersByProject.set(c.projectId, []);
    chaptersByProject.get(c.projectId).push(c);
  }
  for (const list of chaptersByProject.values()) list.sort(byPosition);
  const pagesByChapter = new Map();
  for (const p of snapshot.pages) {
    if (p.chapterId === null) continue;
    if (!pagesByChapter.has(p.chapterId)) pagesByChapter.set(p.chapterId, []);
    pagesByChapter.get(p.chapterId).push(p);
  }
  for (const list of pagesByChapter.values()) list.sort(byPosition);
  const idx = {
    projects: new Map(snapshot.projects.map((p) => [p.id, p])),
    chapters: new Map(snapshot.chapters.map((c) => [c.id, c])),
    pages: new Map(snapshot.pages.map((p) => [p.id, p])),
    sessions: new Map(snapshot.writingSessions.map((s) => [s.id, s])),
    chaptersByProject,
    pagesByChapter,
  };
  Object.defineProperty(snapshot, '__index', { value: idx, enumerable: false });
  return idx;
}

/** Chapters of a Project in manuscript order (position, then id). */
export function chaptersInOrder(snapshot, projectId) {
  return index(snapshot).chaptersByProject.get(projectId) ?? [];
}

/** Placed Pages/Scenes of a Chapter in prose order (position, then id). */
export function placedPagesInOrder(snapshot, chapterId) {
  return index(snapshot).pagesByChapter.get(chapterId) ?? [];
}

// ── the legacy (Rune 1.x) manuscript rule ───────────────────────────────────

/**
 * Pages the legacy canonical-aware rule selects for one Chapter: the canonical
 * Page alone if one exists, otherwise every Page in position order. Mirrors
 * src/lib/manuscript.ts, src/lib/projectWordCount.ts and
 * src/lib/export/projectExport.ts. Only placed Pages take part.
 */
export function legacyChapterSelection(snapshot, chapterId) {
  const pages = placedPagesInOrder(snapshot, chapterId);
  const canonical = pages.filter((p) => p.isCanonical);
  if (canonical.length > 1) {
    // The enforce_single_canonical trigger makes this impossible in production
    // (0 chapters today); the legacy code would pick an arbitrary one.
    throw new Error(`legacy rule undefined: chapter ${chapterId} has ${canonical.length} canonical pages`);
  }
  return canonical.length === 1 ? canonical : pages;
}

/**
 * The current ordered manuscript of a Project as [{ chapterId, pageIds }],
 * one entry per Chapter in order (Chapters without Pages have pageIds: []).
 */
export function legacyOrderedManuscript(snapshot, projectId) {
  return chaptersInOrder(snapshot, projectId).map((c) => ({
    chapterId: c.id,
    pageIds: legacyChapterSelection(snapshot, c.id).map((p) => p.id),
  }));
}

/** The current ordered manuscript of a Project as a flat list of Page IDs. */
export function legacyOrderedManuscriptIds(snapshot, projectId) {
  return legacyOrderedManuscript(snapshot, projectId).flatMap((c) => c.pageIds);
}

/**
 * What current manuscript export includes, in order: Chapters by position,
 * Chapters without Pages skipped (no heading), and per Chapter the
 * canonical-aware selection. Mirrors ManuscriptExportButton.tsx (the loader)
 * plus exportProjectAsPdf. Selection and order only, not rendering.
 */
export function legacyExportSelection(snapshot, projectId) {
  return legacyOrderedManuscript(snapshot, projectId).filter((c) => c.pageIds.length > 0);
}

// ── the Rune 2.0 rule ───────────────────────────────────────────────────────

/**
 * Rune 2.0: a Chapter's manuscript content is every placed Scene, in Scene
 * order. There is no canonical Scene; `isCanonical` is ignored.
 */
export function rune2OrderedManuscript(snapshot, projectId) {
  return chaptersInOrder(snapshot, projectId).map((c) => ({
    chapterId: c.id,
    pageIds: placedPagesInOrder(snapshot, c.id).map((p) => p.id),
  }));
}

export function rune2OrderedPlacedSceneIds(snapshot, projectId) {
  return rune2OrderedManuscript(snapshot, projectId).flatMap((c) => c.pageIds);
}

/**
 * Rune 2.0 export selection: every Chapter with at least one placed Scene, and
 * all its placed Scenes in order. (Scene breaks between adjacent Scenes are
 * rendering, not selection.) Unplaced Scenes are never included.
 */
export function rune2ExportSelection(snapshot, projectId) {
  return rune2OrderedManuscript(snapshot, projectId).filter((c) => c.pageIds.length > 0);
}

/** Unplaced Scenes of a Project (chapterId === null), sorted by id. */
export function unplacedSceneIds(snapshot, projectId) {
  return snapshot.pages.filter((p) => p.projectId === projectId && p.chapterId === null).map((p) => p.id).sort();
}

// ── the approved migration mapping (architecture doc §42) ──────────────────

/**
 * Expected Rune 2.0 placement for every existing Page, derived from a
 * pre-cutover snapshot:
 *   Case A — canonical Page stays placed; its non-canonical siblings → Unplaced.
 *   Case B — Chapter without a canonical Page: every Page stays placed.
 *
 * Returns { placement: Map<pageId, chapterId|null>, byProject: Map<projectId,
 * { placedIds, unplacedIds }> }. placedIds are in manuscript order.
 * unplacedIds are ordered by (former Chapter order, former Page position),
 * the audit's recommendation; the pool's order is not yet a product decision,
 * so checks compare unplaced membership, not order.
 */
export function expectedRune2Mapping(before) {
  const placement = new Map();
  const byProject = new Map();
  for (const project of before.projects) {
    const placedIds = [];
    const unplacedIds = [];
    for (const chapter of chaptersInOrder(before, project.id)) {
      const pages = placedPagesInOrder(before, chapter.id);
      const selected = new Set(legacyChapterSelection(before, chapter.id).map((p) => p.id));
      for (const page of pages) {
        if (selected.has(page.id)) {
          placement.set(page.id, chapter.id);
          placedIds.push(page.id);
        } else {
          placement.set(page.id, null);
          unplacedIds.push(page.id);
        }
      }
    }
    // Pages already Unplaced before the cutover (only possible on a re-run).
    for (const id of unplacedSceneIds(before, project.id)) {
      placement.set(id, null);
      unplacedIds.push(id);
    }
    byProject.set(project.id, { placedIds, unplacedIds });
  }
  return { placement, byProject };
}

/**
 * The approved cutover applied to a snapshot, as a model: siblings of each
 * canonical Page become Unplaced, every canonical flag is cleared, nothing else
 * changes. Tests use it to prove the checks accept a correct migration and to
 * build negative controls; the real migration is judged on its own snapshot.
 */
export function applyApprovedMapping(before) {
  const { placement } = expectedRune2Mapping(before);
  return {
    ...before,
    pages: before.pages.map((p) => ({ ...p, chapterId: placement.get(p.id), isCanonical: false })),
    projects: before.projects.map((p) => ({ ...p })),
    chapters: before.chapters.map((c) => ({ ...c })),
    writingSessions: before.writingSessions.map((s) => ({ ...s })),
    users: [...before.users],
    accountWordTotals: { ...before.accountWordTotals },
  };
}

// ── totals ──────────────────────────────────────────────────────────────────

const sumWords = (snapshot, ids) => ids.reduce((n, id) => n + index(snapshot).pages.get(id).wordCount, 0);

export function legacyOrderedWordTotal(snapshot, projectId) {
  return sumWords(snapshot, legacyOrderedManuscriptIds(snapshot, projectId));
}

export function rune2PlacedWordTotal(snapshot, projectId) {
  return sumWords(snapshot, rune2OrderedPlacedSceneIds(snapshot, projectId));
}

/**
 * The current free-limit definition (account_word_total, migration 011): the
 * sum of EVERY stored Page the user owns, canonical or not, placed or
 * Unplaced. Ownership is by Project, never by Chapter.
 */
export function modelAccountWordTotal(snapshot, userId) {
  const owned = new Set(snapshot.projects.filter((p) => p.userId === userId).map((p) => p.id));
  return snapshot.pages.filter((p) => owned.has(p.projectId)).reduce((n, p) => n + p.wordCount, 0);
}

// ── checks ──────────────────────────────────────────────────────────────────

function violation(invariant, { projectId = null, chapterId = null, pageId = null, sessionId = null, userId = null }, detail) {
  return { invariant, projectId, chapterId, pageId, sessionId, userId, detail };
}

function firstDifference(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return -1;
}

function sequenceDetail(label, expected, actual) {
  const i = firstDifference(expected, actual);
  return `${label}: expected ${expected.length} ids, got ${actual.length}; first difference at index ${i}` +
    ` (expected ${expected[i] ?? '∅'}, got ${actual[i] ?? '∅'})\n      expected [${expected.join(', ')}]\n      actual   [${actual.join(', ')}]`;
}

/** Every existing prose row survives with identical id, content hash and word count, in the same Project. */
export function checkProseSurvives(before, after) {
  const out = [];
  const a = index(after).pages;
  for (const p of before.pages) {
    const q = a.get(p.id);
    const at = { projectId: p.projectId, chapterId: p.chapterId, pageId: p.id };
    if (!q) { out.push(violation('prose.row-survives', at, 'page row is missing after the migration')); continue; }
    if (q.contentHash !== p.contentHash) out.push(violation('prose.content-hash', at, `content hash changed ${p.contentHash} → ${q.contentHash}`));
    if (q.wordCount !== p.wordCount) out.push(violation('prose.word-count', at, `word_count changed ${p.wordCount} → ${q.wordCount}`));
    if (q.projectId !== p.projectId) out.push(violation('prose.project', at, `page moved to project ${q.projectId}`));
  }
  const b = index(before).pages;
  for (const q of after.pages) {
    if (!b.has(q.id)) out.push(violation('prose.no-invented-rows', { projectId: q.projectId, chapterId: q.chapterId, pageId: q.id },
      `page row did not exist before the migration (${q.wordCount} words) — prose must not be copied or re-created`));
  }
  return out;
}

/**
 * Sync-sensitive metadata is untouched: a data step must not bump pages.version
 * / pages.updated_at (false conflicts for cached baselines) or
 * projects.updated_at (Dashboard ordering).
 */
export function checkSyncMetadataUntouched(before, after) {
  const out = [];
  const a = index(after);
  for (const p of before.pages) {
    const q = a.pages.get(p.id);
    if (!q) continue; // reported by checkProseSurvives
    const at = { projectId: p.projectId, chapterId: p.chapterId, pageId: p.id };
    if (q.version !== p.version) out.push(violation('sync.page-version', at, `version changed ${p.version} → ${q.version}`));
    if (q.updatedAt !== p.updatedAt) out.push(violation('sync.page-updated-at', at, `updated_at changed ${p.updatedAt} → ${q.updatedAt}`));
  }
  for (const p of before.projects) {
    const q = a.projects.get(p.id);
    if (q && q.updatedAt !== p.updatedAt) out.push(violation('sync.project-updated-at', { projectId: p.id }, `projects.updated_at changed ${p.updatedAt} → ${q.updatedAt}`));
  }
  return out;
}

/** Projects and Chapters survive with the same owner, Project and position; none are invented. */
export function checkStructureSurvives(before, after) {
  const out = [];
  const a = index(after);
  for (const p of before.projects) {
    const q = a.projects.get(p.id);
    if (!q) { out.push(violation('structure.project-survives', { projectId: p.id }, 'project is missing after the migration')); continue; }
    if (q.userId !== p.userId) out.push(violation('structure.project-owner', { projectId: p.id }, `owner changed ${p.userId} → ${q.userId}`));
    if (q.storedWordCount !== p.storedWordCount) out.push(violation('structure.project-stored-word-count', { projectId: p.id },
      `projects.word_count changed ${p.storedWordCount} → ${q.storedWordCount} (recomputing the cache is a separate, reported step)`));
  }
  for (const c of before.chapters) {
    const q = a.chapters.get(c.id);
    const at = { projectId: c.projectId, chapterId: c.id };
    if (!q) { out.push(violation('structure.chapter-survives', at, 'chapter is missing after the migration')); continue; }
    if (q.projectId !== c.projectId || q.position !== c.position) {
      out.push(violation('structure.chapter-unchanged', at, `chapter moved: project ${c.projectId}→${q.projectId}, position ${c.position}→${q.position}`));
    }
  }
  const b = index(before);
  for (const p of after.projects) if (!b.projects.has(p.id)) out.push(violation('structure.no-invented-projects', { projectId: p.id }, 'project did not exist before'));
  for (const c of after.chapters) if (!b.chapters.has(c.id)) out.push(violation('structure.no-invented-chapters', { projectId: c.projectId, chapterId: c.id }, 'chapter did not exist before'));
  return out;
}

const SESSION_FIELDS = ['userId', 'projectId', 'pageId', 'wordsAdded', 'sessionDate', 'createdAt'];

/** Writing history is untouched: same rows, same Page IDs, same words and dates. Never rewritten, never duplicated. */
export function checkWritingHistoryUntouched(before, after) {
  const out = [];
  const a = index(after).sessions;
  for (const s of before.writingSessions) {
    const at = { projectId: s.projectId, pageId: s.pageId, sessionId: s.id, userId: s.userId };
    const t = a.get(s.id);
    if (!t) { out.push(violation('history.row-survives', at, 'writing_sessions row is missing after the migration')); continue; }
    const changed = SESSION_FIELDS.filter((f) => t[f] !== s[f]);
    if (changed.length) out.push(violation('history.row-unchanged', at, changed.map((f) => `${f}: ${s[f]} → ${t[f]}`).join('; ')));
  }
  const b = index(before).sessions;
  for (const t of after.writingSessions) {
    if (!b.has(t.id)) out.push(violation('history.no-invented-rows', { projectId: t.projectId, pageId: t.pageId, sessionId: t.id, userId: t.userId },
      `writing_sessions row did not exist before (${t.wordsAdded} words on ${t.sessionDate})`));
  }
  // A page-keyed row must still point at an existing Scene (the FK cascades,
  // so in a real database a vanished Page takes its history with it).
  const scenes = index(after).pages;
  for (const t of after.writingSessions) {
    if (t.pageId && !scenes.has(t.pageId)) out.push(violation('history.page-exists', { projectId: t.projectId, pageId: t.pageId, sessionId: t.id, userId: t.userId },
      'writing_sessions row points at a Page that no longer exists'));
  }
  if (before.writingSessions.length !== after.writingSessions.length) {
    out.push(violation('history.row-count', {}, `writing_sessions rows ${before.writingSessions.length} → ${after.writingSessions.length}`));
  }
  return out;
}

/**
 * The free-limit account total is unchanged per user, and still matches the
 * current definition (every stored Page the user owns, placed or Unplaced).
 * This is what stops a migration from letting writers bypass the limit by
 * moving prose to Unplaced Scenes.
 */
export function checkAccountTotals(before, after) {
  const out = [];
  for (const userId of before.users) {
    const b = before.accountWordTotals[userId];
    const a = after.accountWordTotals[userId];
    if (a !== b) out.push(violation('account.word-total', { userId }, `account_word_total changed ${b} → ${a}`));
    const model = modelAccountWordTotal(after, userId);
    if (a !== undefined && a !== model) {
      out.push(violation('account.definition', { userId },
        `account_word_total reports ${a}, but every stored Scene the user owns sums to ${model} (placed ${model - unplacedWords(after, userId)}, Unplaced ${unplacedWords(after, userId)})`));
    }
  }
  return out;
}

function unplacedWords(snapshot, userId) {
  const owned = new Set(snapshot.projects.filter((p) => p.userId === userId).map((p) => p.id));
  return snapshot.pages.filter((p) => owned.has(p.projectId) && p.chapterId === null).reduce((n, p) => n + p.wordCount, 0);
}

/**
 * The ordered manuscript and the export selection are preserved per Project.
 * `afterRule` chooses how `after` is read: 'legacy' before cutover, 'rune2'
 * (every placed Scene, canonical ignored) after it.
 */
export function checkManuscriptOrderAndExport(before, after, { afterRule }) {
  const out = [];
  const ordered = afterRule === 'rune2' ? rune2OrderedPlacedSceneIds : legacyOrderedManuscriptIds;
  const exported = afterRule === 'rune2' ? rune2ExportSelection : legacyExportSelection;
  const total = afterRule === 'rune2' ? rune2PlacedWordTotal : legacyOrderedWordTotal;
  for (const project of before.projects) {
    const at = { projectId: project.id };
    const expected = legacyOrderedManuscriptIds(before, project.id);
    const actual = ordered(after, project.id);
    if (firstDifference(expected, actual) !== -1) out.push(violation('manuscript.ordered-ids', at, sequenceDetail('ordered manuscript', expected, actual)));

    const tb = legacyOrderedWordTotal(before, project.id);
    const ta = total(after, project.id);
    if (tb !== ta) out.push(violation('manuscript.ordered-word-total', at, `ordered manuscript total ${tb} → ${ta}`));

    const eb = legacyExportSelection(before, project.id);
    const ea = exported(after, project.id);
    const hb = eb.map((c) => c.chapterId);
    const ha = ea.map((c) => c.chapterId);
    if (firstDifference(hb, ha) !== -1) out.push(violation('export.chapter-headings', at, sequenceDetail('exported chapters', hb, ha)));
    const sb = eb.flatMap((c) => c.pageIds);
    const sa = ea.flatMap((c) => c.pageIds);
    if (firstDifference(sb, sa) !== -1) out.push(violation('export.selection', at, sequenceDetail('exported pages', sb, sa)));
  }
  return out;
}

/** Placed Scene order must be unambiguous: no position ties among placed Scenes in a Chapter, or among a Project's Chapters. */
export function checkUnambiguousOrder(snapshot) {
  const out = [];
  const seen = new Map();
  for (const p of snapshot.pages) {
    if (p.chapterId === null) continue;
    const key = `${p.chapterId}:${p.position}`;
    if (seen.has(key)) out.push(violation('order.page-position-tie', { projectId: p.projectId, chapterId: p.chapterId, pageId: p.id }, `shares position ${p.position} with ${seen.get(key)}`));
    else seen.set(key, p.id);
  }
  const seenCh = new Map();
  for (const c of snapshot.chapters) {
    const key = `${c.projectId}:${c.position}`;
    if (seenCh.has(key)) out.push(violation('order.chapter-position-tie', { projectId: c.projectId, chapterId: c.id }, `shares position ${c.position} with ${seenCh.get(key)}`));
    else seenCh.set(key, c.id);
  }
  return out;
}

/** 'additive' stages move nothing: every Page keeps its Chapter, position and canonical flag. */
export function checkPlacementUnchanged(before, after) {
  const out = [];
  const a = index(after).pages;
  for (const p of before.pages) {
    const q = a.get(p.id);
    if (!q) continue;
    const changed = ['chapterId', 'position', 'isCanonical'].filter((f) => q[f] !== p[f]);
    if (changed.length) out.push(violation('placement.unchanged', { projectId: p.projectId, chapterId: p.chapterId, pageId: p.id },
      changed.map((f) => `${f}: ${p[f]} → ${q[f]}`).join('; ')));
  }
  return out;
}

/** The cutover matches the approved mapping exactly, and no canonical flag survives. */
export function checkCanonicalCutover(before, after) {
  const out = [];
  const { placement } = expectedRune2Mapping(before);
  const a = index(after).pages;
  for (const p of before.pages) {
    const q = a.get(p.id);
    if (!q) continue;
    const want = placement.get(p.id);
    if (q.chapterId !== want) {
      const describe = (c) => (c === null ? 'Unplaced' : `chapter ${c}`);
      out.push(violation('cutover.placement', { projectId: p.projectId, chapterId: p.chapterId, pageId: p.id },
        `expected ${describe(want)}, got ${describe(q.chapterId)}`));
    }
  }
  for (const q of after.pages) {
    if (q.isCanonical) out.push(violation('cutover.canonical-cleared', { projectId: q.projectId, chapterId: q.chapterId, pageId: q.id }, 'is_canonical is still true'));
  }
  return out;
}

/**
 * Rune 2.0 ownership (only for a snapshot with `manuscripts`): every Project
 * has exactly one Manuscript; every Chapter and Scene belongs to a Manuscript
 * of its own Project; a placed Scene's Chapter is in the Scene's Manuscript.
 */
export function checkManuscriptOwnership(snapshot) {
  if (!snapshot.manuscripts) return [];
  const out = [];
  const byProject = new Map();
  for (const m of snapshot.manuscripts) byProject.set(m.projectId, [...(byProject.get(m.projectId) ?? []), m.id]);
  const manuscriptProject = new Map(snapshot.manuscripts.map((m) => [m.id, m.projectId]));
  for (const p of snapshot.projects) {
    const n = (byProject.get(p.id) ?? []).length;
    if (n !== 1) out.push(violation('ownership.one-manuscript-per-project', { projectId: p.id }, `project has ${n} manuscripts`));
  }
  const chapterManuscript = new Map(snapshot.chapters.map((c) => [c.id, c.manuscriptId]));
  for (const c of snapshot.chapters) {
    if (manuscriptProject.get(c.manuscriptId) !== c.projectId) {
      out.push(violation('ownership.chapter-manuscript', { projectId: c.projectId, chapterId: c.id }, `chapter's manuscript ${c.manuscriptId} is not its project's`));
    }
  }
  for (const q of snapshot.pages) {
    const at = { projectId: q.projectId, chapterId: q.chapterId, pageId: q.id };
    if (manuscriptProject.get(q.manuscriptId) !== q.projectId) out.push(violation('ownership.scene-manuscript', at, `scene's manuscript ${q.manuscriptId} is not its project's`));
    if (q.chapterId !== null && chapterManuscript.get(q.chapterId) !== q.manuscriptId) {
      out.push(violation('ownership.scene-chapter-same-manuscript', at, `placed in chapter of manuscript ${chapterManuscript.get(q.chapterId)}, belongs to ${q.manuscriptId}`));
    }
  }
  return out;
}

/**
 * Runs every invariant for a migration stage. Returns violations (empty = pass).
 * `ignore` drops named invariants, e.g. ['structure.project-stored-word-count']
 * for the separate, reported cache recompute.
 */
export function checkMigration(before, after, { stage, ignore = [] } = {}) {
  if (stage !== 'additive' && stage !== 'cutover') throw new Error(`checkMigration: unknown stage ${stage}`);
  const all = [
    ...checkProseSurvives(before, after),
    ...checkStructureSurvives(before, after),
    ...checkSyncMetadataUntouched(before, after),
    ...checkWritingHistoryUntouched(before, after),
    ...checkAccountTotals(before, after),
    ...checkUnambiguousOrder(after),
    ...checkManuscriptOrderAndExport(before, after, { afterRule: stage === 'cutover' ? 'rune2' : 'legacy' }),
    ...(stage === 'cutover' ? checkCanonicalCutover(before, after) : checkPlacementUnchanged(before, after)),
    ...checkManuscriptOwnership(after),
  ];
  return all.filter((v) => !ignore.includes(v.invariant));
}

// ── reporting ───────────────────────────────────────────────────────────────

/**
 * One line per violation: the invariant, then the IDs involved, then the
 * detail. `labels` (id → short structural name, e.g. from the fixture) makes
 * fixture failures readable. Never contains prose.
 */
export function formatViolations(violations, labels = {}) {
  const name = (id) => (labels[id] ? `${id} (${labels[id]})` : id);
  return violations.map((v) => {
    const ids = ['userId', 'projectId', 'chapterId', 'pageId', 'sessionId']
      .filter((k) => v[k])
      .map((k) => `${k.replace('Id', '')}=${name(v[k])}`)
      .join(' ');
    return `  ✗ [${v.invariant}] ${ids}\n      ${v.detail}`;
  }).join('\n');
}

/** Throws an AssertionError-style Error listing every violation, grouped by invariant count. */
export function assertNoViolations(violations, { labels = {}, context = 'manuscript migration invariants' } = {}) {
  if (violations.length === 0) return;
  const counts = {};
  for (const v of violations) counts[v.invariant] = (counts[v.invariant] ?? 0) + 1;
  const summary = Object.entries(counts).map(([k, n]) => `${k}×${n}`).join(', ');
  const err = new Error(`${context}: ${violations.length} violation(s) — ${summary}\n${formatViolations(violations, labels)}`);
  err.violations = violations;
  throw err;
}
