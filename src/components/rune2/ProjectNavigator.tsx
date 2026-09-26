"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  FolderInput,
  Layers,
  PanelTop,
  MoreHorizontal,
  Pencil,
  Pilcrow,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { createChapter, deleteChapter, updateChapter } from "@/lib/actions/chapters";
import { createScene, createUnplacedScene, moveSceneToUnplaced, renameScene } from "@/lib/actions/scenes";
import { createGroup, deleteGroup, moveChapter, renameGroup } from "@/lib/actions/structure";
import { chapterShowsScenes, type NavEntry } from "@/lib/rune2/navigatorModel";
import type { ManuscriptOutlineNode } from "@/lib/rune2/projectManuscript";
import { NavigatorMenu, type NavigatorMenuItem } from "./NavigatorMenu";
import { useRune2Selection } from "./Rune2Selection";

// The Rune 2.0 project navigator: the Manuscript (Groups → Chapters → Scenes)
// in reading order, then Unplaced Scenes. Every change goes through the Phase 1
// server actions — each one atomic in the database — and the tree then
// re-reads the manuscript (router.refresh). Nothing here holds a second copy
// of the structure; only UI state (open rows and titles just renamed but not
// yet re-read — both shared through the selection context, since the writing
// surface, tabs and context bar use them too — and the row being renamed).
//
// A click opens the object in the active tab (or goes to the tab already
// showing it); ⌘/Ctrl-click, or "Open in new tab" in its menu, gives it a tab.
//
// Not here yet, deliberately: drag-and-drop and other moves (beyond "Move to
// Unplaced Scenes"), and deleting a Scene — Phase 1 deletion is permanent and
// Rune 2.0 deletion should be recoverable (architecture §26, Trash).

const BASE_PAD = 6;
const INDENT = 16;
/* A Scene row has no icon: its label is set in a little further instead, so
   Scenes read as the Chapter's contents by indentation alone. */
const ICONLESS_INSET = 19;
const ROOT_MANUSCRIPT = "root:manuscript";
const ROOT_UNPLACED = "root:unplaced";

type MenuState = { label: string; at: { x: number; y: number }; items: NavigatorMenuItem[] };

const formatCount = (n: number) => n.toLocaleString();

export function ProjectNavigator() {
  const {
    manuscript,
    index,
    selected,
    select,
    openInNewTab,
    selectWhenPresent,
    open,
    setOpenFor,
    setRenamedTitle,
  } = useRune2Selection();
  const projectId = manuscript.project.id;
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        return r.wordLimitBlocked ? "Your word limit has been reached." : "Couldn’t create the scene.";
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
        return r.wordLimitBlocked ? "Your word limit has been reached." : "Couldn’t create the scene.";
      }
      selectAndReveal(r.data.id, [ROOT_UNPLACED], false);
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
    if (next === (entry.named ? entry.title : "") || (entry.kind !== "group" && next === "")) return;

    setRenamedTitle(entry.id, next);
    run(async () => {
      if (entry.kind === "group") {
        const r = await renameGroup(entry.id, next || null, projectId);
        return r.error ? "Couldn’t rename the group." : null;
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
    setMenu({ label, at, items });

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

  function moreItems(entry: NavEntry): NavigatorMenuItem[] {
    return [{ label: "Open in new tab", icon: PanelTop, onSelect: () => openInNewTab(entry.id) }, ...kindItems(entry)];
  }

  function kindItems(entry: NavEntry): NavigatorMenuItem[] {
    const rename: NavigatorMenuItem = { label: "Rename", icon: Pencil, onSelect: () => setRenamingId(entry.id) };
    switch (entry.kind) {
      case "group":
        return [
          rename,
          ...groupAddItems(entry.id),
          // Phase 1 deletes only an empty Group; there is no Trash yet.
          ...(entry.childCount === 0
            ? [{ label: "Delete group", icon: Trash2, tone: "danger" as const, onSelect: () => removeGroup(entry.id) }]
            : []),
        ];
      case "chapter":
        return [
          rename,
          { label: "New scene", icon: Pilcrow, onSelect: () => addScene(entry.id) },
          {
            label: "Delete chapter",
            icon: Trash2,
            tone: "danger",
            confirm: {
              message:
                entry.childCount === 0
                  ? "Delete this empty chapter?"
                  : `Delete this chapter? ${
                      entry.childCount === 1 ? "Its writing moves" : `Its ${entry.childCount} scenes move`
                    } to Unplaced Scenes — nothing is lost.`,
              action: "Delete chapter",
            },
            onSelect: () => removeChapter(entry.id, entry.childCount),
          },
        ];
      case "scene":
        return [
          rename,
          { label: "Move to Unplaced Scenes", icon: FolderInput, onSelect: () => toUnplaced(entry.id) },
        ];
      case "unplacedScene":
        return [rename];
    }
  }

  const removeGroup = (id: string) =>
    run(async () => {
      const r = await deleteGroup(id, projectId);
      return r.error ? "Couldn’t delete the group." : null;
    });

  const removeChapter = (id: string, sceneCount: number) =>
    run(async () => {
      const r = await deleteChapter(id, projectId);
      if (r.error) return "Couldn’t delete the chapter.";
      if (sceneCount === 0) return null;
      setOpenFor([ROOT_UNPLACED], true);
      return sceneCount === 1
        ? "The chapter’s writing is now in Unplaced Scenes."
        : "The chapter’s scenes are now in Unplaced Scenes.";
    });

  const toUnplaced = (sceneId: string) =>
    run(async () => {
      const r = await moveSceneToUnplaced(sceneId);
      if (r.error !== null) return "Couldn’t move the scene.";
      setOpenFor([ROOT_UNPLACED], true);
      return null;
    });

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
              onMore={(at) => openMenu(`${entry.title} actions`, at, moreItems(entry))}
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
            onMore={(at) => openMenu(`${entry.title} actions`, at, moreItems(entry))}
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
                      onMore={(at) => openMenu(`${sceneEntry.title} actions`, at, moreItems(sceneEntry))}
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

  return (
    <nav aria-label="Project" className="r2-nav" aria-busy={busy || refreshing}>
      <div className="r2-nav-header">
        <span className="r2-nav-project" title={manuscript.project.title}>
          {manuscript.project.title}
        </span>
      </div>
      <div className="r2-nav-progress" data-active={busy || refreshing || undefined} aria-hidden />

      <div className="r2-nav-scroll">
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
                          onMore={(at) => openMenu(`${entry.title} actions`, at, moreItems(entry))}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          )}
        </ul>
      </div>

      {notice && (
        <p role="status" className="r2-nav-notice">
          {notice}
        </p>
      )}

      <div className="r2-nav-footer">
        <Link href="/dashboard">
          <ArrowLeft size={13} strokeWidth={1.75} aria-hidden />
          Back to Rune
        </Link>
      </div>

      {menu && (
        <NavigatorMenu label={menu.label} at={menu.at} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </nav>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────

/** Nested rows, with a hairline guide under the parent's disclosure control. */
function Children({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <ul role="list" className="r2-children" style={{ "--r2-guide": `${BASE_PAD + depth * INDENT + 8}px` } as CSSProperties}>
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
      <ChevronRight size={12} strokeWidth={2} aria-hidden />
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
          <MoreHorizontal size={14} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {onAdd && (
        <button
          type="button"
          tabIndex={-1}
          className="r2-row-action"
          aria-label={addLabel}
          title={addLabel}
          onClick={(e) => onAdd(pointBelow(e.currentTarget))}
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden />
        </button>
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
}) {
  return (
    <div
      className="r2-row"
      data-selected={selected || undefined}
      data-emphasis={emphasis || undefined}
      data-muted={muted || undefined}
      data-renaming={renaming || undefined}
      style={{ paddingLeft: BASE_PAD + depth * INDENT + (Icon ? 0 : ICONLESS_INSET) }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMore({ x: e.clientX, y: e.clientY });
      }}
    >
      <Disclosure expanded={expanded} label={title} onToggle={onToggle} />
      {Icon && <Icon className="r2-row-icon" size={14} strokeWidth={1.75} aria-hidden />}
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
}: {
  id: string;
  label: string;
  count: number;
  countLabel: string;
  selected?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (e: React.MouseEvent) => void;
  onAdd: (at: { x: number; y: number }) => void;
  addLabel: string;
}) {
  return (
    <div className="r2-row r2-row--root" data-selected={selected || undefined} style={{ paddingLeft: BASE_PAD }}>
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
      <span className="r2-row-count" aria-label={`${formatCount(count)} ${countLabel}`}>
        {formatCount(count)}
      </span>
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
