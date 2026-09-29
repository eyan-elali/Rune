"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, PanelRight, Plus, StickyNote, Trash2 } from "lucide-react";
import { createScene } from "@/lib/actions/scenes";
import { cacheScene } from "@/lib/offline/db";
import { isWorkspaceKind, type NavEntry, type NavKind } from "@/lib/rune2/navigatorModel";
import { trashTypeOf } from "@/lib/rune2/trash";
import { writingTargetFor } from "@/lib/rune2/writingTarget";
import { NavigatorMenu } from "./NavigatorMenu";
import { useRune2Selection } from "./Rune2Selection";
import { Rune2Writing } from "./Rune2Writing";
import { CollectionView, NewEntryAction } from "./CollectionView";
import { ManuscriptScenes } from "./ManuscriptScenes";
import { WorkspacePages } from "./WorkspacePages";
import { useTrash } from "./WorkspaceTrash";

// The context bar (a quiet breadcrumb to the selection, and the selection's
// few contextual actions: "+ Scene" where a placed Scene can be added, then
// Revision Notes and Inspector, which share the one right-hand panel) and the content
// area. Chapters and Scenes open in
// the writing surface (see writingTarget.ts);
// a Group shows a structural summary; a Workspace Page or Collection Entry
// opens in its own editor (WorkspacePages); a Collection shows its Entries
// (CollectionView); with nothing selected, the content area shows its route
// (the Manuscript overview), and under it the Manuscript's Scene Views
// (ManuscriptScenes) — one quiet line until the writer asks for them.

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
  const { manuscript, index, selected, select, openInNewTab, panel, togglePanel } = useRune2Selection();
  const target = writingTargetFor(selected, index);
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
          <>
            <NewEntryAction collectionId={selected.path[selected.path.length - 1].id} />
            <span className="r2-contextbar-divider" aria-hidden />
          </>
        )}
        {selected && trashTypeOf(selected) && selected.kind !== "workspaceFolder" && (
          <>
            <ItemMenu entry={selected} />
            <span className="r2-contextbar-divider" aria-hidden />
          </>
        )}
        {target?.kind === "scenes" && target.addSceneTo && (
          <>
            <AddSceneAction chapterId={target.addSceneTo} />
            <span className="r2-contextbar-divider" aria-hidden />
          </>
        )}
        <button
          type="button"
          className="r2-action"
          data-panel-action="notes"
          aria-pressed={panel === "notes"}
          onClick={() => togglePanel("notes")}
          title={panel === "notes" ? "Close revision notes" : "Revision notes for the whole manuscript"}
        >
          <StickyNote size={14} strokeWidth={1.75} aria-hidden />
          Revision Notes
        </button>
        <button
          type="button"
          className="r2-action r2-action--icon"
          data-panel-action="inspector"
          aria-pressed={panel === "inspector"}
          aria-label="Inspector"
          onClick={() => togglePanel("inspector")}
          title={panel === "inspector" ? "Close inspector" : "Inspector"}
        >
          <PanelRight size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </header>
  );
}

/**
 * "⋯" for the item in view (a Page, Collection, Entry or Scene): its quiet
 * actions — for now, "Move to Trash". An Entry has no navigator row, so this
 * is where it is trashed from. Hidden before migration 030 (031 for Scenes).
 */
function ItemMenu({ entry }: { entry: NavEntry }) {
  const trash = useTrash();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const isScene = entry.kind === "scene" || entry.kind === "unplacedScene";
  if (!trash.available || (isScene && !trash.scenesAvailable)) return null;
  return (
    <>
      {notice && (
        <span role="status" className="r2-contextbar-notice">
          {notice}
        </span>
      )}
      <button
        type="button"
        className="r2-action r2-action--icon"
        aria-label={`${entry.title} actions`}
        aria-haspopup="menu"
        title="More"
        disabled={busy}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.right - 180, y: r.bottom + 4 });
        }}
      >
        <MoreHorizontal size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {at && (
        <NavigatorMenu
          label={`${entry.title} actions`}
          at={at}
          items={[
            {
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
            },
          ]}
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
      <button
        type="button"
        className="r2-action"
        disabled={busy}
        onClick={() => void add()}
        title={`Add a scene to the end of ${index.get(chapterId)?.title ?? "this chapter"}`}
      >
        <Plus size={14} strokeWidth={1.75} aria-hidden />
        Scene
      </button>
    </>
  );
}

export function Rune2SelectionView({ children }: { children: ReactNode }) {
  const { manuscript, selected, index } = useRune2Selection();
  const target = writingTargetFor(selected, index);
  return (
    <>
      {!target &&
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
