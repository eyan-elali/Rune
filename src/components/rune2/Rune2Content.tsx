"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileDown, MoreHorizontal, PanelRight, Plus, StickyNote, Trash2 } from "lucide-react";
import { ICON } from "./icons";
import { Tooltip } from "./Tooltip";
import { createScene } from "@/lib/actions/scenes";
import { cacheScene } from "@/lib/offline/db";
import { isWorkspaceKind, type NavEntry, type NavKind } from "@/lib/rune2/navigatorModel";
import { trashTypeOf } from "@/lib/rune2/trash";
import { writingTargetFor } from "@/lib/rune2/writingTarget";
import { NavigatorMenu, type NavigatorMenuItem } from "./NavigatorMenu";
import { useProjectExport } from "./ProjectExport";
import { useRune2Selection } from "./Rune2Selection";
import { Rune2Writing } from "./Rune2Writing";
import { CollectionView, NewEntryAction } from "./CollectionView";
import { ManuscriptScenes } from "./ManuscriptScenes";
import { ReadingMode, useReadingTitle } from "./ReadingMode";
import { WorkspacePages } from "./WorkspacePages";
import { useTrash } from "./WorkspaceTrash";

// The context bar (a quiet breadcrumb to the selection, and the selection's
// few contextual actions: "+ Scene" where a placed Scene can be added, then
// Revision Notes and Inspector, which share the one right-hand panel; the two
// panel actions stand a little apart from the rest, by space alone) and the
// content area. Chapters and Scenes open in
// the writing surface (see writingTarget.ts);
// a Group shows a structural summary; a Workspace Page or Collection Entry
// opens in its own editor (WorkspacePages); a Collection shows its Entries
// (CollectionView); with nothing selected, the content area shows its route
// (the Manuscript overview), and under it the Manuscript's Scene Views
// (ManuscriptScenes) — one quiet line until the writer asks for them. A
// Reading tab shows Reading Mode (read-only; see ReadingMode), and "Read"
// in the context bar opens it at the Group, Chapter or Scene in view.

const KIND_LABEL: Record<NavKind, string> = {
  group: "Group",
  chapter: "Chapter",
  scene: "Scene",
  unplacedScene: "Unplaced Scene",
  workspacePage: "Page",
  workspaceFolder: "Folder",
  workspaceCollection: "Collection",
  collectionEntry: "Entry",
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function Rune2ContextBar() {
  const { manuscript, index, selected, select, openInNewTab, panel, togglePanel, reading, openReading } =
    useRune2Selection();
  const readingTitle = useReadingTitle(reading);
  const target = writingTargetFor(selected, index);
  // "Read" from the Manuscript, or from a Group, Chapter or placed Scene: the
  // whole manuscript, opened at that place. (An Unplaced Scene is not part of it.)
  const readFrom =
    !reading && (!selected || selected.kind === "group" || selected.kind === "chapter" || selected.kind === "scene")
      ? (selected?.id ?? null)
      : undefined;
  // id undefined = a label only (Unplaced Scenes and Workspace are sections,
  // and a Folder is navigation — none of them opens). An Entry's Collection
  // opens.
  const inWorkspace = selected ? isWorkspaceKind(selected.kind) : false;
  const trail: { id?: string | null; title: string }[] = inWorkspace
    ? [{ title: "Workspace" }]
    : [{ id: null, title: "Manuscript" }];
  if (selected) {
    if (selected.kind === "unplacedScene") trail.push({ title: "Unplaced Scenes" });
    trail.push(
      ...selected.path.map((p) => (p.kind === "workspaceFolder" ? { title: p.title } : { id: p.id, title: p.title }))
    );
    trail.push({ id: selected.id, title: selected.title });
  }
  if (reading) trail.push({ title: readingTitle });

  return (
    <header className="r2-contextbar">
      <nav aria-label="Breadcrumb">
        <ol>
          <li className="r2-crumb-project">{manuscript.project.title}</li>
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={`${crumb.id}-${i}`}>
                <span aria-hidden className="r2-crumb-sep">/</span>
                {last ? (
                  <span aria-current="page" className="r2-crumb-current">{crumb.title}</span>
                ) : crumb.id === undefined ? (
                  <span>{crumb.title}</span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) =>
                      e.metaKey || e.ctrlKey ? openInNewTab(crumb.id ?? null) : select(crumb.id ?? null)
                    }
                  >
                    {crumb.title}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="r2-contextbar-actions">
        {selected?.kind === "collectionEntry" && selected.path.length > 0 && (
          <NewEntryAction collectionId={selected.path[selected.path.length - 1].id} />
        )}
        {target?.kind === "scenes" && target.addSceneTo && <AddSceneAction chapterId={target.addSceneTo} />}
        {readFrom !== undefined && manuscript.placedSceneCount > 0 && (
          <Tooltip
            label={selected ? `Read from here — read-only, in a tab of its own` : "Read the manuscript — read-only, in a tab of its own"}
            describes
          >
            <button type="button" className="r2-action" onClick={() => openReading({ kind: "manuscript" }, readFrom)}>
              <BookOpen {...ICON} aria-hidden />
              Read
            </button>
          </Tooltip>
        )}
        {selected && (trashTypeOf(selected) || isExportable(selected)) && selected.kind !== "workspaceFolder" && (
          <ItemMenu entry={selected} />
        )}
        <span className="r2-contextbar-panel">
          <button
            type="button"
            className="r2-action"
            data-panel-action="notes"
            aria-pressed={panel === "notes"}
            onClick={() => togglePanel("notes")}
          >
            <StickyNote {...ICON} aria-hidden />
            Revision Notes
          </button>
          <Tooltip label={panel === "inspector" ? "Close inspector" : "Inspector"}>
            <button
              type="button"
              className="r2-action r2-action--icon"
              data-panel-action="inspector"
              aria-pressed={panel === "inspector"}
              aria-label="Inspector"
              onClick={() => togglePanel("inspector")}
            >
              <PanelRight {...ICON} aria-hidden />
            </button>
          </Tooltip>
        </span>
      </div>
    </header>
  );
}

const isExportable = (entry: NavEntry) => entry.kind === "chapter" || entry.kind === "scene" || entry.kind === "unplacedScene";

/**
 * "⋯" for the item in view (a Page, Collection, Entry, Chapter or Scene): its
 * quiet actions — "Export chapter…" / "Export scene…", and "Move to Trash". An
 * Entry has no navigator row, so this is where it is trashed from. Trash is
 * hidden before migration 030 (031 for Scenes).
 */
function ItemMenu({ entry }: { entry: NavEntry }) {
  const trash = useTrash();
  const exporter = useProjectExport();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const isScene = entry.kind === "scene" || entry.kind === "unplacedScene";
  const items: NavigatorMenuItem[] = [];
  if (exporter && isExportable(entry)) {
    items.push({
      label: entry.kind === "chapter" ? "Export chapter…" : "Export scene…",
      icon: FileDown,
      onSelect: () =>
        exporter.openExport(entry.kind === "chapter" ? { kind: "chapter", chapterId: entry.id } : { kind: "scene", sceneId: entry.id }),
    });
  }
  if (trashTypeOf(entry) && trash.available && !(isScene && !trash.scenesAvailable)) {
    items.push({
      label: "Move to Trash",
      icon: Trash2,
      tone: "danger",
      onSelect: async () => {
        setBusy(true);
        try {
          setNotice(await trash.moveToTrash(entry));
        } finally {
          setBusy(false);
        }
      },
    });
  }
  if (items.length === 0) return null;
  return (
    <>
      {notice && (
        <span role="status" className="r2-contextbar-notice">
          {notice}
        </span>
      )}
      <Tooltip label="More">
        <button
          type="button"
          className="r2-action r2-action--icon"
          aria-label={`${entry.title} actions`}
          aria-haspopup="menu"
          disabled={busy}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setAt({ x: r.right - 180, y: r.bottom + 4 });
          }}
        >
          <MoreHorizontal {...ICON} aria-hidden />
        </button>
      </Tooltip>
      {at && (
        <NavigatorMenu
          label={`${entry.title} actions`}
          at={at}
          items={items}
          onClose={() => setAt(null)}
        />
      )}
    </>
  );
}

/**
 * "+ Scene": appends an empty Scene to the Chapter in view — the one creation
 * Phase 1 supports (createScene; the database picks the position). Nothing
 * existing changes: a Chapter's first Scene keeps its id and prose, and the
 * Chapter simply has two Scenes now, so its Scene structure shows.
 *
 * From the Chapter, the writer stays in the Chapter and the new Scene takes
 * focus there; from one of its Scenes, the new Scene opens on its own.
 */
function AddSceneAction({ chapterId }: { chapterId: string }) {
  const { manuscript, index, selected, setOpenFor, selectWhenPresent, requestSceneFocus } =
    useRune2Selection();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startRefresh] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function add() {
    if (busy) return;
    const chapter = index.get(chapterId);
    const fromChapter = selected?.id === chapterId;
    setBusy(true);
    setNotice(null);
    try {
      // Unnamed: it shows as "Scene N" from where it stands, never stored.
      const r = await createScene(chapterId, null);
      if (r.error !== null) {
        setNotice("Couldn’t add a scene.");
        return;
      }
      try {
        await cacheScene(r.data, manuscript.project.id);
      } catch {
        // The surface reads it from the server instead.
      }
      setOpenFor([...(chapter?.path.map((p) => p.id) ?? []), chapterId], true);
      if (!fromChapter) selectWhenPresent(r.data.id);
      requestSceneFocus(r.data.id);
    } catch {
      setNotice("Couldn’t add a scene.");
    } finally {
      setBusy(false);
      startRefresh(() => router.refresh());
    }
  }

  return (
    <>
      {notice && (
        <span role="status" className="r2-contextbar-notice">
          {notice}
        </span>
      )}
      <Tooltip label={`Add a scene to the end of ${index.get(chapterId)?.title ?? "this chapter"}`} describes>
        <button type="button" className="r2-action" disabled={busy} onClick={() => void add()}>
          <Plus {...ICON} aria-hidden />
          Scene
        </button>
      </Tooltip>
    </>
  );
}

export function Rune2SelectionView({ children }: { children: ReactNode }) {
  const { manuscript, selected, index, reading, activeTab } = useRune2Selection();
  const target = writingTargetFor(selected, index);
  return (
    <>
      {reading && <ReadingMode key={activeTab} source={reading} />}
      {!target &&
        !reading &&
        (selected
          ? (selected.kind === "group" && <StructurePreview entry={selected} />) ||
            (selected.kind === "workspaceCollection" && <CollectionView key={selected.id} entry={selected} />)
          : (
            <>
              {children}
              <ManuscriptScenes />
            </>
          ))}
      {/* Always mounted, in the same place, so a Scene that stays on screen
          between views keeps its editor instance. */}
      <Rune2Writing projectId={manuscript.project.id} target={target} />
      {/* Always mounted too: Pages and Entries keep their save engines between views. */}
      <WorkspacePages />
    </>
  );
}

/** A Group: structure, not prose. A restrained summary until Groups get their own view. */
function StructurePreview({ entry }: { entry: NavEntry }) {
  return (
    <div className="r2-overview">
      <p className="r2-overview-kind">{KIND_LABEL[entry.kind]}</p>
      <h1>{entry.title}</h1>
      <dl>
        <dt>Contains</dt>
        <dd>{plural(entry.childCount, "item")}</dd>
        <dt>Words</dt>
        <dd>{plural(entry.words, "word")}</dd>
      </dl>
    </div>
  );
}
