"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Search } from "lucide-react";
import { ICON } from "./icons";
import { searchProjectContent } from "@/lib/actions/projectSearch";
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

const SHOWN = 50;
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
  const { index, manuscript, select, openInNewTab, setOpenFor, navCollapsed, toggleNav, requestCanvasFocus } = useRune2Selection();
  const projectId = manuscript.project.id;
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Text matches by query, for this opening of search only (text changes).
  const [inText, setInText] = useState<Record<string, ContentMatch[] | "failed">>({});
  // Where focus was when search opened (read before the input takes it).
  const [returnFocus] = useState(() => document.activeElement);

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
  const at = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    document.getElementById(`${listId}-${at}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, at, results]);

  const dismiss = () => {
    const el = returnFocus;
    onClose();
    if (el instanceof HTMLElement && el.isConnected) requestAnimationFrame(() => el.focus());
  };

  const open = (r: SearchResult, newTab: boolean) => {
    onClose();
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
      if (newTab) openInNewTab(r.canvasId);
      else select(r.canvasId);
      return;
    }
    if (newTab) openInNewTab(r.id);
    else select(r.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(at + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(at - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[at]) open(results[at], e.metaKey || e.ctrlKey);
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

  return (
    <>
      <div className="r2-search-scrim" aria-hidden onPointerDown={dismiss} />
      <div role="dialog" aria-modal="true" aria-label="Search this project" className="r2-search">
        <div className="r2-search-field">
          <Search {...ICON} aria-hidden className="r2-search-icon" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results.length ? `${listId}-${at}` : undefined}
            aria-label="Search this project"
            placeholder="Search this project"
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
