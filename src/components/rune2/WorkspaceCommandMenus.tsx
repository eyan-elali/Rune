"use client";

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { isFallbackView, isSceneView } from "@/lib/rune2/collectionViews";
import { normalizeQuery, searchObjects } from "@/lib/rune2/projectSearch";
import { mentionCandidates, type MentionScope } from "@/lib/rune2/references";
import { matchSlashCommands, type SlashCommand, type ViewEmbedKind } from "@/lib/rune2/workspaceDocument";
import { usePropertyStore } from "./PropertyStore";
import { useReferenceStore } from "./ReferenceStore";
import { useRune2Selection } from "./Rune2Selection";
import { useViewStore } from "./ViewStore";
import {
  applyTextBlock,
  dismissTrigger,
  insertReference,
  insertViewEmbed,
  type ActiveTrigger,
  type TriggerBridge,
} from "@/lib/rune2/workspaceEditorCommands";

// The Workspace editor's two menus, shown only while asked for:
//   "/"  — a short list of writing blocks (Text) and pointers at the story
//          (Story): a reference to an Entry, Page, Scene or Chapter, or an
//          embedded saved View. Typing narrows it.
//   "@"  — a reference: Project Search (lib/rune2/projectSearch.ts) over the
//          Project's Entries, Pages, Scenes and Chapters, by current title,
//          narrowed as the writer types. "/Reference to entry" starts the
//          same search, narrowed to Entries.
// A third, the View picker, follows "/Collection view" or "/Scene view": the
// saved Views to embed, found by name.
//
// Arrows move, Enter (or Tab) chooses, Escape closes and leaves the typed
// text as it is. Nothing is inserted but canonical ids: a reference to a
// target, an embed of a View. No menu is ever shown in manuscript prose.

type Item = { key: string; title: string; hint: string; group?: string; run: () => void };

const SCOPE_LABEL: Record<Exclude<MentionScope, "any">, string> = {
  entry: "Reference to an entry",
  page: "Reference to a page",
  scene: "Reference to a scene",
  chapter: "Reference to a chapter",
};

/** Places a menu (fixed) under a document position, or above it near the window's bottom; follows scrolling. */
function usePlacement(editor: Editor, pos: number | null) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || pos === null) return;
    const place = () => {
      let at: { left: number; top: number; bottom: number };
      try {
        at = editor.view.coordsAtPos(Math.min(pos, editor.state.doc.content.size));
      } catch {
        return;
      }
      const height = el.offsetHeight || 280;
      const below = at.bottom + 4 + height <= window.innerHeight - 8;
      el.style.left = `${Math.max(8, Math.min(at.left - 6, window.innerWidth - el.offsetWidth - 8))}px`;
      el.style.top = `${below ? at.bottom + 4 : Math.max(8, at.top - 4 - height)}px`;
      el.style.visibility = "visible";
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  });
  return ref;
}

export function WorkspaceCommandMenus({
  editor,
  trigger,
  handlers,
  selfId,
}: {
  editor: Editor;
  trigger: ActiveTrigger | null;
  handlers: TriggerBridge;
  /** The document being written: never offered as its own reference. */
  selfId: string;
}) {
  const { index } = useRune2Selection();
  const { available: referable } = useReferenceStore();
  const { available: viewable, sceneAvailable } = useViewStore();
  const [scoped, setScoped] = useState<{ from: number; scope: MentionScope } | null>(null);
  const [picking, setPicking] = useState<{ kind: ViewEmbedKind; pos: number } | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();

  // A new trigger, or a changed query: back to the first item.
  const triggerId = trigger ? `${trigger.char}${trigger.from}:${trigger.query}` : "";
  const [seen, setSeen] = useState(triggerId);
  if (seen !== triggerId) {
    setSeen(triggerId);
    setActive(0);
  }

  const objects = useMemo(() => searchObjects(index), [index]);
  const exclude = useMemo(() => new Set([selfId]), [selfId]);

  const runSlash = useCallback(
    (command: SlashCommand, t: ActiveTrigger) => {
      const range = { from: t.from, to: t.to };
      const action = command.action;
      if (action.kind === "reference") {
        // The same "@" search, narrowed: the "@" goes where the "/" was.
        editor.chain().focus().deleteRange(range).insertContent("@").run();
        setScoped({ from: t.from, scope: action.scope });
      } else if (action.kind === "embed") {
        // No editor focus here: the View picker's search takes it (TipTap's
        // focus() lands a frame later and would take it back).
        editor.chain().deleteRange(range).run();
        setPicking({ kind: action.view, pos: editor.state.selection.from });
      } else {
        applyTextBlock(editor, range, action.block);
      }
    },
    [editor]
  );

  let items: Item[] = [];
  let heading: string | null = null;
  let empty = "Nothing matches.";
  if (trigger?.char === "/") {
    items = matchSlashCommands(trigger.query, (c) =>
      c.action.kind === "reference"
        ? referable
        : c.action.kind === "embed"
          ? c.action.view === "scene"
            ? sceneAvailable
            : viewable
          : true,
    ).map((c) => ({ key: c.id, title: c.label, hint: "", group: c.group, run: () => runSlash(c, trigger) }));
  } else if (trigger?.char === "@" && referable) {
    const scope: MentionScope = scoped?.from === trigger.from ? scoped.scope : "any";
    if (scope !== "any") heading = SCOPE_LABEL[scope];
    empty = trigger.query.trim() ? "Nothing matches." : "Nothing to reference yet.";
    // Long lists stay quick to scan: the first 50; typing narrows.
    items = mentionCandidates(index, scope, trigger.query, exclude, objects)
      .slice(0, 50)
      .map((c) => ({
        key: `${c.type}:${c.id}`,
        title: c.title,
        hint: c.hint,
        run: () => void insertReference(editor, { from: trigger.from, to: trigger.to }, c),
      }));
  }
  const open = trigger !== null && (trigger.char === "/" || referable);
  const at = Math.min(active, Math.max(items.length - 1, 0));

  // Keys go to the menu while it is open; everything else stays the editor's.
  useEffect(() => {
    handlers.bind({
      onKey: (event) => {
        if (!open || !trigger) return false;
        if (event.key === "Escape") {
          editor.view.dispatch(dismissTrigger(editor.state, trigger));
          return true;
        }
        if (items.length === 0) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1;
          setActive((a) => (Math.min(a, items.length - 1) + step + items.length) % items.length);
          return true;
        }
        if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
          items[at]?.run();
          return true;
        }
        return false;
      },
    });
  });

  // The editor names the menu it controls and its active option, for assistive technology.
  const activeId = open && items.length ? `${listId}-${at}` : null;
  useEffect(() => {
    const dom = editor.view.dom;
    if (activeId) {
      dom.setAttribute("aria-controls", listId);
      dom.setAttribute("aria-activedescendant", activeId);
    } else {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-activedescendant");
    }
  }, [editor, activeId, listId]);

  return (
    <>
      {open && trigger && (
        <MenuList
          editor={editor}
          pos={trigger.from}
          listId={listId}
          label={trigger.char === "/" ? "Insert" : (heading ?? "Reference")}
          heading={heading}
          items={items}
          active={at}
          empty={empty}
          onHover={setActive}
        />
      )}
      {picking && (
        <ViewPicker
          editor={editor}
          kind={picking.kind}
          pos={picking.pos}
          onClose={() => {
            setPicking(null);
            // Back to the writing at once (TipTap's focus() waits for a frame).
            editor.view.focus();
          }}
        />
      )}
    </>
  );
}

function MenuList({
  editor,
  pos,
  listId,
  label,
  heading,
  items,
  active,
  empty,
  onHover,
}: {
  editor: Editor;
  pos: number;
  listId: string;
  label: string;
  heading: string | null;
  items: Item[];
  active: number;
  empty: string;
  onHover: (at: number) => void;
}) {
  const ref = usePlacement(editor, pos);
  useEffect(() => {
    ref.current?.querySelector(`[id="${listId}-${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ref, listId, active]);
  return (
    <div
      ref={ref}
      className="r2-prop-picker r2-object-picker r2-command-menu"
      data-floating=""
      style={{ visibility: "hidden" }}
      // The editor keeps focus: pressing in the menu never blurs it.
      onPointerDown={(e) => e.preventDefault()}
    >
      {heading && <p className="r2-command-menu-head">{heading}</p>}
      <ul id={listId} role="listbox" aria-label={label} className="r2-prop-picker-list">
        {items.map((item, i) => (
          <Fragment key={item.key}>
            {item.group && item.group !== items[i - 1]?.group && (
              <li role="presentation" className="r2-command-menu-group">
                {item.group}
              </li>
            )}
            <li
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-active={i === active || undefined}
              onClick={() => item.run()}
              onPointerEnter={() => onHover(i)}
            >
              <span className="r2-object-picker-title">{item.title}</span>
              {item.hint && <span className="r2-object-picker-hint">{item.hint}</span>}
            </li>
          </Fragment>
        ))}
      </ul>
      {items.length === 0 && <p className="r2-prop-picker-empty">{empty}</p>}
    </div>
  );
}

type ViewChoice = { key: string; title: string; hint: string; choose: () => Promise<string | null> };

/**
 * The saved Views a document can embed, found by name: every Collection's
 * (in the navigator's order) or the Manuscript's Scene Views. A Manuscript
 * with no saved Scene View offers its "Manuscript order" list, saved as a
 * View when chosen — an embed always points at a real, saved View.
 */
function ViewPicker({
  editor,
  kind,
  pos,
  onClose,
}: {
  editor: Editor;
  kind: ViewEmbedKind;
  pos: number;
  onClose: () => void;
}) {
  const { index } = useRune2Selection();
  const { manuscriptId } = usePropertyStore();
  const { savedViews, viewsOf, createViewWithId } = useViewStore();
  const ref = usePlacement(editor, pos);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // The search takes the keyboard once the picker is placed: it is hidden
  // until then, and a hidden field can't take focus (so no autoFocus).
  // Declared after usePlacement, so this layout effect runs after its.
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus();
  }, []);

  // Close on a press outside.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close.current();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [ref]);

  const embed = (viewId: string) => insertViewEmbed(editor, pos, { viewKind: kind, viewId });

  let choices: ViewChoice[];
  if (kind === "collection") {
    const order = new Map(
      [...index.values()].filter((e) => e.kind === "workspaceCollection").map((c, at) => [c.id, at] as const),
    );
    choices = savedViews
      .flatMap((v) => (isSceneView(v) || !order.has(v.collection_id) ? [] : [v]))
      .sort((a, b) => order.get(a.collection_id)! - order.get(b.collection_id)! || a.position - b.position)
      .map((v) => ({
        key: v.id,
        title: v.name,
        hint: index.get(v.collection_id)?.title ?? "",
        choose: async () => {
          embed(v.id);
          return null;
        },
      }));
  } else if (manuscriptId) {
    const scenes = viewsOf(manuscriptId);
    choices = scenes.map((v) => ({
      key: v.id,
      title: v.name,
      hint: "Scenes",
      choose: async () => {
        let viewId = v.id;
        if (isFallbackView(v)) {
          const r = await createViewWithId(manuscriptId, v.type, v.name, v.config);
          if (r.error !== null) return "That view couldn’t be saved.";
          viewId = r.id;
        }
        embed(viewId);
        return null;
      },
    }));
  } else {
    choices = [];
  }
  const q = normalizeQuery(query);
  const shown = q ? choices.filter((c) => normalizeQuery(`${c.title} ${c.hint}`).includes(q)) : choices;
  const at = Math.min(active, Math.max(shown.length - 1, 0));

  const choose = async (choice: ViewChoice | undefined) => {
    if (!choice) return;
    const error = await choice.choose();
    if (error) setNotice(error);
    else onClose();
  };

  return (
    <div
      ref={ref}
      className="r2-prop-picker r2-object-picker r2-command-menu"
      data-floating=""
      style={{ visibility: "hidden" }}
    >
      <p className="r2-command-menu-head">{kind === "collection" ? "Embed a collection view" : "Embed a scene view"}</p>
      <input
        ref={input}
        className="r2-prop-picker-input"
        placeholder="Find a view…"
        aria-label="Find a view to embed"
        aria-controls={listId}
        aria-activedescendant={shown.length ? `${listId}-${at}` : undefined}
        maxLength={200}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((a) => (Math.min(a, shown.length - 1) + step + shown.length) % Math.max(shown.length, 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            void choose(shown[at]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <ul id={listId} role="listbox" aria-label="Views" className="r2-prop-picker-list">
        {shown.map((c, i) => (
          <li
            key={c.key}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === at}
            data-active={i === at || undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => void choose(c)}
            onPointerEnter={() => setActive(i)}
          >
            <span className="r2-object-picker-title">{c.title}</span>
            <span className="r2-object-picker-hint">{c.hint}</span>
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="r2-prop-picker-empty">
          {choices.length === 0
            ? kind === "collection"
              ? "No collections yet."
              : "No scenes yet."
            : "Nothing matches."}
        </p>
      )}
      {notice && (
        <p role="status" className="r2-prop-picker-empty">
          {notice}
        </p>
      )}
    </div>
  );
}
