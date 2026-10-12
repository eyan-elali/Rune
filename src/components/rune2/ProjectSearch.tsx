"use client";

import { useEffect, useId, useMemo, useState, useTransition, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, Frame, Library, Search, type LucideIcon } from "lucide-react";
import { ICON } from "./icons";
import { searchProjectContent } from "@/lib/actions/projectSearch";
import { createWorkspacePage } from "@/lib/actions/workspacePages";
import { createWorkspaceCollection } from "@/lib/actions/workspaceCollections";
import { createWorkspaceCanvas } from "@/lib/actions/workspaceCanvas";
import {
  CONTENT_QUERY_MIN,
  highlight,
  normalizeQuery,
  SEARCH_KIND_LABEL,
  searchObjects,
  searchProject,
  type ContentMatch,
  type SearchResult,
} from "@/lib/rune2/projectSearch";
import { ROOT_WORKSPACE } from "./ProjectNavigator";
import { useRune2Selection } from "./Rune2Selection";

// Project Search: find any Scene, Chapter, Group, Page, Folder, Collection,
// Entry or Canvas of this Project — or a note or Section on a Canvas, by its
// text — and open it. ⌘K / Ctrl-K (or the navigator's search
// button) opens a small overlay over the shell; Escape or a click outside
// closes it, and focus goes back where it was.
//
// Titles match as the writer types, from the shell's own index — instantly,
// and exactly as the navigator names them. Text inside Scenes, Pages and
// Entries is asked of the server a moment after typing pauses, and its
// matches join below the title matches. Nothing here changes content: the
// highlighted words are only this overlay's markup.
//
// A result opens through the working set like a navigator row: Enter or a
// click in the active tab (or goes to the object's tab), ⌘/Ctrl-Enter,
// ⌘/Ctrl-click or a middle click in a tab of its own. A Folder, which is
// navigation only, is revealed and focused in the navigator instead.
//
// From the tab strip's "+" ("Open another"), what isn't found can be made:
// a Page, a Collection or a Canvas named by the query — Workspace objects
// that open as tabs. Never a Scene, Chapter or Group (the Manuscript's own
// paths make those) and never a Folder (it doesn't open as a tab). Results
// come first; the Create choices follow them quietly, or lead when nothing
// was found. The new object opens in a tab of its own, its title ready.

const SHOWN = 50;

type CreateKind = "page" | "collection" | "canvas";
const CREATE: { kind: CreateKind; label: string; icon: LucideIcon }[] = [
  { kind: "page", label: "Page", icon: FilePlus },
  { kind: "collection", label: "Collection", icon: Library },
  { kind: "canvas", label: "Canvas", icon: Frame },
];
const PAUSE_MS = 160;

export function ProjectSearch() {
  const { searchOpen, setSearchOpen } = useRune2Selection();

  // Captured so ⌘K reaches search wherever focus is — prose included.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setSearchOpen]);

  return searchOpen ? <SearchDialog onClose={() => setSearchOpen(false)} /> : null;
}

/** The form a query is sent to the server in (and remembered by). */
function contentKey(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const {
    index,
    manuscript,
    select,
    openInNewTab,
    appendToWorkingSet,
    searchIntent,
    setOpenFor,
    navCollapsed,
    toggleNav,
    requestCanvasFocus,
    workspace,
    appendWhenPresent,
    requestSceneFocus,
  } = useRune2Selection();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  // Opened from the tab strip's "+": whatever is chosen joins the working set
  // in a tab of its own at the end (or goes to its tab), the others kept.
  const adding = searchIntent === "add";
  const projectId = manuscript.project.id;
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Text matches by query, for this opening of search only (text changes).
  const [inText, setInText] = useState<Record<string, ContentMatch[] | "failed">>({});
  // Where focus was when search opened (read before the input takes it).
  const [returnFocus] = useState(() => document.activeElement);
  // However it closes (⌘K again included), a keyboard left on nothing goes back where it was.
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if ((!now || now === document.body) && returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
      });
    },
    [returnFocus]
  );

  const key = contentKey(query);
  const searchesText = key.length >= CONTENT_QUERY_MIN;
  useEffect(() => {
    if (!searchesText || key in inText) return;
    const timer = setTimeout(async () => {
      const r = await searchProjectContent(projectId, key);
      setInText((prev) => ({ ...prev, [key]: r.error === null ? r.data : "failed" }));
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [key, searchesText, inText, projectId]);

  const objects = useMemo(() => searchObjects(index), [index]);
  const known = inText[key];
  const results = useMemo(
    () => searchProject(objects, query, {}, Array.isArray(known) ? known : []).slice(0, SHOWN),
    [objects, query, known]
  );
  const pending = searchesText && known === undefined;
  const title = query.trim().replace(/\s+/g, " ");
  // What "+" can make here: only the kinds this Project's Workspace has.
  const creatable =
    adding && title !== "" && !pending
      ? CREATE.filter(
          (c) =>
            c.kind === "page" ||
            (c.kind === "collection" && workspace.organizable && workspace.collectable) ||
            (c.kind === "canvas" && workspace.organizable && workspace.canvasable)
        )
      : [];
  // One list for the keyboard: the results, then the Create choices.
  const count = results.length + creatable.length;
  const at = Math.min(active, Math.max(count - 1, 0));

  useEffect(() => {
    document.getElementById(`${listId}-${at}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, at, results, creatable.length]);

  /** Makes a Page, Collection or Canvas named `title` and opens it in a tab of its own, its title ready. */
  async function create(kind: CreateKind) {
    if (creating) return;
    setCreating(true);
    setCreateFailed(false);
    try {
      const r =
        kind === "page"
          ? await createWorkspacePage(projectId, title, null).then((x) => (x.error === null ? x.data.id : null))
          : kind === "collection"
            ? await createWorkspaceCollection(projectId, title, null).then((x) => (x.error === null ? x.data.collection.id : null))
            : await createWorkspaceCanvas(projectId, title, null).then((x) => (x.error === null ? x.data.canvas.id : null));
      if (r === null) throw new Error("not created");
      onClose();
      appendWhenPresent(r);
      requestSceneFocus(r);
      startRefresh(() => router.refresh());
    } catch {
      setCreateFailed(true);
      setCreating(false);
    }
  }

  const dismiss = () => {
    const el = returnFocus;
    onClose();
    if (el instanceof HTMLElement && el.isConnected) requestAnimationFrame(() => el.focus());
  };

  const open = (r: SearchResult, newTab: boolean) => {
    onClose();
    const go = (id: string) => (adding ? appendToWorkingSet(id) : newTab ? openInNewTab(id) : select(id));
    if (r.kind === "folder") {
      // Navigation only: open the navigator down to it and put focus there.
      setOpenFor([ROOT_WORKSPACE, ...(index.get(r.id)?.path.map((p) => p.id) ?? []), r.id], true);
      if (navCollapsed) toggleNav();
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`.r2-nav [data-row="${CSS.escape(r.id)}"]`)?.focus()
        )
      );
      return;
    }
    if (r.canvasId) {
      // Canvas-local writing: the Canvas opens, and the note or Section is brought into view and selected there.
      requestCanvasFocus({ canvasId: r.canvasId, itemId: r.id });
      go(r.canvasId);
      return;
    }
    go(r.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(at + 1, Math.max(count - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(at - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[at]) open(results[at], e.metaKey || e.ctrlKey);
      else if (creatable[at - results.length]) void create(creatable[at - results.length].kind);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    } else if (e.key === "Tab") {
      // The input is the dialog's one stop; results are chosen by arrow.
      e.preventDefault();
    }
  };

  const onResultClick = (r: SearchResult, e: MouseEvent) => open(r, e.metaKey || e.ctrlKey);
  const trimmed = query.trim();
  const noResults = normalizeQuery(query) !== "" && results.length === 0 && !pending;
  const createSection = creatable.length > 0 && (
    <div className="r2-search-create" data-lead={results.length === 0 || undefined}>
      <p className="r2-search-section" id={`${listId}-create`}>
        Create
      </p>
      <ul role="listbox" aria-labelledby={`${listId}-create`} aria-busy={creating || undefined} className="r2-search-results">
        {creatable.map((c, k) => {
          const i = results.length + k;
          const Icon = c.icon;
          return (
            <li
              key={c.kind}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === at}
              aria-disabled={creating || undefined}
              data-active={i === at || undefined}
              className="r2-search-create-option"
              onPointerDown={(e) => e.preventDefault()}
              onPointerMove={() => i !== at && setActive(i)}
              onClick={() => void create(c.kind)}
            >
              <Icon {...ICON} aria-hidden className="r2-search-create-icon" />
              <span className="r2-search-title">
                {c.label}
                <span className="r2-search-create-name"> — “{title}”</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      <div className="r2-search-scrim" aria-hidden onPointerDown={dismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={adding ? "Open another in a new tab" : "Search this project"}
        className="r2-search"
      >
        <div className="r2-search-field">
          <Search {...ICON} aria-hidden className="r2-search-icon" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={count > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={count ? `${listId}-${at}` : undefined}
            aria-label={adding ? "Find something to open in a new tab, or name something to create" : "Search this project"}
            placeholder={adding ? "Open or create…" : "Search this project"}
            spellCheck={false}
            autoComplete="off"
            maxLength={200}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        {results.length > 0 && (
          <ul id={listId} role="listbox" aria-label="Results" className="r2-search-results">
            {results.map((r, i) => (
              <li
                key={r.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === at}
                data-active={i === at || undefined}
                onPointerDown={(e) => e.preventDefault()}
                onPointerMove={() => i !== at && setActive(i)}
                onClick={(e) => onResultClick(r, e)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    open(r, true);
                  }
                }}
              >
                <span className="r2-search-title">
                  <Marked text={r.title} query={r.tier <= 2 ? trimmed : ""} />
                </span>
                <span className="r2-search-meta">
                  {SEARCH_KIND_LABEL[r.kind]} · {r.context}
                </span>
                {r.snippet && (
                  <span className="r2-search-snippet">
                    <Marked text={r.snippet} query={trimmed} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {noResults && <p className="r2-search-empty">No results for “{trimmed}”</p>}
        {createSection}
        {createFailed && <p className="r2-search-note">That couldn’t be created. Try again.</p>}
        {/* What the list holds, heard as it changes (the list itself is not read out). */}
        <p role="status" className="sr-only">
          {noResults
            ? `No results for “${trimmed}”${creatable.length ? ". Create it as a page, collection or canvas." : ""}`
            : results.length > 0 && trimmed
              ? `${results.length} ${results.length === 1 ? "result" : "results"}${known === "failed" ? ", titles only" : ""}`
              : ""}
        </p>
        {known === "failed" && results.length > 0 && (
          <p className="r2-search-note">Titles only — text couldn’t be searched just now.</p>
        )}
      </div>
    </>
  );
}

/** The query's occurrences marked — in this overlay only. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : part.text))}
    </>
  );
}
