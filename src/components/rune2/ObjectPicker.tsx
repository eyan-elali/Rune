"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { candidates, type Candidate, type TargetSpec } from "@/lib/rune2/references";
import { useRune2Selection } from "./Rune2Selection";

// Find an existing object to point to: a Relationship's value (an Entry of
// one Collection, a Page, a Scene) or a link from the Inspector (any of
// them). A calm search over the objects the writer already has — by their
// current titles, with a quiet word on where each lives — never a form. It
// only chooses among canonical objects; it never creates, renames or copies
// one. Arrows move, Enter chooses, Escape closes; a multiple choice stays
// open, a single one closes on choosing.

export function ObjectPicker({
  spec,
  chosen,
  multi,
  label,
  exclude,
  onChoose,
  onClear,
  onClose,
  floating = false,
}: {
  spec: TargetSpec;
  /** Ids already chosen (marked; choosing one again un-chooses it). */
  chosen: readonly string[];
  multi: boolean;
  /** What the search is for: "Affiliation", "Link to". */
  label: string;
  /** Ids never offered (the object itself). */
  exclude?: ReadonlySet<string>;
  onChoose: (candidate: Candidate) => void;
  onClear?: () => void;
  onClose: (refocus: boolean) => void;
  /** Place the picker over the page under its anchor (fixed), closing when the page scrolls. */
  floating?: boolean;
}) {
  const { index } = useRune2Selection();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = el?.parentElement;
    if (!floating || !el || !anchor) return;
    const r = anchor.getBoundingClientRect();
    el.style.top = `${r.bottom + 4}px`;
    el.style.left = `${Math.max(8, Math.min(r.left - 6, window.innerWidth - 328))}px`;
    el.style.visibility = "visible";
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close.current(false);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [floating]);

  // Close on a pointer press outside the anchor (its own button toggles it).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const anchor = ref.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node)) close.current(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const all = candidates(index, spec, "", exclude);
  const matches = query.trim() ? candidates(index, spec, query, exclude) : all;
  // Long lists stay quick to scan: the first 60 matches; typing narrows.
  const shown = matches.slice(0, 60);
  const at = Math.min(active, Math.max(shown.length - 1, 0));

  const choose = (c: Candidate) => {
    onChoose(c);
    if (!multi) onClose(true);
  };

  const empty =
    all.length === 0
      ? spec.type === "entry"
        ? "That collection has no entries yet."
        : spec.type === "page"
          ? "No pages yet."
          : spec.type === "scene"
            ? "No scenes yet."
            : "Nothing to link to yet."
      : "Nothing matches.";

  return (
    <div
      ref={ref}
      className="r2-prop-picker r2-object-picker"
      data-floating={floating ? "" : undefined}
      style={floating ? { visibility: "hidden" } : undefined}
    >
      <input
        autoFocus
        className="r2-prop-picker-input"
        placeholder="Find…"
        aria-label={`Find for ${label}`}
        aria-controls={listId}
        aria-activedescendant={shown.length ? `${listId}-${at}` : undefined}
        maxLength={200}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (shown[at]) choose(shown[at]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose(true);
          } else if (e.key === "Tab") {
            onClose(false);
          }
        }}
      />
      <ul id={listId} role="listbox" aria-multiselectable={multi || undefined} className="r2-prop-picker-list">
        {shown.map((c, i) => (
          <li
            key={c.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={chosen.includes(c.id)}
            data-active={i === at || undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => choose(c)}
            onPointerEnter={() => setActive(i)}
          >
            <span className="r2-prop-picker-mark" aria-hidden>
              {chosen.includes(c.id) && <Check size={12} strokeWidth={2} />}
            </span>
            <span className="r2-object-picker-title">{c.title}</span>
            <span className="r2-object-picker-hint">{c.hint}</span>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="r2-prop-picker-empty">{empty}</p>}
      {chosen.length > 0 && onClear && (
        <button
          type="button"
          className="r2-prop-picker-clear"
          onClick={() => {
            onClear();
            onClose(true);
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
