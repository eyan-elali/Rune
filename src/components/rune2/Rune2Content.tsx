"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PanelRight, Plus, StickyNote } from "lucide-react";
import { createScene } from "@/lib/actions/scenes";
import { cacheScene } from "@/lib/offline/db";
import type { NavEntry, NavKind } from "@/lib/rune2/navigatorModel";
import { writingTargetFor } from "@/lib/rune2/writingTarget";
import { useRune2Selection } from "./Rune2Selection";
import { Rune2Writing } from "./Rune2Writing";

// The context bar (a quiet breadcrumb to the selection, and the selection's
// few contextual actions: "+ Scene" where a placed Scene can be added, then
// Revision Notes and Inspector, which share the one right-hand panel) and the content
// area. Chapters and Scenes open in
// the writing surface (see writingTarget.ts);
// a Group shows a structural summary; with nothing selected, the content area
// shows its route (the Manuscript overview).

const KIND_LABEL: Record<NavKind, string> = {
  group: "Group",
  chapter: "Chapter",
  scene: "Scene",
  unplacedScene: "Unplaced Scene",
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function Rune2ContextBar() {
  const { manuscript, index, selected, select, openInNewTab, panel, togglePanel } = useRune2Selection();
  const target = writingTargetFor(selected, index);
  // id undefined = a label only (Unplaced Scenes is a section, not an object).
  const trail: { id?: string | null; title: string }[] = [{ id: null, title: "Manuscript" }];
  if (selected) {
    if (selected.kind === "unplacedScene") trail.push({ title: "Unplaced Scenes" });
    trail.push(...selected.path.map((p) => ({ id: p.id, title: p.title })));
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
        setNotice(r.wordLimitBlocked ? "Your word limit has been reached." : "Couldn’t add a scene.");
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
      {!target && (selected ? <StructurePreview entry={selected} /> : children)}
      {/* Always mounted, in the same place, so a Scene that stays on screen
          between views keeps its editor instance. */}
      <Rune2Writing projectId={manuscript.project.id} target={target} />
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
