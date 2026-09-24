import type { Chapter, UnplacedScene } from "@/lib/types";

// Rune 2.0 manuscript reads shared by server actions, route handlers and
// browser components: Project → Manuscript → Chapters → placed Scenes.
//
// Chapters belong to a Manuscript (chapters.manuscript_id), not directly to a
// Project, so every "chapters of this project" read resolves the Project's
// Manuscript first. Placed Scenes are read by chapter_id, which by
// construction excludes Unplaced Scenes (chapter_id null) — the ordered
// manuscript never includes them.
//
// Deliberately flat queries (no PostgREST embeds), so the regression harness
// runs this exact code against real Postgres + RLS.

// Works with both the server and the browser Supabase client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

type QueryError = { message: string; code?: string | null };

export type SceneSummary = { id: string; word_count: number };
export type ChapterWithScenes = Chapter & { scenes: SceneSummary[] };
export type UnplacedSceneSummary = SceneSummary & { title: string };

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
 * Every Chapter of the given Projects, by position, each with its placed
 * Scenes (id, word_count) by position. Projects without Chapters map to [].
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

  const { data: chapters, error: chapterError } = await supabase
    .from("chapters")
    .select("*")
    .in("manuscript_id", [...manuscripts.data.keys()])
    .order("position", { ascending: true });
  if (chapterError) return { data: byProject, error: chapterError };

  const chapterRows = (chapters ?? []) as Chapter[];
  const scenesByChapter = new Map<string, SceneSummary[]>();
  if (chapterRows.length > 0) {
    const { data: scenes, error: sceneError } = await supabase
      .from("scenes")
      .select("id, chapter_id, word_count")
      .in("chapter_id", chapterRows.map((c) => c.id))
      .order("position", { ascending: true });
    if (sceneError) return { data: byProject, error: sceneError };
    for (const s of (scenes ?? []) as (SceneSummary & { chapter_id: string })[]) {
      const list = scenesByChapter.get(s.chapter_id) ?? [];
      list.push({ id: s.id, word_count: s.word_count });
      scenesByChapter.set(s.chapter_id, list);
    }
  }

  for (const chapter of chapterRows) {
    const projectId = manuscripts.data.get(chapter.manuscript_id);
    if (!projectId) continue;
    byProject[projectId].push({ ...chapter, scenes: scenesByChapter.get(chapter.id) ?? [] });
  }
  return { data: byProject, error: null };
}

/** One Project's Chapters by position, each with its placed Scenes. */
export async function getChaptersWithScenes(
  supabase: SupabaseLike,
  projectId: string
): Promise<{ data: ChapterWithScenes[]; error: QueryError | null }> {
  const { data, error } = await getChaptersWithScenesByProject(supabase, [projectId]);
  return { data: data[projectId] ?? [], error };
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
    .select("id, title, word_count")
    .eq("manuscript_id", manuscriptId)
    .is("chapter_id", null)
    .order("position", { ascending: true });
  if (error) return { data: [], error };
  return { data: (data ?? []) as UnplacedSceneSummary[], error: null };
}
