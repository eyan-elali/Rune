import type { Project, Chapter, ManuscriptGroup, PlacedScene } from "@/lib/types";
import { orderChaptersInManuscript } from "@/lib/manuscriptStructure";
import { defaultExportName, exportFileName } from "./formats";
import { layoutPdf, newPdf } from "./pdf";
import { planExport, readAllRows } from "./plan";

// The manuscript PDF of the Projects page (ManuscriptExportButton), on the
// one export pipeline (plan.ts): the same document the Rune 2.0 export dialog
// makes as a PDF. Kept with its original signatures for that button.

export { planManuscriptExport, type ExportedChapter } from "./plan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

/**
 * Loads what the manuscript export renders: the Project's Chapters in
 * manuscript reading order, its Groups, and the placed Scenes (a page at a
 * time, so no manuscript is ever cut short). Unplaced Scenes and Trash are
 * never exported. Throws on a failed read so a partial manuscript is never exported.
 */
export async function loadManuscriptForExport(
  supabase: SupabaseLike,
  projectId: string
): Promise<{
  chapters: Chapter[];
  scenesPerChapter: Record<string, PlacedScene[]>;
  groups: ManuscriptGroup[];
}> {
  const { data: manuscript, error: manuscriptErr } = await supabase
    .from("manuscripts")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (manuscriptErr) throw manuscriptErr;
  if (!manuscript) return { chapters: [], scenesPerChapter: {}, groups: [] };

  const chapters = (
    await readAllRows<Chapter & { trashed_at?: string | null }>(() =>
      supabase.from("chapters").select("*").eq("manuscript_id", manuscript.id)
    )
  ).filter((c) => !c.trashed_at);
  if (chapters.length === 0) return { chapters: [], scenesPerChapter: {}, groups: [] };

  const groups = await readAllRows<ManuscriptGroup>(() =>
    supabase.from("manuscript_groups").select("*").eq("manuscript_id", manuscript.id)
  );
  const scenes = await readAllRows<PlacedScene & { trashed_at?: string | null }>(() =>
    supabase.from("scenes").select("*").eq("manuscript_id", manuscript.id)
  );

  const scenesPerChapter: Record<string, PlacedScene[]> = {};
  for (const scene of scenes.sort((a, b) => a.position - b.position)) {
    if (scene.chapter_id === null || scene.trashed_at) continue;
    (scenesPerChapter[scene.chapter_id] ??= []).push(scene);
  }
  return {
    chapters: orderChaptersInManuscript(chapters, groups),
    scenesPerChapter,
    groups,
  };
}

export async function exportProjectAsPdf(
  project: Pick<Project, "title">,
  chapters: Chapter[],
  scenesPerChapter: Record<string, PlacedScene[]>,
  groups: Pick<ManuscriptGroup, "id" | "parent_group_id" | "position" | "title">[] = []
): Promise<void> {
  const document = planExport(
    {
      projectTitle: project.title,
      groups: groups.map((g) => ({ ...g, title: g.title ?? null })),
      chapters,
      scenes: Object.values(scenesPerChapter).flat(),
    },
    { kind: "manuscript" }
  );
  const doc = await newPdf();
  layoutPdf(doc, document);
  doc.save(exportFileName(defaultExportName(document), "pdf"));
}
