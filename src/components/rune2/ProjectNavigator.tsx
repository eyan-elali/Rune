"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  ChevronDown,
  ChevronRight,
  File as PageIcon,
  FilePlus,
  FileDown,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Frame,
  Layers,
  Library,
  ListPlus,
  PanelTop,
  MoreHorizontal,
  Pencil,
  Pilcrow,
  Plus,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { ICON, ICON_SM_BOLD } from "./icons";
import { Tooltip } from "./Tooltip";
import { createChapter, removeChapterKeepScenes, updateChapter } from "@/lib/actions/chapters";
import { createScene, createUnplacedScene, moveSceneToUnplaced, placeScene, renameScene } from "@/lib/actions/scenes";
import { createGroup, deleteGroup, moveChapter, moveGroup, renameGroup } from "@/lib/actions/structure";
import { createWorkspacePage, renameWorkspacePage } from "@/lib/actions/workspacePages";
import { createWorkspaceCanvas, renameWorkspaceCanvas } from "@/lib/actions/workspaceCanvas";
import {
  createWorkspaceFolder,
  deleteWorkspaceFolder,
  moveWorkspaceNode,
  renameWorkspaceFolder,
} from "@/lib/actions/workspaceTree";
import {
  createCollectionEntry,
  createWorkspaceCollection,
  deleteWorkspaceCollection,
  renameWorkspaceCollection,
} from "@/lib/actions/workspaceCollections";
import {
  chapterDestinations,
  chapterShowsScenes,
  groupDestinations,
  groupSubtreeIds,
  indexBeside as indexAmong,
  manuscriptPlaces,
  sceneDestinations,
  type NavEntry,
} from "@/lib/rune2/navigatorModel";
import { canvasDragTypes } from "@/lib/rune2/canvas";
import { indexBeside, moveDestinations, walkWorkspaceTree, type WorkspaceTreeNode } from "@/lib/rune2/workspaceTree";
import type { ManuscriptOutlineNode } from "@/lib/rune2/projectManuscript";
import { NavigatorMenu, type NavigatorMenuItem } from "./NavigatorMenu";
import { useRevisionNotes } from "./RevisionNoteStore";
import { useRune2Selection } from "./Rune2Selection";
import { useDragAutoScroll } from "./useDragAutoScroll";
import { useTrash } from "./WorkspaceTrash";
import { AccountControl } from "./AccountMenu";
import { useProjectExport } from "./ProjectExport";
import { RenameProjectDialog } from "./ProjectDialogs";
import { trashProject } from "@/lib/actions/projects";

// The Rune 2.0 project navigator: the Manuscript (Groups → Chapters → Scenes)
// in reading order, then Unplaced Scenes, then the Workspace (its Pages,
// Folders and Collections, in the places the writer gave them). A
// Collection's Entries are not listed here — the Collection's own view lists
// them, so the navigator stays compact however many Entries there are. The Workspace stays a single
// quiet row until the writer has a Page, and a flat list of Pages until they
// make a Folder. Every change goes through the server actions — each one
// atomic in the database — and the tree then re-reads the project
// (router.refresh). Nothing here holds a second copy
// of the structure; only UI state (open rows and titles just renamed but not
// yet re-read — both shared through the selection context, since the writing
// surface, tabs and context bar use them too — and the row being renamed).
//
// A click opens the object in the active tab (or goes to the tab already
// showing it); ⌘/Ctrl-click, or "Open in new tab" in its menu, gives it a tab.
// A Folder is navigation only: a click opens or closes it, it never opens in
// a tab.
//
// Workspace items, Groups, Chapters and Scenes move by "Move up / down / to…"
// in their menu, ⌥↑ / ⌥↓ on a focused row, or by dragging: a Workspace item
// before or after a row or into a Folder; a Group or Chapter before or after a
// Chapter or Group, or into a Group (never a Group into itself or one of its
// own Groups); a Scene before or after a Scene, into a Chapter, or into
// Unplaced Scenes. Each move is one atomic database function
// (move_manuscript_group, move_chapter, place_scene) that keeps the object's
// id and everything it holds. Placing a Scene anywhere (place_scene) needs
// migration 037; before it, a placed Scene can only be moved to Unplaced
// Scenes. While anything is dragged, holding the pointer near the top or
// bottom of the tree scrolls it (useDragAutoScroll), so a far row is reachable
// in one drag.
//
// A Page, Folder, Collection, Scene or Chapter goes to the Project's Trash from
// its menu ("Move to Trash", with an Undo in the notice that follows); a
// Folder's items stay in the Workspace, where the Folder was; a Chapter's
// Scenes go with it. Trash itself is the quiet "Trash" at the foot of the
// navigator (WorkspaceTrash). Trash is never Unplaced Scenes: "Remove chapter,
// keep its scenes" is a separate, explicit action. Before migration 030 there
// is no Trash, and only an empty Folder or Collection can be deleted.
//
// Not here, deliberately: Trash for Groups — only an empty Group can be deleted.

const BASE_PAD = 6;
const INDENT = 16;
/* A Scene row has no icon: its label is set in a little further instead, so
   Scenes read as the Chapter's contents by indentation alone. */
const ICONLESS_INSET = 19;
const ROOT_MANUSCRIPT = "root:manuscript";
const ROOT_UNPLACED = "root:unplaced";
/** The Workspace section's row (its open state is keyed by this). */
export const ROOT_WORKSPACE = "root:workspace";

type MenuState = { key: number; label: string; at: { x: number; y: number }; items: NavigatorMenuItem[] };
type DropSide = "before" | "after" | "inside";
/** A manuscript row being dragged: a Group, a Chapter or a Scene (placed or Unplaced). */
type ManuscriptDrag = { kind: "group" | "chapter" | "scene"; id: string };
/** A manuscript row a drag can land on. */
type ManuscriptTarget = { kind: "group" | "chapter" | "scene" | "unplaced"; id: string };

const formatCount = (n: number) => n.toLocaleString();

export function ProjectNavigator() {
  const {
    manuscript,
    workspace,
    index,
    selected: selection,
    select,
    openInNewTab,
    selectWhenPresent,
    open,
    setOpenFor,
    setRenamedTitle,
    requestSceneFocus,
    navCollapsed,
    setSearchOpen,
    trashOpen,
    setTrashOpen,
    setSettingsOpen,
  } = useRune2Selection();
  const projectId = manuscript.project.id;
  // While Trash fills the content column, no row is the one showing: the
  // footer's "Trash" is. (The selection itself is kept for when Trash closes.)
  const selected = trashOpen ? undefined : selection;
  const trash = useTrash();
  const exporter = useProjectExport();
  const { notes: revisionNotes } = useRevisionNotes();
  const groupNotes = (id: string) => revisionNotes.filter((n) => n.target_type === "group" && n.target_id === id).length;
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renamingProject, setRenamingProject] = useState(false);
  const [dragging, setDragging] = useState<WorkspaceTreeNode | null>(null);
  const [mdrag, setMdrag] = useState<ManuscriptDrag | null>(null);
  const [drop, setDrop] = useState<{ id: string; side: DropSide } | null>(null);
  // Scenes can be put anywhere (place_scene) from migration 037.
  const placeable = trash.chaptersAvailable;
  // A row to focus once the tree is re-read (after a keyboard reorder).
  const refocus = useRef<string | null>(null);
  // The tree's scrolling list: it scrolls under a drag held near its edges.
  const scrollRef = useRef<HTMLDivElement>(null);
  useDragAutoScroll(scrollRef, dragging !== null || mdrag !== null);

  // Every Workspace item's place: its parent, its siblings and where it is among them.
  const placed = useMemo(
    () => new Map(walkWorkspaceTree(workspace.tree).map((at) => [at.node.id, at])),
    [workspace.tree]
  );
  // And every Group's, Chapter's and Scene's, in the manuscript.
  const places = useMemo(() => manuscriptPlaces(manuscript), [manuscript]);

  useEffect(() => {
    if (refocus.current && !refreshing) {
      focusRow(refocus.current);
      refocus.current = null;
    }
  }, [workspace, manuscript, refreshing]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const isOpen = (id: string, fallback: boolean) => open[id] ?? fallback;
  /** A row click: ⌘/Ctrl-click opens the object in a tab of its own. */
  const choose = (id: string | null, e: React.MouseEvent) =>
    e.metaKey || e.ctrlKey ? openInNewTab(id) : select(id);

  /** Runs one change, then re-reads the manuscript. A returned string is shown to the writer. */
  async function run(change: () => Promise<string | null>) {
    if (busy) return;
    setBusy(true);
    try {
      const message = await change();
      if (message) setNotice(message);
    } catch {
      setNotice("Something went wrong. Nothing was lost — try again.");
    } finally {
      setBusy(false);
      startRefresh(() => router.refresh());
    }
  }

  // A just-created object is selected once the re-read manuscript contains it,
  // so its tab never points at something not there yet.
  function selectAndReveal(id: string, ancestors: string[], rename: boolean) {
    setOpenFor(ancestors, true);
    selectWhenPresent(id);
    if (rename) setRenamingId(id);
  }

  // ── Creation ────────────────────────────────────────────────────────────

  const addGroup = (parentGroupId: string | null) =>
    run(async () => {
      const r = await createGroup(projectId, null, parentGroupId);
      if (r.error !== null) return "Couldn’t create the group.";
      selectAndReveal(r.data.id, [ROOT_MANUSCRIPT, ...(parentGroupId ? [parentGroupId] : [])], true);
      return null;
    });

  // Phase 1 creates a Chapter at the end of the Manuscript; one inside a Group
  // is then moved there (a second atomic step that keeps the Chapter's id).
  const addChapter = (groupId: string | null) =>
    run(async () => {
      const r = await createChapter(projectId, `Chapter ${manuscript.chapterCount + 1}`);
      if (r.error !== null) return "Couldn’t create the chapter.";
      let message: string | null = null;
      if (groupId) {
        const moved = await moveChapter(r.data.id, groupId, null, projectId);
        if (moved.error) message = "The chapter was added at the end of the manuscript instead.";
      }
      selectAndReveal(r.data.id, [ROOT_MANUSCRIPT, ...(groupId && !message ? [groupId] : [])], true);
      return message;
    });

  const addScene = (chapterId: string) =>
    run(async () => {
      const chapter = index.get(chapterId);
      const count = (chapter?.childCount ?? 0) + 1;
      // Unnamed: it shows as "Scene N" from where it stands, never stored.
      const r = await createScene(chapterId, null);
      if (r.error !== null) {
        return "Couldn’t create the scene.";
      }
      // A Chapter's only Scene stays out of sight; the Chapter is what's selected.
      if (chapterShowsScenes({ scenes: Array.from({ length: count }) })) {
        selectAndReveal(r.data.id, [chapterId], false);
      } else {
        select(chapterId);
      }
      return null;
    });

  const addUnplacedScene = () =>
    run(async () => {
      const r = await createUnplacedScene(projectId, null);
      if (r.error !== null) {
        return "Couldn’t create the scene.";
      }
      selectAndReveal(r.data.id, [ROOT_UNPLACED], false);
      return null;
    });

  /** The Workspace section and every Folder down to (and including) `folder`. */
  const workspaceOpenPath = (folder: WorkspaceTreeNode | null) => [
    ROOT_WORKSPACE,
    ...(folder ? [...(index.get(folder.id)?.path.map((p) => p.id) ?? []), folder.id] : []),
  ];

  // A new Page opens at once, with its title ready to type (see PageTitle).
  // Inside a Folder, it is added at the end of that Folder.
  const addPage = (folder: WorkspaceTreeNode | null = null) =>
    run(async () => {
      const r = await createWorkspacePage(projectId, null, folder?.nodeId ?? null);
      if (r.error !== null) return "Couldn’t create the page.";
      setOpenFor(workspaceOpenPath(folder), true);
      selectWhenPresent(r.data.id);
      requestSceneFocus(r.data.id);
      return null;
    });

  // A new Collection opens at once, with its title ready to type (its view).
  const addCollection = (folder: WorkspaceTreeNode | null = null) =>
    run(async () => {
      const r = await createWorkspaceCollection(projectId, null, folder?.nodeId ?? null);
      if (r.error !== null) return "Couldn’t create the collection.";
      setOpenFor(workspaceOpenPath(folder), true);
      selectWhenPresent(r.data.collection.id);
      requestSceneFocus(r.data.collection.id);
      return null;
    });

  // A new Canvas opens at once, with its title ready to type (over the surface).
  const addCanvas = (folder: WorkspaceTreeNode | null = null) =>
    run(async () => {
      const r = await createWorkspaceCanvas(projectId, null, folder?.nodeId ?? null);
      if (r.error !== null) return "Couldn’t create the canvas.";
      setOpenFor(workspaceOpenPath(folder), true);
      selectWhenPresent(r.data.canvas.id);
      requestSceneFocus(r.data.canvas.id);
      return null;
    });

  // A new Entry opens at once, title first, as a new Page does.
  const addEntry = (collectionId: string) =>
    run(async () => {
      const r = await createCollectionEntry(collectionId, null);
      if (r.error !== null) return "Couldn’t create the entry.";
      selectWhenPresent(r.data.id);
      requestSceneFocus(r.data.id);
      return null;
    });

  // A new Folder waits for its name in the tree; it is never selected.
  const addFolder = (folder: WorkspaceTreeNode | null = null) =>
    run(async () => {
      const r = await createWorkspaceFolder(projectId, null, folder?.nodeId ?? null);
      if (r.error !== null) return "Couldn’t create the folder.";
      setOpenFor(workspaceOpenPath(folder), true);
      setRenamingId(r.data.folder.id);
      return null;
    });

  // ── Rename ──────────────────────────────────────────────────────────────

  function commitRename(entry: NavEntry, value: string | null) {
    setRenamingId(null);
    focusRow(entry.id);
    if (value === null) return;
    const next = value.trim();
    // Compared with the stored title: typing "Scene 2" over an unnamed Scene's
    // fallback names it for real.
    // Groups and Workspace items may be untitled; a Chapter or Scene keeps its name.
    const blankAllowed =
      entry.kind === "group" ||
      entry.kind === "workspacePage" ||
      entry.kind === "workspaceFolder" ||
      entry.kind === "workspaceCollection" ||
      entry.kind === "workspaceCanvas";
    if (next === (entry.named ? entry.title : "") || (!blankAllowed && next === "")) return;

    setRenamedTitle(entry.id, next);
    run(async () => {
      if (entry.kind === "group") {
        const r = await renameGroup(entry.id, next || null, projectId);
        return r.error ? "Couldn’t rename the group." : null;
      }
      if (entry.kind === "workspacePage") {
        const r = await renameWorkspacePage(entry.id, next || null);
        return r.error ? "Couldn’t rename the page." : null;
      }
      if (entry.kind === "workspaceFolder") {
        const r = await renameWorkspaceFolder(entry.id, next || null);
        return r.error ? "Couldn’t rename the folder." : null;
      }
      if (entry.kind === "workspaceCollection") {
        const r = await renameWorkspaceCollection(entry.id, next || null);
        return r.error ? "Couldn’t rename the collection." : null;
      }
      if (entry.kind === "workspaceCanvas") {
        const r = await renameWorkspaceCanvas(entry.id, next || null);
        return r.error ? "Couldn’t rename the canvas." : null;
      }
      if (entry.kind === "chapter") {
        const r = await updateChapter(entry.id, { title: next }, projectId);
        return r.error ? "Couldn’t rename the chapter." : null;
      }
      const r = await renameScene(entry.id, next);
      return r.error ? "Couldn’t rename the scene." : null;
    });
  }

  // ── Menus ───────────────────────────────────────────────────────────────

  const openMenu = (label: string, at: { x: number; y: number }, items: NavigatorMenuItem[]) =>
    setMenu((prev) => ({ key: (prev?.key ?? 0) + 1, label, at, items }));

  // The Project's own actions, from its title: what the Project is called,
  // reading it out whole, putting it away. This book only — Rune's own
  // places (All projects, Settings, Log out) are the account control's, at
  // the foot of the navigator.
  function projectItems(): NavigatorMenuItem[] {
    return [
      { label: "Rename project", icon: Pencil, onSelect: () => setRenamingProject(true) },
      ...(exporter
        ? [
            { label: "Export manuscript…", icon: FileDown, onSelect: () => exporter.openExport({ kind: "manuscript" }) },
            { label: "Download project backup…", icon: Archive, onSelect: () => exporter.openBackup() },
          ]
        : []),
      { label: "Move project to Trash", icon: Trash2, separator: true, onSelect: () => void moveProjectToTrash() },
    ];
  }

  async function moveProjectToTrash() {
    setBusy(true);
    setNotice(null);
    try {
      const r = await trashProject(projectId);
      if (r.error !== null) {
        setNotice("Couldn’t move the project to Trash.");
        setBusy(false);
        return;
      }
      // Recoverable: Projects offers Undo.
      router.push(`/projects?trashed=${projectId}`);
    } catch {
      setNotice("You appear to be offline. Nothing was changed.");
      setBusy(false);
    }
  }

  function manuscriptAddItems(): NavigatorMenuItem[] {
    return [
      { label: "New chapter", icon: FileText, onSelect: () => addChapter(null) },
      { label: "New group", icon: Layers, onSelect: () => addGroup(null) },
      { label: "New unplaced scene", icon: Pilcrow, onSelect: addUnplacedScene },
    ];
  }

  function groupAddItems(id: string): NavigatorMenuItem[] {
    return [
      { label: "New chapter", icon: FileText, onSelect: () => addChapter(id) },
      { label: "New group inside", icon: Layers, onSelect: () => addGroup(id) },
    ];
  }

  /** "+" on the Workspace, or on a Folder: a Page, Folder or Collection there. */
  function workspaceAddItems(folder: WorkspaceTreeNode | null): NavigatorMenuItem[] {
    return [
      { label: "New page", icon: FilePlus, onSelect: () => addPage(folder) },
      ...(workspace.organizable
        ? [{ label: "New folder", icon: FolderPlus, onSelect: () => addFolder(folder) }]
        : []),
      ...(workspace.organizable && workspace.collectable
        ? [{ label: "New collection", icon: Library, onSelect: () => addCollection(folder) }]
        : []),
      ...(workspace.organizable && workspace.canvasable
        ? [{ label: "New canvas", icon: Frame, onSelect: () => addCanvas(folder) }]
        : []),
    ];
  }

  function moreItems(entry: NavEntry, at?: { x: number; y: number }): NavigatorMenuItem[] {
    // A Folder never opens in a tab.
    if (entry.kind === "workspaceFolder") return kindItems(entry, at);
    return [{ label: "Open in new tab", icon: PanelTop, onSelect: () => openInNewTab(entry.id) }, ...kindItems(entry, at)];
  }

  /** Move up / down / to… for a Workspace item — only the moves that would change something. */
  function workspaceMoveItems(entry: NavEntry, point?: { x: number; y: number }): NavigatorMenuItem[] {
    const at = placed.get(entry.id);
    if (!at?.node.nodeId || !workspace.organizable) return [];
    const parentNodeId = at.parent?.nodeId ?? null;
    const elsewhere = moveDestinations(workspace.tree, at.node).filter((d) => d.parentNodeId !== parentNodeId);
    return [
      ...(at.index > 0
        ? [{ label: "Move up", icon: ArrowUp, hint: "⌥↑", onSelect: () => reorder(entry.id, -1) }]
        : []),
      ...(at.index < at.siblings.length - 1
        ? [{ label: "Move down", icon: ArrowDown, hint: "⌥↓", onSelect: () => reorder(entry.id, 1) }]
        : []),
      ...(elsewhere.length > 0
        ? [
            {
              label: "Move to",
              icon: FolderInput,
              onSelect: () =>
                openMenu(
                  `Move ${entry.title} to`,
                  point ?? rowPoint(entry.id),
                  elsewhere.map((d) => ({
                    key: d.parentNodeId ?? ROOT_WORKSPACE,
                    label: d.folder ? (index.get(d.folder.id)?.title ?? "Folder") : "Workspace",
                    icon: d.folder ? Folder : undefined,
                    inset: d.depth,
                    onSelect: () => moveTo(at.node, d.parentNodeId, null, d.folder),
                  }))
                ),
            },
          ]
        : []),
    ];
  }

  function kindItems(entry: NavEntry, at?: { x: number; y: number }): NavigatorMenuItem[] {
    const rename: NavigatorMenuItem = { label: "Rename", icon: Pencil, onSelect: () => setRenamingId(entry.id) };
    switch (entry.kind) {
      case "group":
        return [
          rename,
          ...groupAddItems(entry.id),
          ...groupMoveItems(entry, at),
          // Phase 1 deletes only an empty Group; there is no Trash yet.
          ...(entry.childCount === 0
            ? [
                {
                  label: "Delete group",
                  icon: Trash2,
                  tone: "danger" as const,
                  // An empty Group's own Revision Notes go with it: asked first.
                  ...(groupNotes(entry.id) > 0
                    ? {
                        confirm: {
                          message: `Delete this empty group?${notesWarning(groupNotes(entry.id), "group")}`,
                          action: "Delete group",
                        },
                      }
                    : {}),
                  onSelect: () => removeGroup(entry.id),
                },
              ]
            : []),
        ];
      case "chapter":
        return [
          rename,
          { label: "New scene", icon: Pilcrow, onSelect: () => addScene(entry.id) },
          ...chapterMoveItems(entry, at),
          ...(exporter
            ? [{ label: "Export chapter…", icon: FileDown, onSelect: () => exporter.openExport({ kind: "chapter", chapterId: entry.id }) }]
            : []),
          ...trashItems(entry),
          // Not deletion, and not Trash: the Chapter goes, its Scenes stay as
          // Unplaced Scenes. (Before 037, the only way to remove a Chapter.)
          ...(entry.childCount > 0 || !trash.chaptersAvailable
            ? [
                {
                  label: entry.childCount > 0 ? "Remove chapter, keep its scenes" : "Remove chapter",
                  icon: FolderInput,
                  confirm: {
                    message:
                      (entry.childCount === 0
                        ? "Remove this empty chapter?"
                        : `Remove this chapter? ${
                            entry.childCount === 1 ? "Its scene moves" : `Its ${entry.childCount} scenes move`
                          } to Unplaced Scenes, and the chapter itself is removed.`) +
                      notesWarning(
                        revisionNotes.filter((n) => n.target_type === "chapter" && n.target_id === entry.id).length,
                        "chapter",
                      ),
                    action: "Remove chapter",
                  },
                  onSelect: () => removeChapter(entry.id, entry.childCount),
                },
              ]
            : []),
        ];
      case "scene":
      case "unplacedScene":
        return [
          rename,
          ...sceneMoveItems(entry, at),
          ...(exporter
            ? [{ label: "Export scene…", icon: FileDown, onSelect: () => exporter.openExport({ kind: "scene", sceneId: entry.id }) }]
            : []),
          ...trashItems(entry),
        ];
      case "workspacePage":
      case "workspaceCanvas":
        return [rename, ...workspaceMoveItems(entry, at), ...trashItems(entry)];
      case "workspaceCollection":
        return [
          rename,
          { label: "New entry", icon: ListPlus, onSelect: () => addEntry(entry.id) },
          ...workspaceMoveItems(entry, at),
          ...trashItems(entry),
          // Without Trash (before 030), only an empty Collection: no Entry is
          // ever lost.
          ...(!trash.available && entry.childCount === 0
            ? [
                {
                  label: "Delete collection",
                  icon: Trash2,
                  tone: "danger" as const,
                  onSelect: () => removeCollection(entry.id),
                },
              ]
            : []),
        ];
      // Not listed in the navigator (its Collection lists it).
      case "collectionEntry":
        return [rename];
      case "workspaceFolder": {
        const folder = placed.get(entry.id)?.node ?? null;
        return [
          rename,
          { label: "New page inside", icon: FilePlus, onSelect: () => addPage(folder) },
          { label: "New folder inside", icon: FolderPlus, onSelect: () => addFolder(folder) },
          ...(workspace.collectable
            ? [{ label: "New collection inside", icon: Library, onSelect: () => addCollection(folder) }]
            : []),
          ...(workspace.canvasable
            ? [{ label: "New canvas inside", icon: Frame, onSelect: () => addCanvas(folder) }]
            : []),
          ...workspaceMoveItems(entry, at),
          ...trashItems(entry),
          // Without Trash (before 030), only an empty Folder.
          ...(!trash.available && entry.childCount === 0
            ? [{ label: "Delete folder", icon: Trash2, tone: "danger" as const, onSelect: () => removeFolder(entry.id) }]
            : []),
        ];
      }
    }
  }

  /**
   * "Move to Trash" for a Page, Folder, Collection, Scene or Chapter (with its
   * Scenes). Recoverable, so no confirmation — except for a Folder that holds
   * items, which move up into its place (they are not trashed with it).
   */
  function trashItems(entry: NavEntry): NavigatorMenuItem[] {
    const isScene = entry.kind === "scene" || entry.kind === "unplacedScene";
    if (
      !trash.available ||
      (isScene && !trash.scenesAvailable) ||
      (entry.kind === "chapter" && !trash.chaptersAvailable)
    ) {
      return [];
    }
    const folderItems = entry.kind === "workspaceFolder" ? entry.childCount : 0;
    return [
      {
        label: "Move to Trash",
        icon: Trash2,
        tone: "danger",
        confirm:
          folderItems > 0
            ? {
                message: `Move this folder to Trash? ${
                  folderItems === 1 ? "Its item stays" : `Its ${folderItems} items stay`
                } in the Workspace, where the folder was.`,
                action: "Move to Trash",
              }
            : undefined,
        onSelect: () => run(() => trash.moveToTrash(entry)),
      },
    ];
  }

  // ── Workspace moves ─────────────────────────────────────────────────────

  /** Puts a Workspace item at `idx` among `parentNodeId`'s children (null = last). */
  const moveTo = (
    node: WorkspaceTreeNode,
    parentNodeId: string | null,
    idx: number | null,
    folder: WorkspaceTreeNode | null
  ) =>
    run(async () => {
      if (!node.nodeId) return null;
      const r = await moveWorkspaceNode(node.nodeId, parentNodeId, idx);
      if (r.error !== null) {
        return r.error === "A Folder cannot move inside itself"
          ? "A folder can’t go inside itself."
          : "Couldn’t move that. Nothing was changed.";
      }
      // Show where it went.
      setOpenFor(workspaceOpenPath(folder), true);
      return null;
    });

  /** One step up or down among its siblings. */
  function reorder(id: string, step: -1 | 1, fromKeyboard = false) {
    const at = placed.get(id);
    if (!at?.node.nodeId || !workspace.organizable) return;
    const next = at.index + step;
    if (next < 0 || next >= at.siblings.length) return;
    if (fromKeyboard) refocus.current = id;
    moveTo(at.node, at.parent?.nodeId ?? null, next, at.parent);
  }

  const removeFolder = (id: string) =>
    run(async () => {
      const r = await deleteWorkspaceFolder(id);
      return r.error ? "Couldn’t delete the folder." : null;
    });

  const removeCollection = (id: string) =>
    run(async () => {
      const r = await deleteWorkspaceCollection(id);
      if (r.error === "Only an empty collection can be deleted") return "Only an empty collection can be deleted.";
      return r.error ? "Couldn’t delete the collection." : null;
    });

  // ── Workspace drag and drop ─────────────────────────────────────────────

  /** Whether `node` may be dropped at `side` of `target`. */
  function canDrop(node: WorkspaceTreeNode, target: WorkspaceTreeNode | null, side: DropSide): boolean {
    if (!target) return side === "inside";
    if (!target.nodeId || target.nodeId === node.nodeId) return false;
    if (side === "inside" && target.kind !== "folder") return false;
    // Never into itself: nothing inside a moving Folder is a destination.
    return !(index.get(target.id)?.path.some((p) => p.id === node.id) ?? false);
  }

  /** The row props that make a Workspace item draggable and a drop target (null target: the Workspace row). */
  function dragProps(target: WorkspaceTreeNode | null, rowId: string): HTMLAttributes<HTMLDivElement> & { draggable?: boolean } {
    if (!workspace.organizable) return {};
    const sideAt = (e: React.DragEvent<HTMLDivElement>): DropSide => {
      if (!target) return "inside";
      const r = e.currentTarget.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      if (target.kind === "folder") return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
      return y < 0.5 ? "before" : "after";
    };
    return {
      draggable: Boolean(target?.nodeId) && renamingId !== target?.id && !busy,
      onDragStart: (e) => {
        if (!target?.nodeId) return;
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", index.get(target.id)?.title ?? "");
        // A Canvas (CanvasSurface) accepts the row as a placement — when it is one it can show (lib/rune2/canvas.ts decides).
        for (const type of canvasDragTypes({ kind: index.get(target.id)?.kind ?? "workspaceFolder" })) e.dataTransfer.setData(type, JSON.stringify({ id: target.id }));
        setDragging(target);
      },
      onDragOver: (e) => {
        if (!dragging) return;
        const side = sideAt(e);
        if (!canDrop(dragging, target, side)) {
          if (drop?.id === rowId) setDrop(null);
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (drop?.id !== rowId || drop.side !== side) setDrop({ id: rowId, side });
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && drop?.id === rowId) setDrop(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const node = dragging;
        const side = sideAt(e);
        setDragging(null);
        setDrop(null);
        if (!node || !canDrop(node, target, side)) return;
        if (!target) {
          moveTo(node, null, null, null);
        } else if (side === "inside") {
          moveTo(node, target.nodeId, null, target);
        } else {
          const at = placed.get(target.id);
          if (!at) return;
          moveTo(node, at.parent?.nodeId ?? null, indexBeside(at.siblings, node, target, side), at.parent);
        }
      },
      onDragEnd: () => {
        setDragging(null);
        setDrop(null);
      },
    };
  }

  const removeGroup = (id: string) =>
    run(async () => {
      const r = await deleteGroup(id, projectId);
      return r.error ? "Couldn’t delete the group." : null;
    });

  const removeChapter = (id: string, sceneCount: number) =>
    run(async () => {
      const r = await removeChapterKeepScenes(id, projectId);
      if (r.error) return "Couldn’t remove the chapter.";
      if (sceneCount === 0) return null;
      setOpenFor([ROOT_UNPLACED], true);
      return sceneCount === 1
        ? "The chapter is gone; its scene is in Unplaced Scenes."
        : "The chapter is gone; its scenes are in Unplaced Scenes.";
    });

  // ── Manuscript moves ────────────────────────────────────────────────────

  /** The title of a move destination, as the navigator shows it. */
  const titleOf = (id: string | null, fallback: string) => (id ? (index.get(id)?.title ?? fallback) : fallback);

  /** Puts a Chapter at `idx` among `parentGroupId`'s children (null: the top level; idx null: last). */
  const moveChapterTo = (id: string, parentGroupId: string | null, idx: number | null) =>
    run(async () => {
      const r = await moveChapter(id, parentGroupId, idx, projectId);
      if (r.error !== null) return "Couldn’t move the chapter. Nothing was changed.";
      setOpenFor([ROOT_MANUSCRIPT, ...(parentGroupId ? [...(index.get(parentGroupId)?.path.map((p) => p.id) ?? []), parentGroupId] : [])], true);
      return null;
    });

  /** Puts a Group — with everything in it — at `idx` among `parentGroupId`'s children (null: the top level; idx null: last). */
  const moveGroupTo = (id: string, parentGroupId: string | null, idx: number | null) =>
    run(async () => {
      const r = await moveGroup(id, parentGroupId, idx, projectId);
      if (r.error !== null) {
        return r.error === "A Group cannot move inside itself"
          ? "A group can’t go inside itself."
          : "Couldn’t move the group. Nothing was changed.";
      }
      setOpenFor([ROOT_MANUSCRIPT, ...(parentGroupId ? [...(index.get(parentGroupId)?.path.map((p) => p.id) ?? []), parentGroupId] : [])], true);
      return null;
    });

  /** Puts a Scene at `idx` among a Chapter's Scenes (null: Unplaced Scenes; idx null: last). */
  const moveSceneTo = (id: string, chapterId: string | null, idx: number | null) =>
    run(async () => {
      const r = placeable
        ? await placeScene(id, chapterId, idx)
        : chapterId === null
          ? await moveSceneToUnplaced(id)
          : { error: "Scenes can’t be placed yet" };
      if (r.error !== null) return "Couldn’t move the scene. Nothing was changed.";
      setOpenFor(chapterId ? [ROOT_MANUSCRIPT, ...(index.get(chapterId)?.path.map((p) => p.id) ?? []), chapterId] : [ROOT_UNPLACED], true);
      return null;
    });

  /** One step up or down among its siblings, for a Group, Chapter or Scene (⌥↑ / ⌥↓, or its menu). */
  function reorderManuscript(entry: NavEntry, step: -1 | 1, fromKeyboard = false) {
    const at = places.get(entry.id);
    if (!at) return;
    const next = at.index + step;
    if (next < 0 || next >= at.siblings.length) return;
    if (entry.kind === "group") {
      if (fromKeyboard) refocus.current = entry.id;
      moveGroupTo(entry.id, at.parentId, next);
    } else if (entry.kind === "chapter") {
      if (fromKeyboard) refocus.current = entry.id;
      moveChapterTo(entry.id, at.parentId, next);
    } else if ((entry.kind === "scene" || entry.kind === "unplacedScene") && placeable) {
      if (fromKeyboard) refocus.current = entry.id;
      moveSceneTo(entry.id, at.parentId, next);
    }
  }

  /** Move up / down / to… for a Chapter: among its siblings, to the top level or into any Group. */
  function chapterMoveItems(entry: NavEntry, point?: { x: number; y: number }): NavigatorMenuItem[] {
    const at = places.get(entry.id);
    if (!at) return [];
    const elsewhere = chapterDestinations(manuscript.outline, at.parentId);
    return [
      ...(at.index > 0
        ? [{ label: "Move up", icon: ArrowUp, hint: "⌥↑", onSelect: () => reorderManuscript(entry, -1) }]
        : []),
      ...(at.index < at.siblings.length - 1
        ? [{ label: "Move down", icon: ArrowDown, hint: "⌥↓", onSelect: () => reorderManuscript(entry, 1) }]
        : []),
      ...(elsewhere.length > 0
        ? [
            {
              label: "Move to",
              icon: FolderInput,
              onSelect: () =>
                openMenu(
                  `Move ${entry.title} to`,
                  point ?? rowPoint(entry.id),
                  elsewhere.map((d) => ({
                    key: d.groupId ?? ROOT_MANUSCRIPT,
                    label: titleOf(d.groupId, "Manuscript (top level)"),
                    icon: d.groupId ? Layers : undefined,
                    inset: d.depth,
                    onSelect: () => moveChapterTo(entry.id, d.groupId, null),
                  }))
                ),
            },
          ]
        : []),
    ];
  }

  /**
   * Move up / down / to… for a Group: among its siblings (Groups and Chapters
   * together), to the top level, or into another Group — never into itself or
   * a Group inside it.
   */
  function groupMoveItems(entry: NavEntry, point?: { x: number; y: number }): NavigatorMenuItem[] {
    const at = places.get(entry.id);
    if (!at) return [];
    const elsewhere = groupDestinations(manuscript.outline, entry.id, at.parentId);
    return [
      ...(at.index > 0
        ? [{ label: "Move up", icon: ArrowUp, hint: "⌥↑", onSelect: () => reorderManuscript(entry, -1) }]
        : []),
      ...(at.index < at.siblings.length - 1
        ? [{ label: "Move down", icon: ArrowDown, hint: "⌥↓", onSelect: () => reorderManuscript(entry, 1) }]
        : []),
      ...(elsewhere.length > 0
        ? [
            {
              label: "Move to",
              icon: FolderInput,
              onSelect: () =>
                openMenu(
                  `Move ${entry.title} to`,
                  point ?? rowPoint(entry.id),
                  elsewhere.map((d) => ({
                    key: d.groupId ?? ROOT_MANUSCRIPT,
                    label: titleOf(d.groupId, "Manuscript (top level)"),
                    icon: d.groupId ? Layers : undefined,
                    inset: d.depth,
                    onSelect: () => moveGroupTo(entry.id, d.groupId, null),
                  }))
                ),
            },
          ]
        : []),
    ];
  }

  /**
   * Move up / down / to… for a Scene: within its Chapter or the Unplaced
   * Scenes, to another Chapter, or out to Unplaced Scenes (never Trash).
   * Before 037, only a placed Scene's "Move to Unplaced Scenes".
   */
  function sceneMoveItems(entry: NavEntry, point?: { x: number; y: number }): NavigatorMenuItem[] {
    const at = places.get(entry.id);
    if (!at) return [];
    const placedScene = entry.kind === "scene";
    const toUnplaced: NavigatorMenuItem = {
      label: "Move to Unplaced Scenes",
      icon: FolderInput,
      onSelect: () => moveSceneTo(entry.id, null, null),
    };
    if (!placeable) return placedScene ? [toUnplaced] : [];
    const chapters = sceneDestinations(manuscript.outline, at.parentId).filter((d) => d.chapterId !== null);
    return [
      ...(at.index > 0
        ? [{ label: "Move up", icon: ArrowUp, hint: "⌥↑", onSelect: () => reorderManuscript(entry, -1) }]
        : []),
      ...(at.index < at.siblings.length - 1
        ? [{ label: "Move down", icon: ArrowDown, hint: "⌥↓", onSelect: () => reorderManuscript(entry, 1) }]
        : []),
      ...(chapters.length > 0
        ? [
            {
              label: placedScene ? "Move to another chapter" : "Move to a chapter",
              icon: FileText,
              onSelect: () =>
                openMenu(
                  `Move ${entry.title} to`,
                  point ?? rowPoint(entry.id),
                  chapters.map((d) => ({
                    key: d.chapterId!,
                    label: titleOf(d.chapterId, "Chapter"),
                    inset: d.depth,
                    onSelect: () => moveSceneTo(entry.id, d.chapterId, null),
                  }))
                ),
            },
          ]
        : []),
      ...(placedScene ? [toUnplaced] : []),
    ];
  }

  // ── Manuscript drag and drop ────────────────────────────────────────────

  /** Whether the dragged Group, Chapter or Scene may be dropped at `side` of `target`. */
  function canDropManuscript(drag: ManuscriptDrag, target: ManuscriptTarget, side: DropSide): boolean {
    if (target.id === drag.id) return false;
    if (drag.kind === "group") {
      if (target.kind !== "group" && target.kind !== "chapter") return false;
      if (target.kind === "chapter" && side === "inside") return false;
      // Never into itself or anything inside it: not beside its own rows, not into them.
      const inside = groupSubtreeIds(manuscript.outline, drag.id);
      const parent = places.get(target.id)?.parentId ?? null;
      if (side === "inside") return !inside.has(target.id);
      return !(parent !== null && inside.has(parent));
    }
    if (drag.kind === "chapter") {
      if (target.kind === "group") return true;
      return target.kind === "chapter" && side !== "inside";
    }
    if (target.kind === "scene") return side !== "inside";
    return (target.kind === "chapter" || target.kind === "unplaced") && side === "inside";
  }

  /** The row props that make a Group, Chapter or Scene draggable, and any manuscript row a drop target. */
  function manuscriptDragProps(target: ManuscriptTarget): HTMLAttributes<HTMLDivElement> & { draggable?: boolean } {
    const movable = target.kind === "group" || target.kind === "chapter" || (target.kind === "scene" && placeable);
    const sideAt = (e: React.DragEvent<HTMLDivElement>): DropSide => {
      if (!mdrag || target.kind === "unplaced") return "inside";
      if (mdrag.kind === "scene" && target.kind === "chapter") return "inside";
      const r = e.currentTarget.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      if (target.kind === "group") return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
      return y < 0.5 ? "before" : "after";
    };
    return {
      draggable: movable && renamingId !== target.id && !busy,
      onDragStart: (e) => {
        if (!movable) return;
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", index.get(target.id)?.title ?? "");
        // A Canvas (CanvasSurface) accepts a Chapter or Scene as a placement, never a Group (lib/rune2/canvas.ts decides).
        for (const type of canvasDragTypes({ kind: index.get(target.id)?.kind ?? "group" })) e.dataTransfer.setData(type, JSON.stringify({ id: target.id }));
        setMdrag({ kind: target.kind === "group" || target.kind === "chapter" ? target.kind : "scene", id: target.id });
      },
      onDragOver: (e) => {
        if (!mdrag) return;
        const side = sideAt(e);
        if (!canDropManuscript(mdrag, target, side)) {
          if (drop?.id === target.id) setDrop(null);
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (drop?.id !== target.id || drop.side !== side) setDrop({ id: target.id, side });
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && drop?.id === target.id) setDrop(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const drag = mdrag;
        const side = sideAt(e);
        setMdrag(null);
        setDrop(null);
        if (!drag || !canDropManuscript(drag, target, side)) return;
        if (drag.kind === "group") {
          if (side === "inside") return moveGroupTo(drag.id, target.id, null);
          const at = places.get(target.id);
          if (at) moveGroupTo(drag.id, at.parentId, indexAmong(at.siblings, drag.id, target.id, side));
          return;
        }
        if (drag.kind === "chapter") {
          if (side === "inside") return moveChapterTo(drag.id, target.id, null);
          const at = places.get(target.id);
          if (at) moveChapterTo(drag.id, at.parentId, indexAmong(at.siblings, drag.id, target.id, side));
          return;
        }
        if (target.kind === "unplaced") return moveSceneTo(drag.id, null, null);
        if (target.kind === "chapter") return moveSceneTo(drag.id, target.id, null);
        const at = places.get(target.id);
        if (at && side !== "inside") moveSceneTo(drag.id, at.parentId, indexAmong(at.siblings, drag.id, target.id, side));
      },
      onDragEnd: () => {
        setMdrag(null);
        setDrop(null);
      },
    };
  }

  // ── Tree ────────────────────────────────────────────────────────────────

  function renderOutline(nodes: ManuscriptOutlineNode[], parentId: string): ReactNode {
    return nodes.map((node) => {
      const depth = node.depth + 1;
      if (node.kind === "group") {
        const entry = index.get(node.group.id)!;
        const expanded = isOpen(entry.id, true);
        return (
          <li key={entry.id}>
            <NavRow
              entry={entry}
              title={entry.title}
              depth={depth}
              parentId={parentId}
              icon={Layers}
              emphasis
              selected={selected?.id === entry.id}
              expanded={node.children.length > 0 ? expanded : undefined}
              renaming={renamingId === entry.id}
              onToggle={() => setOpenFor([entry.id], !expanded)}
              onSelect={(e) => {
                choose(entry.id, e);
                if (!expanded) setOpenFor([entry.id], true);
              }}
              onRename={() => setRenamingId(entry.id)}
              onRenameDone={(value) => commitRename(entry, value)}
              onAdd={(at) => openMenu(`Add to ${entry.title}`, at, groupAddItems(entry.id))}
              addLabel={`Add to ${entry.title}`}
              onMore={(at) => openMenu(`${entry.title} actions`, at, moreItems(entry, at))}
              onReorder={(step) => reorderManuscript(entry, step, true)}
              rowProps={manuscriptDragProps({ kind: "group", id: entry.id })}
              drop={drop?.id === entry.id ? drop.side : undefined}
              dragging={mdrag?.id === entry.id}
            />
            {expanded && node.children.length > 0 && (
              <Children depth={depth}>{renderOutline(node.children, entry.id)}</Children>
            )}
          </li>
        );
      }

      const { chapter } = node;
      const entry = index.get(chapter.id)!;
      const showsScenes = chapterShowsScenes(chapter);
      const expanded = isOpen(entry.id, false);
      return (
        <li key={entry.id}>
          <NavRow
            entry={entry}
            title={entry.title}
            depth={depth}
            parentId={parentId}
            icon={FileText}
            selected={selected?.id === entry.id}
            expanded={showsScenes ? expanded : undefined}
            renaming={renamingId === entry.id}
            onToggle={() => setOpenFor([entry.id], !expanded)}
            onSelect={(e) => choose(entry.id, e)}
            onRename={() => setRenamingId(entry.id)}
            onRenameDone={(value) => commitRename(entry, value)}
            onAdd={() => addScene(entry.id)}
            addLabel={`New scene in ${entry.title}`}
            onMore={(at) => openMenu(`${entry.title} actions`, at, moreItems(entry, at))}
            onReorder={(step) => reorderManuscript(entry, step, true)}
            rowProps={manuscriptDragProps({ kind: "chapter", id: entry.id })}
            drop={drop?.id === entry.id ? drop.side : undefined}
            dragging={mdrag?.id === entry.id}
          />
          {showsScenes && expanded && (
            <Children depth={depth}>
              {chapter.scenes.map((scene) => {
                const sceneEntry = index.get(scene.id)!;
                return (
                  <li key={scene.id}>
                    <NavRow
                      entry={sceneEntry}
                      title={sceneEntry.title}
                      depth={depth + 1}
                      parentId={entry.id}
                      muted
                      selected={selected?.id === scene.id}
                      renaming={renamingId === scene.id}
                      onSelect={(e) => choose(scene.id, e)}
                      onRename={() => setRenamingId(scene.id)}
                      onRenameDone={(value) => commitRename(sceneEntry, value)}
                      onMore={(at) => openMenu(`${sceneEntry.title} actions`, at, moreItems(sceneEntry, at))}
                      onReorder={placeable ? (step) => reorderManuscript(sceneEntry, step, true) : undefined}
                      rowProps={manuscriptDragProps({ kind: "scene", id: scene.id })}
                      drop={drop?.id === scene.id ? drop.side : undefined}
                      dragging={mdrag?.id === scene.id}
                    />
                  </li>
                );
              })}
            </Children>
          )}
        </li>
      );
    });
  }

  const manuscriptOpen = isOpen(ROOT_MANUSCRIPT, true);
  const unplacedOpen = isOpen(ROOT_UNPLACED, true);
  const workspaceOpen = isOpen(ROOT_WORKSPACE, workspace.tree.length > 0);

  function renderWorkspace(nodes: readonly WorkspaceTreeNode[], depth: number, parentId: string): ReactNode {
    return nodes.map((node) => {
      const entry = index.get(node.id);
      if (!entry) return null;
      const shared = {
        entry,
        title: entry.title,
        depth,
        parentId,
        renaming: renamingId === node.id,
        onRename: () => setRenamingId(node.id),
        onRenameDone: (value: string | null) => commitRename(entry, value),
        onMore: (at: { x: number; y: number }) => openMenu(`${entry.title} actions`, at, moreItems(entry, at)),
        onReorder: node.nodeId && workspace.organizable ? (step: -1 | 1) => reorder(node.id, step, true) : undefined,
        rowProps: dragProps(node, node.id),
        drop: drop?.id === node.id ? drop.side : undefined,
        dragging: dragging?.nodeId === node.nodeId && node.nodeId !== null,
      };

      if (node.kind === "folder") {
        // A Folder is a container: it always shows whether it is open, and a
        // click opens or closes it — there is nothing to select.
        const expanded = isOpen(node.id, false);
        return (
          <li key={node.id}>
            <NavRow
              {...shared}
              icon={expanded && node.children.length > 0 ? FolderOpen : Folder}
              selected={false}
              expanded={expanded}
              onToggle={() => setOpenFor([node.id], !expanded)}
              onSelect={() => setOpenFor([node.id], !expanded)}
              onAdd={(at) => openMenu(`Add to ${entry.title}`, at, workspaceAddItems(node))}
              addLabel={`Add to ${entry.title}`}
            />
            {expanded &&
              (node.children.length > 0 ? (
                <Children depth={depth}>{renderWorkspace(node.children, depth + 1, node.id)}</Children>
              ) : (
                <p
                  className="r2-nav-folder-empty"
                  // Where a child's icon would sit: row margin, indent, disclosure.
                  style={{ paddingLeft: 8 + BASE_PAD + (depth + 1) * INDENT + 22 }}
                >
                  Empty
                </p>
              ))}
          </li>
        );
      }

      if (node.kind === "canvas") {
        return (
          <li key={node.id}>
            <NavRow {...shared} icon={Frame} selected={selected?.id === node.id} onSelect={(e) => choose(node.id, e)} />
          </li>
        );
      }

      if (node.kind === "collection") {
        // Opens the Collection's view; its Entries are listed there, not here.
        return (
          <li key={node.id}>
            <NavRow
              {...shared}
              icon={Library}
              selected={selected?.id === node.id}
              onSelect={(e) => choose(node.id, e)}
              onAdd={() => addEntry(node.id)}
              addLabel={`New entry in ${entry.title}`}
            />
          </li>
        );
      }

      return (
        <li key={node.id}>
          <NavRow
            {...shared}
            icon={PageIcon}
            selected={selected?.id === node.id}
            onSelect={(e) => choose(node.id, e)}
          />
        </li>
      );
    });
  }

  return (
    <nav
      aria-label="Project"
      className="r2-nav"
      aria-busy={busy || refreshing}
      // Retracted: out of the way and out of the tab order, but still mounted
      // with its open rows intact.
      inert={navCollapsed || undefined}
    >
      <div className="r2-nav-header">
        <button
          type="button"
          className="r2-nav-project"
          title={manuscript.project.title}
          aria-haspopup="menu"
          aria-expanded={menu?.label === `${manuscript.project.title} actions`}
          aria-label={`${manuscript.project.title} — project actions`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openMenu(`${manuscript.project.title} actions`, { x: r.left, y: r.bottom + 4 }, projectItems());
          }}
        >
          <span className="r2-nav-project-title">{manuscript.project.title}</span>
          <ChevronDown {...ICON_SM_BOLD} aria-hidden />
        </button>
        <Tooltip label={<>Search <kbd>⌘K</kbd></>}>
          <button
            type="button"
            className="r2-icon-button r2-nav-search"
            aria-label="Search this project"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={() => setSearchOpen(true)}
          >
            <Search {...ICON} aria-hidden />
          </button>
        </Tooltip>
      </div>
      <div className="r2-nav-progress" data-active={busy || refreshing || undefined} aria-hidden />

      <div ref={scrollRef} className="r2-nav-scroll">
        <ul role="list">
          <li>
            <RootRow
              id={ROOT_MANUSCRIPT}
              label="Manuscript"
              count={manuscript.manuscriptWords}
              countLabel="words in the manuscript"
              selected={selected === null}
              expanded={manuscriptOpen}
              onToggle={() => setOpenFor([ROOT_MANUSCRIPT], !manuscriptOpen)}
              onSelect={(e) => choose(null, e)}
              onAdd={(at) => openMenu("Add to the manuscript", at, manuscriptAddItems())}
              addLabel="Add to the manuscript"
            />
            {manuscriptOpen &&
              (manuscript.outline.length > 0 ? (
                <ul role="list">{renderOutline(manuscript.outline, ROOT_MANUSCRIPT)}</ul>
              ) : (
                <div className="r2-nav-empty">
                  <span>No chapters yet.</span>
                  <button type="button" onClick={() => addChapter(null)} disabled={busy}>
                    New chapter
                  </button>
                </div>
              ))}
          </li>

          {manuscript.unplaced.length > 0 && (
            <li className="r2-nav-section">
              <RootRow
                id={ROOT_UNPLACED}
                label="Unplaced Scenes"
                count={manuscript.unplacedWords}
                countLabel="words in Unplaced Scenes"
                expanded={unplacedOpen}
                onToggle={() => setOpenFor([ROOT_UNPLACED], !unplacedOpen)}
                onSelect={() => setOpenFor([ROOT_UNPLACED], !unplacedOpen)}
                onAdd={addUnplacedScene}
                addLabel="New unplaced scene"
                rowProps={manuscriptDragProps({ kind: "unplaced", id: ROOT_UNPLACED })}
                drop={drop?.id === ROOT_UNPLACED ? drop.side : undefined}
              />
              {unplacedOpen && (
                <ul role="list">
                  {manuscript.unplaced.map((scene) => {
                    const entry = index.get(scene.id)!;
                    return (
                      <li key={scene.id}>
                        <NavRow
                          entry={entry}
                          title={entry.title}
                          depth={1}
                          parentId={ROOT_UNPLACED}
                          muted
                          selected={selected?.id === scene.id}
                          renaming={renamingId === scene.id}
                          onSelect={(e) => choose(scene.id, e)}
                          onRename={() => setRenamingId(scene.id)}
                          onRenameDone={(value) => commitRename(entry, value)}
                          onMore={(at) => openMenu(`${entry.title} actions`, at, moreItems(entry, at))}
                          onReorder={placeable ? (step) => reorderManuscript(entry, step, true) : undefined}
                          rowProps={manuscriptDragProps({ kind: "scene", id: scene.id })}
                          drop={drop?.id === scene.id ? drop.side : undefined}
                          dragging={mdrag?.id === scene.id}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          )}

          <li className="r2-nav-section">
            <RootRow
              id={ROOT_WORKSPACE}
              label="Workspace"
              expanded={workspaceOpen}
              onToggle={() => setOpenFor([ROOT_WORKSPACE], !workspaceOpen)}
              onSelect={() => setOpenFor([ROOT_WORKSPACE], !workspaceOpen)}
              onAdd={(at) => openMenu("Add to the workspace", at, workspaceAddItems(null))}
              addLabel="Add to the workspace"
              rowProps={dragProps(null, ROOT_WORKSPACE)}
              drop={drop?.id === ROOT_WORKSPACE ? drop.side : undefined}
            />
            {workspaceOpen &&
              (workspace.tree.length > 0 ? (
                <ul role="list">{renderWorkspace(workspace.tree, 1, ROOT_WORKSPACE)}</ul>
              ) : (
                // The Workspace's first-use teaching (Beta Completion E): what it is
                // for, and the three things it most often begins with.
                <div className="r2-nav-empty r2-nav-empty--workspace">
                  <span>Build only what the book asks for — notes, characters, research, a map of ideas.</span>
                  <span className="r2-nav-empty-actions">
                    <button type="button" onClick={() => addPage()} disabled={busy}>
                      Page
                    </button>
                    {workspace.organizable && workspace.collectable && (
                      <button type="button" onClick={() => addCollection()} disabled={busy}>
                        Collection
                      </button>
                    )}
                    {workspace.organizable && workspace.canvasable && (
                      <button type="button" onClick={() => addCanvas()} disabled={busy}>
                        Canvas
                      </button>
                    )}
                  </span>
                </div>
              ))}
          </li>
        </ul>
      </div>

      {notice && (
        <p role="status" className="r2-notice r2-nav-notice">
          {notice}
        </p>
      )}
      {!notice && trash.notice && (
        <p role="status" className="r2-notice r2-nav-notice r2-trash-notice">
          <span>{trash.notice.text}</span>
          {trash.notice.undo && (
            <button type="button" onClick={trash.undo}>
              Undo
            </button>
          )}
        </p>
      )}

      {/* The foot: Rune's account (All projects, Settings, Log out) and the
          Project's Trash — two quiet controls, not a toolbar. */}
      <div className="r2-nav-footer">
        <AccountControl onOpenSettings={() => setSettingsOpen(true)} />
        {trash.available && (
          <Tooltip label={trashOpen ? "Close Trash" : "Trash"}>
            <button
              type="button"
              className="r2-icon-button r2-icon-button--md r2-nav-trash"
              aria-label="Trash"
              aria-pressed={trashOpen}
              data-active={trashOpen || undefined}
              onClick={() => setTrashOpen(!trashOpen)}
            >
              <Trash2 {...ICON} aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>

      {menu && (
        <NavigatorMenu
          key={menu.key}
          label={menu.label}
          at={menu.at}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
      {renamingProject && (
        <RenameProjectDialog
          project={manuscript.project}
          onClose={() => setRenamingProject(false)}
          onRenamed={() => {
            setRenamingProject(false);
            startRefresh(() => router.refresh());
          }}
        />
      )}
    </nav>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────

/** Nested rows: indentation alone says where they belong (no tree lines). */
function Children({ children }: { depth: number; children: ReactNode }) {
  return (
    <ul role="list" className="r2-children">
      {children}
    </ul>
  );
}

function focusRow(id: string) {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`.r2-nav [data-row="${CSS.escape(id)}"]`)?.focus()
  );
}

/** Up/Down across visible rows; Left/Right open, close, or step to parent/child. */
function onRowKeyDown(
  e: React.KeyboardEvent<HTMLButtonElement>,
  expanded: boolean | undefined,
  onToggle: (() => void) | undefined,
  parentId: string | undefined
) {
  const nav = e.currentTarget.closest(".r2-nav");
  const rows = [...(nav?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
  const at = rows.indexOf(e.currentTarget);
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      rows[at + 1]?.focus();
      break;
    case "ArrowUp":
      e.preventDefault();
      rows[at - 1]?.focus();
      break;
    case "ArrowRight":
      e.preventDefault();
      if (expanded === false) onToggle?.();
      else if (expanded) rows[at + 1]?.focus();
      break;
    case "ArrowLeft":
      e.preventDefault();
      if (expanded) onToggle?.();
      else if (parentId) focusRow(parentId);
      break;
  }
}

function pointBelow(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom + 4 };
}

/** Below a row, for a menu opened without a pointer. */
function rowPoint(id: string) {
  const el = document.querySelector(`.r2-nav [data-row="${CSS.escape(id)}"]`);
  return el ? pointBelow(el) : { x: 16, y: 80 };
}

function Disclosure({
  expanded,
  label,
  onToggle,
}: {
  expanded: boolean | undefined;
  label: string;
  onToggle?: () => void;
}) {
  if (expanded === undefined) return <span className="r2-disclosure" aria-hidden />;
  return (
    <button
      type="button"
      tabIndex={-1}
      className="r2-disclosure"
      data-open={expanded || undefined}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
      onClick={onToggle}
    >
      <ChevronRight {...ICON_SM_BOLD} aria-hidden />
    </button>
  );
}

function RowActions({
  label,
  onAdd,
  addLabel,
  onMore,
}: {
  label: string;
  onAdd?: (at: { x: number; y: number }) => void;
  addLabel?: string;
  onMore?: (at: { x: number; y: number }) => void;
}) {
  if (!onAdd && !onMore) return null;
  return (
    <span className="r2-row-actions">
      {onMore && (
        <button
          type="button"
          tabIndex={-1}
          className="r2-row-action"
          aria-label={`${label} actions`}
          aria-haspopup="menu"
          onClick={(e) => onMore(pointBelow(e.currentTarget))}
        >
          <MoreHorizontal {...ICON} aria-hidden />
        </button>
      )}
      {onAdd && (
        <Tooltip label={addLabel}>
          <button
            type="button"
            tabIndex={-1}
            className="r2-row-action"
            aria-label={addLabel}
            onClick={(e) => onAdd(pointBelow(e.currentTarget))}
          >
            <Plus {...ICON} aria-hidden />
          </button>
        </Tooltip>
      )}
    </span>
  );
}

function NavRow({
  entry,
  title,
  depth,
  parentId,
  icon: Icon,
  emphasis,
  muted,
  selected,
  expanded,
  renaming,
  onToggle,
  onSelect,
  onRename,
  onRenameDone,
  onAdd,
  addLabel,
  onMore,
  onReorder,
  rowProps,
  drop,
  dragging,
}: {
  entry: NavEntry;
  title: string;
  depth: number;
  parentId: string;
  /** Chapters and Groups carry an icon; Scenes are known by indentation alone. */
  icon?: LucideIcon;
  emphasis?: boolean;
  muted?: boolean;
  selected: boolean;
  /** undefined = nothing to disclose. */
  expanded?: boolean;
  renaming: boolean;
  onToggle?: () => void;
  onSelect: (e: React.MouseEvent) => void;
  onRename: () => void;
  onRenameDone: (value: string | null) => void;
  onAdd?: (at: { x: number; y: number }) => void;
  addLabel?: string;
  onMore: (at: { x: number; y: number }) => void;
  /** ⌥↑ / ⌥↓: one step among its siblings (Workspace items, Chapters, Scenes). */
  onReorder?: (step: -1 | 1) => void;
  /** Drag and drop (Workspace items, Chapters, Scenes; Groups and Unplaced Scenes as targets). */
  rowProps?: HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  drop?: DropSide;
  dragging?: boolean;
}) {
  const pad = BASE_PAD + depth * INDENT + (Icon ? 0 : ICONLESS_INSET);
  return (
    <div
      {...rowProps}
      className="r2-row"
      data-selected={selected || undefined}
      data-emphasis={emphasis || undefined}
      data-muted={muted || undefined}
      data-renaming={renaming || undefined}
      data-drop={drop}
      data-dragging={dragging || undefined}
      style={{ paddingLeft: pad, "--r2-drop-inset": `${pad}px` } as CSSProperties}
      onContextMenu={(e) => {
        e.preventDefault();
        onMore({ x: e.clientX, y: e.clientY });
      }}
    >
      <Disclosure expanded={expanded} label={title} onToggle={onToggle} />
      {Icon && <Icon className="r2-row-icon" {...ICON} aria-hidden />}
      {renaming ? (
        <RenameInput initial={entry.named ? title : ""} placeholder={entry.named ? undefined : title} label={title} onDone={onRenameDone} />
      ) : (
        <button
          type="button"
          className="r2-row-main"
          data-row={entry.id}
          aria-current={selected || undefined}
          aria-expanded={expanded}
          onClick={onSelect}
          onDoubleClick={onRename}
          onKeyDown={(e) => {
            if (e.key === "F2") {
              e.preventDefault();
              onRename();
            } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
              e.preventDefault();
              onMore(pointBelow(e.currentTarget));
            } else if (onReorder && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault();
              onReorder(e.key === "ArrowUp" ? -1 : 1);
            } else {
              onRowKeyDown(e, expanded, onToggle, parentId);
            }
          }}
        >
          <span className="r2-row-label">{title}</span>
        </button>
      )}
      {!renaming && <RowActions label={title} onAdd={onAdd} addLabel={addLabel} onMore={onMore} />}
    </div>
  );
}

function RootRow({
  id,
  label,
  count,
  countLabel,
  selected = false,
  expanded,
  onToggle,
  onSelect,
  onAdd,
  addLabel,
  rowProps,
  drop,
}: {
  id: string;
  label: string;
  /** Omitted: no count (the Workspace has no words). */
  count?: number;
  countLabel?: string;
  selected?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (e: React.MouseEvent) => void;
  onAdd: (at: { x: number; y: number }) => void;
  addLabel: string;
  /** A drop target (the Workspace: drop here for its top level). */
  rowProps?: HTMLAttributes<HTMLDivElement>;
  drop?: DropSide;
}) {
  return (
    <div
      {...rowProps}
      className="r2-row r2-row--root"
      data-selected={selected || undefined}
      data-drop={drop}
      style={{ paddingLeft: BASE_PAD }}
    >
      <Disclosure expanded={expanded} label={label} onToggle={onToggle} />
      <button
        type="button"
        className="r2-row-main"
        data-row={id}
        aria-current={selected || undefined}
        aria-expanded={expanded}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            onAdd(pointBelow(e.currentTarget));
          } else {
            onRowKeyDown(e, expanded, onToggle, undefined);
          }
        }}
      >
        <span className="r2-row-label">{label}</span>
      </button>
      {count !== undefined && (
        <span className="r2-row-count" aria-label={`${formatCount(count)} ${countLabel}`}>
          {formatCount(count)}
        </span>
      )}
      <RowActions label={label} onAdd={onAdd} addLabel={addLabel} />
    </div>
  );
}

function RenameInput({
  initial,
  placeholder,
  label,
  onDone,
}: {
  initial: string;
  /** An unnamed object's fallback label, shown until the writer types a name. */
  placeholder?: string;
  label: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [done, setDone] = useState(false);
  const finish = (next: string | null) => {
    if (done) return;
    setDone(true);
    onDone(next);
  };
  return (
    <input
      className="r2-row-input"
      aria-label={`Rename ${label}`}
      placeholder={placeholder}
      value={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      maxLength={200}
    />
  );
}

/** A removed Chapter or deleted Group takes its own Revision Notes with it: said before it happens. */
function notesWarning(count: number, noun: "chapter" | "group"): string {
  if (count === 0) return "";
  const rest = noun === "chapter" ? "; its scenes keep theirs." : ".";
  return count === 1 ? ` Its revision note is deleted with it${rest}` : ` Its ${count} revision notes are deleted with it${rest}`;
}
