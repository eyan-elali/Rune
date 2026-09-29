import { paragraphsWordCount, sceneDocument } from "@/lib/import/content";
import type { ImportItemPayload, ImportParagraph, ImportPayload, ImportScenePayload, Run } from "@/lib/import/types";

// Manuscript Import, confirmation (Rune 2.0, Milestone 15), behind
// POST /api/manuscript-import (a route handler rather than a server action:
// a novel's structure is larger than a server action's 1 MB body limit, and
// raising that limit would raise it for every action). The file was read and
// its structure corrected on the writer's device; this receives only the
// structure the writer confirmed. It checks the payload's shape, turns each
// Scene's paragraphs into the editor's stored form and counts its words
// exactly as the editor does (lib/import/content.ts — never a count from the
// client), then creates everything in ONE database call:
// import_manuscript_checked (migration 033) — a new Project, its Groups,
// Chapters and Scenes, in one transaction, owned by the caller. Nothing is
// written before that call, and a failed call writes nothing.
//
// Imported prose is ordinary manuscript data: it counts toward the ordered
// manuscript total and exports like any other. It is not writing activity:
// nothing here records a writing session, Today's Words or XP.
//
// Never logs prose.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string; wordLimitBlocked?: boolean };

// Works with the server Supabase client (route handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export type ImportResult = { projectId: string; created: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PARAGRAPHS = 400_000;

class PayloadError extends Error {}

function readRuns(value: unknown): Run[] {
  if (!Array.isArray(value)) throw new PayloadError();
  for (const r of value) {
    if (typeof r === "string") continue;
    if (!Array.isArray(r) || r.length !== 2 || typeof r[0] !== "string" || !Number.isInteger(r[1]) || r[1] < 0 || r[1] > 15) {
      throw new PayloadError();
    }
  }
  return value as Run[];
}

function readParagraph(value: unknown): ImportParagraph {
  if (Array.isArray(value)) return readRuns(value);
  if (value && typeof value === "object" && "q" in value) return { q: readRuns((value as { q: unknown }).q) };
  throw new PayloadError();
}

function optionalTitle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new PayloadError();
  return value.trim() || null;
}

type Budget = { paragraphs: number };

function sceneRow(scene: ImportScenePayload, budget: Budget) {
  if (!scene || typeof scene !== "object" || !Array.isArray(scene.paragraphs)) throw new PayloadError();
  budget.paragraphs += scene.paragraphs.length;
  if (budget.paragraphs > MAX_PARAGRAPHS) throw new PayloadError();
  const paragraphs = scene.paragraphs.map(readParagraph);
  return {
    title: optionalTitle(scene.title),
    content: sceneDocument(paragraphs),
    word_count: paragraphsWordCount(paragraphs),
  };
}

function itemRow(item: ImportItemPayload, budget: Budget): unknown {
  if (!item || typeof item !== "object") throw new PayloadError();
  if (item.kind === "group") {
    if (!Array.isArray(item.items)) throw new PayloadError();
    return { kind: "group", title: optionalTitle(item.title), items: item.items.map((i) => itemRow(i, budget)) };
  }
  if (item.kind === "chapter") {
    if (typeof item.title !== "string" || !Array.isArray(item.scenes)) throw new PayloadError();
    return {
      kind: "chapter",
      title: item.title.trim() || "Untitled chapter",
      scenes: item.scenes.map((s) => sceneRow(s, budget)),
    };
  }
  throw new PayloadError();
}

/** The database's form of a confirmed import: TipTap documents and editor word counts. Pure; throws on a malformed payload. */
export function importRows(payload: ImportPayload) {
  const budget: Budget = { paragraphs: 0 };
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.items) || !Array.isArray(payload.unplaced)) {
    throw new PayloadError();
  }
  return {
    title: typeof payload.title === "string" ? payload.title.trim() : "",
    manuscript: {
      items: payload.items.map((i) => itemRow(i, budget)),
      unplaced: payload.unplaced.map((s) => sceneRow(s, budget)),
    },
  };
}

/**
 * Creates a new Project from a confirmed import. `requestId` identifies this
 * confirmation (a client UUID reused by its retries): a retry after a lost
 * response returns the Project the first attempt created, and imports nothing
 * twice.
 */
export async function importManuscript(
  supabase: SupabaseLike,
  payload: ImportPayload,
  requestId: string
): Promise<ActionResult<ImportResult>> {
  let rows: ReturnType<typeof importRows>;
  try {
    rows = importRows(payload);
  } catch {
    return { data: null, error: "The import couldn’t be read. Nothing was created." };
  }

  const { data, error } = await supabase.rpc("import_manuscript_checked", {
    p_title: rows.title,
    p_manuscript: rows.manuscript,
    // Client-supplied: anything that is not a UUID just means "no deduplication".
    p_request_id: typeof requestId === "string" && UUID_RE.test(requestId) ? requestId : null,
  });
  if (error) return { data: null, error: "The import couldn’t be saved. Nothing was created." };
  const result = data as
    | { status: "ok"; created: boolean; project: { id: string } }
    | { status: "word_limit_blocked"; limit: number }
    | { status: "error"; error: string };
  if (result.status === "word_limit_blocked") {
    return {
      data: null,
      error: `This manuscript would take your account past its ${result.limit.toLocaleString()}-word limit. Nothing was created.`,
      wordLimitBlocked: true,
    };
  }
  if (result.status !== "ok") return { data: null, error: `${result.error}. Nothing was created.` };
  return { data: { projectId: result.project.id, created: result.created }, error: null };
}
