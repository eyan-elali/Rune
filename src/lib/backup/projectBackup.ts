import { buildManuscriptOutline } from "@/lib/manuscriptStructure";
import { safeFileName } from "@/lib/export/formats";
import { renderMarkdown } from "@/lib/export/markdown";
import { planExport, type ExportChapterRow, type ExportGroupRow, type ExportSceneRow } from "@/lib/export/plan";
import { proseBlocks, type TNode } from "@/lib/export/prose";
import { ZipWriter } from "@/lib/export/zipWriter";

// Whole-Project Backup (Milestone 19): a complete, inspectable archive of one
// Project, made on the writer's device — so their work never depends on Rune
// to be read. Not the manuscript export: that is the book; this is everything
// Rune holds for the Project, Trash included.
//
// Read: every row of each kind below, active and in Trash, through the one
// owner-checked read-only function read_project_backup (migration 041), a
// page at a time; the Project and Manuscript rows through ordinary reads.
// Nothing is written anywhere, and nothing is kept on the server: the archive
// exists only in this browser's memory until it is saved.
//
// Written: a ZIP of JSON files (every row exactly as stored, canonical ids and
// all) plus readable Markdown copies of the manuscript and the Pages, with a
// manifest (format and version, counts, the file list) and a README. The
// layout is BACKUP_FORMAT_VERSION 1; see README_TEXT for what each file holds
// and what a future restore would need.
//
// Not included: device and interface state (open tabs, scroll positions,
// panel and navigator state, unsent drafts, offline caches and sync queues),
// derived data Rune recomputes (search, backlinks), account settings,
// billing, and XP.

export const BACKUP_FORMAT = "rune-project-backup";
export const BACKUP_FORMAT_VERSION = 1;

/** What read_project_backup reads, and how many rows to ask for at a time (large rows, smaller pages). */
export const BACKUP_KINDS = {
  groups: 500,
  chapters: 500,
  scenes: 100,
  scene_property_definitions: 500,
  scene_property_values: 500,
  scene_views: 500,
  revision_notes: 500,
  scene_revisions: 50,
  milestones: 200,
  milestone_scenes: 500,
  workspace_nodes: 500,
  workspace_folders: 500,
  workspace_documents: 100,
  workspace_collections: 500,
  workspace_collection_properties: 500,
  workspace_collection_views: 500,
  workspace_collection_entries: 200,
  workspace_entry_values: 500,
  object_references: 500,
  writing_sessions: 500,
  writing_goals: 500,
  project_notes: 500,
} as const;

export type BackupKind = keyof typeof BACKUP_KINDS;
export type Row = Record<string, unknown> & { id?: string };

export type BackupData = {
  project: Row & { id: string; title: string };
  manuscript: Row & { id: string };
  rows: Record<BackupKind, Row[]>;
};

export class BackupUnavailableError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

/** Every row of one kind, following the function's cursor until it ends. */
async function readKind(supabase: SupabaseLike, projectId: string, kind: BackupKind): Promise<Row[]> {
  const rows: Row[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await supabase.rpc("read_project_backup", {
      p_project_id: projectId,
      p_kind: kind,
      p_after: after,
      p_limit: BACKUP_KINDS[kind],
    });
    if (error) {
      if (error.code === "PGRST202" || /read_project_backup/.test(error.message ?? "")) {
        throw new BackupUnavailableError("Project backups need a database update that isn’t in place yet.");
      }
      throw error;
    }
    if (data?.status !== "ok") throw new BackupUnavailableError("This project isn’t available to back up.");
    rows.push(...(data.rows as Row[]));
    if (!data.next) return rows;
    after = data.next as string;
  }
}

/**
 * Reads everything a backup holds, as the signed-in writer. `onProgress` is
 * told each kind as it is read. Throws on any failed read: a backup is
 * complete or it isn't made.
 */
export async function loadProjectBackup(
  supabase: SupabaseLike,
  projectId: string,
  onProgress?: (kind: BackupKind, index: number, total: number) => void
): Promise<BackupData> {
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id, title, description, cover_color, word_count, chapter_goal, is_pinned, created_at, updated_at")
    .eq("id", projectId)
    .maybeSingle();
  if (projectErr) throw projectErr;
  const { data: manuscript, error: manuscriptErr } = await supabase
    .from("manuscripts")
    .select("id, project_id, created_at, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (manuscriptErr) throw manuscriptErr;
  if (!project || !manuscript) throw new BackupUnavailableError("This project isn’t available to back up.");

  const kinds = Object.keys(BACKUP_KINDS) as BackupKind[];
  const rows = {} as Record<BackupKind, Row[]>;
  for (const [i, kind] of kinds.entries()) {
    onProgress?.(kind, i, kinds.length);
    rows[kind] = await readKind(supabase, projectId, kind);
  }
  return { project, manuscript, rows };
}

// ── The archive ──────────────────────────────────────────────────────────────

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const byPosition = (a: Row, b: Row) => Number(a.position) - Number(b.position) || String(a.id).localeCompare(String(b.id));
const idSet = (rows: Row[], keep: (r: Row) => boolean) => new Set(rows.filter(keep).map((r) => String(r.id)));
const trashed = (r: Row) => r.trashed_at != null;

/** A readable Markdown copy of a TipTap document (a Page), under its title. */
function readableMarkdown(title: string, content: unknown): string {
  const nodes = ((content as { content?: TNode[] } | null)?.content ?? []) as TNode[];
  return renderMarkdown({
    scope: "scene",
    projectTitle: title,
    subject: title,
    blocks: [
      { kind: "title", text: title },
      { kind: "prose", blocks: proseBlocks(nodes), headingBase: 0 },
    ],
    stats: { chapters: 0, scenes: 0, words: 0, unplacedScenes: 0 },
  });
}

export const README_TEXT = `RUNE PROJECT BACKUP
===================

This archive is a complete copy of one Rune project, made on your device.
It holds everything Rune keeps for the project, including what is in its
Trash, so your work never depends on Rune to be read. Every file is plain
JSON or Markdown (UTF-8) and can be opened with any text editor.

  manifest.json              what this is: format "${BACKUP_FORMAT}", its version,
                             when it was made, counts, and every file listed
  project.json               the project and its manuscript record
  manuscript/manuscript.md   the manuscript, readable: chapters in order, then
                             Unplaced Scenes (not what is in Trash)
  manuscript/structure.json  Groups, Chapters and the order of everything:
                             the reading order, each Chapter's Scenes, the
                             Unplaced Scenes, and what is in Trash
  manuscript/scenes/<id>.json      one Scene each: its text (TipTap JSON), title,
                                   placement, words and version; "in_trash"
  manuscript/scene-properties.json Scene property definitions and values
  manuscript/scene-views.json      saved Scene Views
  revision-notes.json        every Revision Note, on the manuscript, a Group,
                             a Chapter or a Scene ("in_trash" when its Chapter
                             or Scene is in Trash)
  history/<scene-id>.json    Scene History: earlier texts of each Scene
                             ("no-scene.json": texts a Milestone keeps of
                             Scenes since deleted)
  milestones/<id>.json       named Manuscript Milestones: the structure then,
                             and which History text each Scene had
  workspace/tree.json        the Workspace's Folders and order (nodes)
  workspace/pages/<id>.json  one Page each (and <id>.md, readable)
  workspace/collections/<id>.json  one Collection each: its properties, Views,
                             Entries (text included) and their values
  references.json            links between Scenes, Pages and Entries
  writing/sessions.json      your writing days for this project (words by day)
  writing/goals.json         the project's goals
  legacy/checklist.json      the older project checklist (Rune 1.x), if any

Identity and relationships: every row keeps its Rune id, and rows refer to
each other by those ids exactly as Rune stores them (a Scene's chapter_id, a
note's target_id, a reference's source and target). Order is kept by each
row's "position" and in structure.json. Trash: a row in Trash has a
"trashed_at" time and "in_trash": true; everything else is active.

Not included: device and interface state (open tabs, scroll positions,
unsent drafts, offline caches, sync queues), things Rune recomputes (search,
backlinks), and account, billing and progression settings.

Restoring: Rune can't yet read this archive back in. It was designed so that
it can: a future restore would recreate the rows of each file in dependency
order (project, manuscript, Groups, Chapters, Scenes, properties and Views,
notes, History, Milestones, the Workspace, references), keeping every id (or
mapping them consistently), and would put Trash back in Trash. Until then,
your text is all here, readable, in manuscript/ and workspace/.
`;

/** The archive's files, by path: pure, so the same data always gives the same archive. */
export function backupFiles(data: BackupData, at: Date): Map<string, string> {
  const r = data.rows;
  const files = new Map<string, string>();

  const chapterInTrash = idSet(r.chapters, trashed);
  const sceneInTrash = idSet(r.scenes, trashed);
  const collectionInTrash = idSet(r.workspace_collections, trashed);
  const entryInTrash = idSet(r.workspace_collection_entries, (e) => trashed(e) || collectionInTrash.has(String(e.collection_id)));
  const docInTrash = idSet(r.workspace_documents, trashed);
  const folderInTrash = idSet(r.workspace_folders, trashed);
  const withTrash = (row: Row, inTrash: boolean) => ({ ...row, in_trash: inTrash });

  // The manuscript's structure, in order.
  const activeChapters = r.chapters.filter((c) => !trashed(c));
  const outline = buildManuscriptOutline(
    r.groups.map((g) => ({ ...g, id: String(g.id), parent_group_id: (g.parent_group_id as string | null) ?? null, position: Number(g.position) })),
    activeChapters.map((c) => ({ ...c, id: String(c.id), group_id: (c.group_id as string | null) ?? null, position: Number(c.position) }))
  );
  const readingOrder: { type: "group" | "chapter"; id: string; depth: number }[] = [];
  const walk = (nodes: typeof outline) => {
    for (const n of nodes) {
      if (n.kind === "group") {
        readingOrder.push({ type: "group", id: n.group.id, depth: n.depth });
        walk(n.children);
      } else readingOrder.push({ type: "chapter", id: n.chapter.id, depth: n.depth });
    }
  };
  walk(outline);
  const activeScenes = r.scenes.filter((s) => !trashed(s));
  const chapterScenes: Record<string, string[]> = {};
  for (const c of activeChapters) chapterScenes[String(c.id)] = [];
  for (const s of [...activeScenes].sort(byPosition)) {
    if (s.chapter_id != null && chapterScenes[String(s.chapter_id)]) chapterScenes[String(s.chapter_id)].push(String(s.id));
  }
  // A Chapter in Trash keeps its Scenes that went with it, in their order.
  const trashedChapterScenes: Record<string, string[]> = {};
  for (const c of r.chapters.filter(trashed)) trashedChapterScenes[String(c.id)] = [];
  for (const s of [...r.scenes].filter(trashed).sort(byPosition)) {
    const from = String(s.trashed_from_chapter_id ?? "");
    if (s.trashed_with_chapter && trashedChapterScenes[from]) trashedChapterScenes[from].push(String(s.id));
  }

  files.set(
    "project.json",
    json({ project: data.project, manuscript: data.manuscript })
  );
  files.set(
    "manuscript/structure.json",
    json({
      manuscript_id: data.manuscript.id,
      reading_order: readingOrder,
      chapter_scenes: chapterScenes,
      unplaced_scenes: activeScenes.filter((s) => s.chapter_id == null).sort(byPosition).map((s) => String(s.id)),
      groups: [...r.groups].sort(byPosition),
      chapters: r.chapters.map((c) => withTrash(c, chapterInTrash.has(String(c.id)))),
      trash: {
        chapters: Object.entries(trashedChapterScenes).map(([id, scenes]) => ({ id, scenes })),
        scenes: r.scenes.filter(trashed).map((s) => String(s.id)),
      },
    })
  );
  for (const s of r.scenes) files.set(`manuscript/scenes/${s.id}.json`, json(withTrash(s, sceneInTrash.has(String(s.id)))));
  files.set(
    "manuscript/manuscript.md",
    renderMarkdown(
      planExport(
        {
          projectTitle: data.project.title,
          groups: r.groups as unknown as ExportGroupRow[],
          chapters: activeChapters as unknown as ExportChapterRow[],
          scenes: activeScenes as unknown as ExportSceneRow[],
        },
        { kind: "manuscript", includeUnplaced: true }
      )
    )
  );
  files.set(
    "manuscript/scene-properties.json",
    json({ definitions: [...r.scene_property_definitions].sort(byPosition), values: r.scene_property_values })
  );
  files.set("manuscript/scene-views.json", json({ views: [...r.scene_views].sort(byPosition) }));

  files.set(
    "revision-notes.json",
    json({
      notes: r.revision_notes.map((n) =>
        withTrash(
          n,
          (n.target_type === "scene" && sceneInTrash.has(String(n.target_id))) ||
            (n.target_type === "chapter" && chapterInTrash.has(String(n.target_id)))
        )
      ),
    })
  );

  const history = new Map<string, Row[]>();
  for (const rev of r.scene_revisions) {
    const key = rev.scene_id == null ? "no-scene" : String(rev.scene_id);
    (history.get(key) ?? history.set(key, []).get(key)!).push(rev);
  }
  for (const [key, revisions] of history) {
    revisions.sort((a, b) => String(a.saved_at).localeCompare(String(b.saved_at)) || String(a.id).localeCompare(String(b.id)));
    files.set(`history/${key}.json`, json({ scene_id: key === "no-scene" ? null : key, revisions }));
  }

  for (const m of r.milestones) {
    const scenes = r.milestone_scenes.filter((ms) => ms.milestone_id === m.id);
    files.set(`milestones/${m.id}.json`, json({ milestone: m, scenes: scenes.sort(byPosition) }));
  }

  files.set(
    "workspace/tree.json",
    json({
      nodes: [...r.workspace_nodes].sort(byPosition),
      folders: r.workspace_folders.map((f) => withTrash(f, folderInTrash.has(String(f.id)))),
    })
  );
  for (const d of r.workspace_documents) {
    files.set(`workspace/pages/${d.id}.json`, json(withTrash(d, docInTrash.has(String(d.id)))));
    files.set(`workspace/pages/${d.id}.md`, readableMarkdown(String(d.title ?? "") || "Untitled", d.content));
  }
  for (const c of r.workspace_collections) {
    const entries = r.workspace_collection_entries.filter((e) => e.collection_id === c.id);
    const entryIds = new Set(entries.map((e) => e.id));
    files.set(
      `workspace/collections/${c.id}.json`,
      json({
        collection: withTrash(c, collectionInTrash.has(String(c.id))),
        properties: r.workspace_collection_properties.filter((p) => p.collection_id === c.id).sort(byPosition),
        views: r.workspace_collection_views.filter((v) => v.collection_id === c.id).sort(byPosition),
        entries: entries.map((e) => withTrash(e, entryInTrash.has(String(e.id)))),
        values: r.workspace_entry_values.filter((v) => entryIds.has(v.entry_id as string)),
      })
    );
  }

  const objectInTrash = (type: unknown, id: unknown) =>
    (type === "scene" && sceneInTrash.has(String(id))) ||
    (type === "chapter" && chapterInTrash.has(String(id))) ||
    (type === "page" && docInTrash.has(String(id))) ||
    (type === "entry" && entryInTrash.has(String(id)));
  files.set(
    "references.json",
    json({
      references: r.object_references.map((ref) =>
        withTrash(
          ref,
          objectInTrash(ref.source_type, ref.source_entry_id ?? ref.source_document_id ?? ref.source_scene_id) ||
            objectInTrash(ref.target_type, ref.target_entry_id ?? ref.target_document_id ?? ref.target_scene_id ?? ref.target_chapter_id)
        )
      ),
    })
  );
  files.set("writing/sessions.json", json({ sessions: r.writing_sessions }));
  files.set("writing/goals.json", json({ goals: r.writing_goals }));
  if (r.project_notes.length > 0) files.set("legacy/checklist.json", json({ items: r.project_notes }));

  const counts = Object.fromEntries((Object.keys(BACKUP_KINDS) as BackupKind[]).map((k) => [k, r[k].length]));
  const manifest = {
    format: BACKUP_FORMAT,
    format_version: BACKUP_FORMAT_VERSION,
    created_at: at.toISOString(),
    generator: "Rune",
    project: { id: data.project.id, title: data.project.title },
    manuscript_id: data.manuscript.id,
    counts,
    trash: {
      chapters: chapterInTrash.size,
      scenes: sceneInTrash.size,
      pages: docInTrash.size,
      folders: folderInTrash.size,
      collections: collectionInTrash.size,
      entries: entryInTrash.size,
    },
    files: ["README.txt", "manifest.json", ...files.keys()],
  };
  return new Map([
    ["README.txt", README_TEXT],
    ["manifest.json", json(manifest)],
    ...files,
  ]);
}

/** The backup as a ZIP archive's bytes. */
export async function buildBackupArchive(data: BackupData, at: Date = new Date()): Promise<Uint8Array> {
  const zip = new ZipWriter(at);
  for (const [path, text] of backupFiles(data, at)) await zip.add(path, text);
  return zip.finish();
}

/**
 * The whole backup, start to finish: read everything, write the archive, name
 * it. Throws (never returns quietly) if anything fails or the archive is empty.
 */
export async function makeProjectBackup(
  supabase: SupabaseLike,
  projectId: string,
  onProgress?: (kind: BackupKind, index: number, total: number) => void,
  at: Date = new Date()
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const data = await loadProjectBackup(supabase, projectId, onProgress);
  const bytes = await buildBackupArchive(data, at);
  if (bytes.length === 0) throw new Error("backup: empty archive");
  return { bytes, fileName: `${safeFileName(backupFileBase(data.project.title, at), "Rune backup")}.zip` };
}

/** "The Hollow – Rune backup 2026-09-29" */
export function backupFileBase(title: string, at: Date): string {
  const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return `${title.trim() || "Untitled"} – Rune backup ${day}`;
}
