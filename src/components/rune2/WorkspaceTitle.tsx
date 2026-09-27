"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import { useRune2Selection } from "./Rune2Selection";

const TITLE_SAVE_DELAY = 700;

/**
 * A Workspace object's title, edited in place — a Page's, an Entry's or a
 * Collection's (`rename` is the object's own action). The navigator and tabs
 * follow each keystroke (setRenamedTitle); the title is saved after a pause
 * and when the writer leaves the field. Blank is untitled. Enter or ↓ leaves
 * the title (onLeave: into the body, or the Collection's list).
 */
export function WorkspaceTitle({
  entry,
  rename,
  noun,
  placeholder = "Untitled",
  onLeave,
}: {
  entry: NavEntry;
  rename: (id: string, title: string | null) => Promise<{ error: string | null }>;
  noun: string;
  placeholder?: string;
  onLeave: () => void;
}) {
  const { setRenamedTitle, focusSceneId, requestSceneFocus } = useRune2Selection();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const stored = entry.named ? entry.title : "";
  const [value, setValue] = useState(stored);
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const saved = useRef(stored);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Renamed elsewhere (the navigator) while not being edited here: follow it.
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    if (!editing) setValue(stored);
  }
  useEffect(() => {
    if (!editing) saved.current = stored;
  }, [stored, editing]);

  // A Page just created: name it first.
  useEffect(() => {
    if (focusSceneId !== entry.id) return;
    ref.current?.focus();
    requestSceneFocus(null);
  }, [focusSceneId, entry.id, requestSceneFocus]);

  // Grow with the title, never scroll inside it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function save(next: string, refresh: boolean) {
    clearTimeout(timer.current);
    const title = next.trim();
    if (title === saved.current) {
      if (refresh) startRefresh(() => router.refresh());
      return;
    }
    saved.current = title;
    const r = await rename(entry.id, title || null).catch(() => ({ error: "Network error" }));
    setFailed(Boolean(r.error));
    if (r.error) saved.current = "";
    if (refresh) startRefresh(() => router.refresh());
  }

  return (
    <header className="r2-doc-head r2-page-head">
      <textarea
        ref={ref}
        className="r2-page-title"
        aria-label={`${noun[0].toUpperCase()}${noun.slice(1)} title`}
        placeholder={placeholder}
        rows={1}
        maxLength={200}
        spellCheck
        value={value}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          const next = e.target.value.replace(/\n/g, " ");
          setValue(next);
          setRenamedTitle(entry.id, next.trim());
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(next, false), TITLE_SAVE_DELAY);
        }}
        onBlur={() => {
          setEditing(false);
          void save(value, true);
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
          if (e.key === "Enter" || (e.key === "ArrowDown" && atEnd)) {
            e.preventDefault();
            onLeave();
          }
        }}
      />
      {failed && (
        <p className="r2-doc-note" role="status">
          The title couldn’t be saved yet. It will be tried again when you leave the title.
        </p>
      )}
    </header>
  );
}
