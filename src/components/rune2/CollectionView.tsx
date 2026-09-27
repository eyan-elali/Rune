"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createCollectionEntry, renameWorkspaceCollection } from "@/lib/actions/workspaceCollections";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import { useRune2Selection } from "./Rune2Selection";
import { WorkspaceTitle } from "./WorkspaceTitle";

// A Collection in the content area: its title, edited in place, and its
// Entries as a plain list in creation order — a writer's list of names, not a
// table. No properties, no columns, no views yet (architecture §12–13, §17):
// what this view has to prove is that a Collection reads like Rune before any
// structure is added to it.
//
// A click opens an Entry in the active tab (the Entry's own line back to its
// Collection returns here); ⌘/Ctrl-click opens it in a tab of its own. "New
// entry" creates an untitled Entry at the end and opens it with its title
// ready to type, as a new Page opens.

/**
 * Creates an Entry at the end of a Collection and opens it, title first.
 * Returns the action and whether it is running; failures show in `notice`.
 */
function useNewEntry(collectionId: string) {
  const { selectWhenPresent, requestSceneFocus } = useRune2Selection();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function add() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await createCollectionEntry(collectionId, null);
      if (r.error !== null) {
        setNotice("Couldn’t create the entry.");
        return;
      }
      selectWhenPresent(r.data.id);
      requestSceneFocus(r.data.id);
    } catch {
      setNotice("Couldn’t create the entry.");
    } finally {
      setBusy(false);
      startRefresh(() => router.refresh());
    }
  }

  return { add, busy, notice };
}

export function CollectionView({ entry }: { entry: NavEntry }) {
  const { index, select, openInNewTab } = useRune2Selection();
  const { add, busy, notice } = useNewEntry(entry.id);
  const listRef = useRef<HTMLDivElement>(null);
  const entries = (entry.entryIds ?? []).flatMap((id) => {
    const e = index.get(id);
    return e ? [e] : [];
  });

  return (
    <div className="r2-writing">
      <div className="r2-doc r2-page r2-collection">
        <WorkspaceTitle
          entry={entry}
          rename={renameWorkspaceCollection}
          noun="collection"
          placeholder="Untitled collection"
          // Out of the title: to the first Entry, or to "New entry".
          onLeave={() => listRef.current?.querySelector<HTMLElement>("button")?.focus()}
        />

        <div ref={listRef}>
          {entries.length > 0 ? (
            <ul className="r2-entry-list" aria-label={`Entries in ${entry.title}`}>
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="r2-entry-row"
                    data-unnamed={!e.named || undefined}
                    onClick={(ev) => (ev.metaKey || ev.ctrlKey ? openInNewTab(e.id) : select(e.id))}
                    onAuxClick={(ev) => {
                      if (ev.button === 1) {
                        ev.preventDefault();
                        openInNewTab(e.id);
                      }
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
                      const li = ev.currentTarget.parentElement;
                      const next = ev.key === "ArrowDown" ? li?.nextElementSibling : li?.previousElementSibling;
                      const target = next?.querySelector<HTMLElement>("button");
                      if (target) {
                        ev.preventDefault();
                        target.focus();
                      }
                    }}
                  >
                    {e.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="r2-entry-empty">No entries yet.</p>
          )}

          <button type="button" className="r2-entry-add" disabled={busy} onClick={() => void add()}>
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            New entry
          </button>
          {notice && (
            <p role="status" className="r2-doc-note">
              {notice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** "+ Entry" in the context bar while an Entry is open: another Entry in the same Collection. */
export function NewEntryAction({ collectionId }: { collectionId: string }) {
  const { index } = useRune2Selection();
  const { add, busy, notice } = useNewEntry(collectionId);
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
        title={`Add an entry to ${index.get(collectionId)?.title ?? "this collection"}`}
      >
        <Plus size={14} strokeWidth={1.75} aria-hidden />
        Entry
      </button>
    </>
  );
}
