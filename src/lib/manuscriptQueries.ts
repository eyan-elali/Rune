import type { Chapter, ManuscriptGroup, UnplacedScene } from "@/lib/types";
import { orderChaptersInManuscript } from "@/lib/manuscriptStructure";
import { readAllRows } from "@/lib/readAllRows";

// Rune 2.0 manuscript reads shared by server actions, route handlers and
// browser components: Project → Manuscript → (Groups →) Chapters → placed
// Scenes.
//
// Chapter lists are in manuscript READING order (Groups first-to-last, depth
// first: lib/manuscriptStructure.ts), not by chapters.position, which only
// orders a Chapter among its own parent's children since migration 022.
//
// Chapters belong to a Manuscript (chapters.manuscript_id), not directly to a
// Project, so every "chapters of this project" read resolves the Project's
// Manuscript first. Placed Scenes are those of a Chapter read alongside
// them; Unplaced Scenes (chapter_id null) are never placed — the ordered
// manuscript never includes them.
//
// Deliberately flat queries (no PostgREST embeds), so the regression harness
// runs this exact code against real Postgres + RLS.

// Works with both the server and the browser Supabase client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

type QueryError = { message: string; code?: string | null };

export type SceneSummary = { id: string; title: string; word_count: number; version: number };
export type ChapterWithScenes = Chapter & { scenes: SceneSummary[] };
export type UnplacedSceneSummary = SceneSummary;

/** The Project's Manuscript id, or null when the Project is missing or not visible to the caller. */
export async function getManuscriptIdForProject(
  supabase: SupabaseLike,
  projectId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("manuscripts")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Manuscript id → Project id for the given Projects (only those visible to the caller). */
export async function getProjectIdsByManuscript(
  supabase: SupabaseLike,
  projectIds: string[]
): Promise<{ data: Map<string, string>; error: QueryError | null }> {
  const map = new Map<string, string>();
  if (projectIds.length === 0) return { data: map, error: null };
  const { data, error } = await supabase
    .from("manuscripts")
    .select("id, project_id")
    .in("project_id", projectIds);
  if (error) return { data: map, error };
  for (const m of (data ?? []) as { id: string; project_id: string }[]) {
    map.set(m.id, m.project_id);
  }
  return { data: map, error: null };
}

/**
 * Every Chapter of the given Projects, in manuscript reading order, each with
 * its placed Scenes (id, title, word_count — no prose) by position. Projects without Chapters
 * map to [].
 */
export async function getChaptersWithScenesByProject(
  supabase: SupabaseLike,
  projectIds: string[]
): Promise<{ data: Record<string, ChapterWithScenes[]>; error: QueryError | null }> {
  const byProject: Record<string, ChapterWithScenes[]> = {};
  for (const id of projectIds) byProject[id] = [];

  const manuscripts = await getProjectIdsByManuscript(supabase, projectIds);
  if (manuscripts.error) return { data: byProject, error: manuscripts.error };
  if (manuscripts.data.size === 0) return { data: byProject, error: null };

  // Chapters, Groups and Scenes all hang off the Manuscript ids, so they are
  // read side by side: two round trips in all, not four (every Project open
  // and every refresh after an edit waits on this). Each a page at a time,
  // never cut short at the API's row cap (a writer's Projects together can
  // hold more Scenes than one request returns).
  const manuscriptIds = [...manuscripts.data.keys()];
  let chapterRows: Chapter[];
  let groupRows: Pick<ManuscriptGroup, "id" | "manuscript_id" | "parent_group_id" | "position">[];
  let sceneRows: (SceneSummary & { chapter_id: string | null; position: number })[];
  try {
    [chapterRows, groupRows, sceneRows] = await Promise.all([
      readAllRows<Chapter>(() => supabase.from("chapters").select("*").in("manuscript_id", manuscriptIds)),
      readAllRows<Pick<ManuscriptGroup, "id" | "manuscript_id" | "parent_group_id" | "position">>(() =>
        supabase.from("manuscript_groups").select("id, manuscript_id, parent_group_id, position").in("manuscript_id", manuscriptIds)
      ),
      readAllRows<SceneSummary & { chapter_id: string | null; position: number }>(() =>
        supabase.from("scenes").select("id, chapter_id, title, word_count, version, position").in("manuscript_id", manuscriptIds)
      ),
    ]);
  } catch (e) {
    return { data: byProject, error: e as QueryError };
  }
  chapterRows.sort(byPosition);

  // Placed Scenes only: those of a Chapter read above. An Unplaced Scene
  // (chapter_id null) — or one under a Chapter not shown — never joins the
  // ordered manuscript.
  const scenesByChapter = new Map<string, SceneSummary[]>(chapterRows.map((c) => [c.id, []]));
  for (const s of sceneRows.sort(byPosition)) {
    const list = s.chapter_id === null ? undefined : scenesByChapter.get(s.chapter_id);
    list?.push({ id: s.id, title: s.title, word_count: s.word_count, version: s.version });
  }

  for (const chapter of chapterRows) {
    const projectId = manuscripts.data.get(chapter.manuscript_id);
    if (!projectId) continue;
    byProject[projectId].push({ ...chapter, scenes: scenesByChapter.get(chapter.id) ?? [] });
  }
  for (const [manuscriptId, projectId] of manuscripts.data) {
    byProject[projectId] = orderChaptersInManuscript(
      byProject[projectId],
      groupRows.filter((g) => g.manuscript_id === manuscriptId)
    );
  }
  return { data: byProject, error: null };
}

/** By position, then id: one order, whatever order the rows were read in. */
function byPosition(a: { id: string; position: number }, b: { id: string; position: number }): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** One Project's Chapters in manuscript reading order, each with its placed Scenes. */
export async function getChaptersWithScenes(
  supabase: SupabaseLike,
  projectId: string
): Promise<{ data: ChapterWithScenes[]; error: QueryError | null }> {
  const { data, error } = await getChaptersWithScenesByProject(supabase, [projectId]);
  return { data: data[projectId] ?? [], error };
}

/** The Project's Manuscript Groups (unordered: order them with lib/manuscriptStructure.ts). */
export async function getManuscriptGroups(
  supabase: SupabaseLike,
  projectId: string
): Promise<{ data: ManuscriptGroup[]; error: QueryError | null }> {
  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: [], error: null };
  const { data, error } = await supabase
    .from("manuscript_groups")
    .select("*")
    .eq("manuscript_id", manuscriptId);
  if (error) return { data: [], error };
  return { data: (data ?? []) as ManuscriptGroup[], error: null };
}

/** The Project that owns a Manuscript, or null when it is not visible to the caller. */
export async function getProjectIdForManuscript(
  supabase: SupabaseLike,
  manuscriptId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("manuscripts")
    .select("project_id")
    .eq("id", manuscriptId)
    .maybeSingle();
  return (data?.project_id as string | undefined) ?? null;
}

/**
 * The Project's Unplaced Scenes (chapter_id null), by position, full rows.
 * Unplaced position is only an append order: moving a Scene to Unplaced puts
 * it last. It has no narrative meaning.
 */
export async function getUnplacedScenes(
  supabase: SupabaseLike,
  projectId: string
): Promise<{ data: UnplacedScene[]; error: QueryError | null }> {
  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: [], error: null };
  const { data, error } = await supabase
    .from("scenes")
    .select("*")
    .eq("manuscript_id", manuscriptId)
    .is("chapter_id", null)
    .order("position", { ascending: true });
  if (error) return { data: [], error };
  return { data: (data ?? []) as UnplacedScene[], error: null };
}

/** id, title and word_count of the Project's Unplaced Scenes, by position — no prose. */
export async function getUnplacedSceneSummaries(
  supabase: SupabaseLike,
  projectId: string
): Promise<{ data: UnplacedSceneSummary[]; error: QueryError | null }> {
  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: [], error: null };
  const { data, error } = await supabase
    .from("scenes")
    .select("id, title, word_count, version")
    .eq("manuscript_id", manuscriptId)
    .is("chapter_id", null)
    .order("position", { ascending: true });
  if (error) return { data: [], error };
  return { data: (data ?? []) as UnplacedSceneSummary[], error: null };
}
