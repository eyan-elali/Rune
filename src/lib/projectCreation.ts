import type { Chapter, Project } from "@/lib/types";

// The one path that creates a Project, shared by the New Project dialog, the
// dashboard's first-story form and onboarding: create_project_checked
// (migration 021) creates the Project, its Manuscript, "Chapter 1" and its
// first Scene "Scene 1" in one database transaction, under the per-account
// lock. Either all four exist afterwards or none do. (Rune 2.0 has no
// free-word limit: migration 037.)
//
// requestId identifies ONE creation attempt (a client-generated UUID reused
// by its retries). If the Project already exists for it — the first response
// was lost — the database returns that Project (created: false) and writes
// nothing, so a retry never creates a second Project.

// Works with the server Supabase client (actions and route handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export type CreateProjectInput = {
  title: string;
  description?: string | null;
  coverColor?: string | null;
  /** The first Scene's TipTap JSON (onboarding's first sentence), or null for an empty Scene. */
  firstSceneContent?: Record<string, unknown> | null;
  firstSceneWordCount?: number;
  requestId?: string | null;
};

export type CreateProjectResult =
  | {
      status: "ok";
      /** false: a retry of an attempt that already created this Project; nothing was written. */
      created: boolean;
      project: Project;
      /** The Project's first Chapter and its first Scene (null only on a retry, if since removed). */
      chapter: Chapter | null;
      scene_id: string | null;
    }
  | { status: "error"; error: string };

/** The longest Project title the app accepts (a rename; creation trims, as the database does). */
export const PROJECT_TITLE_MAX = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createProjectChecked(
  supabase: SupabaseLike,
  input: CreateProjectInput
): Promise<CreateProjectResult> {
  const { data, error } = await supabase.rpc("create_project_checked", {
    p_title: input.title.trim(),
    p_description: input.description ?? null,
    p_cover_color: input.coverColor ?? null,
    p_first_scene_content: input.firstSceneContent ?? null,
    p_first_scene_word_count: input.firstSceneWordCount ?? 0,
    // Client-supplied: anything that is not a UUID just means "no deduplication".
    p_request_id: input.requestId && UUID_RE.test(input.requestId) ? input.requestId : null,
  });
  if (error) return { status: "error", error: error.message };
  return data as CreateProjectResult;
}
