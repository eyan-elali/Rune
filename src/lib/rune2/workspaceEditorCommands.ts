import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import {
  ASIDE_NODE,
  findTrigger,
  REFERENCE_NODE,
  VIEW_EMBED_NODE,
  type ReferenceTargetType,
  type SlashAction,
  type TriggerChar,
  type ViewEmbedKind,
} from "./workspaceDocument";

// What the Workspace editor does when the writer asks — without React, so the
// editor and the tests run the same code against the same schema
// (workspaceEditorSchema.ts): the "/" and "@" triggers (a ProseMirror
// plugin reporting what is being typed), and the edits a menu choice makes —
// a text block, an inline reference, a View embed. Each inserts only
// canonical ids; none touches anything outside the document.

/** "/" or "@" being typed at the cursor: the trigger character's position, the cursor's, and the query between. */
export type ActiveTrigger = { char: TriggerChar; query: string; from: number; to: number };

type TriggerPluginState = { dismissedAt: number | null };

export const triggerKey = new PluginKey<TriggerPluginState>("workspaceTrigger");

/** The trigger at the cursor in `state`, or null (a selection, code, one the writer dismissed). */
export function readTrigger(state: EditorState): ActiveTrigger | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  // One character per position: an inline atom (a reference) reads as U+FFFC.
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const found = findTrigger(text);
  if (!found) return null;
  const from = $from.start() + found.offset;
  if (triggerKey.getState(state)?.dismissedAt === from) return null;
  return { char: found.char, query: found.query, from, to: selection.from };
}

/** What the editor hands its menus: the trigger as it changes, and keys while one is open. */
export type TriggerHandlers = {
  onTrigger: (trigger: ActiveTrigger | null) => void;
  /** A key pressed while a trigger is open; true: the menu used it. */
  onKey: (event: KeyboardEvent) => boolean;
  /** Enter on a selected reference: open it. */
  onOpenReference: (targetId: string, newTab: boolean) => void;
};

/**
 * Between the editor (built once) and the React components around it: the
 * plugin calls through it, and the components bind their current handlers.
 */
export class TriggerBridge {
  private handlers: TriggerHandlers = {
    onTrigger: () => undefined,
    onKey: () => false,
    onOpenReference: () => undefined,
  };
  bind(handlers: Partial<TriggerHandlers>) {
    Object.assign(this.handlers, handlers);
  }
  get current(): TriggerHandlers {
    return this.handlers;
  }
}

/** The "/" and "@" triggers, and Enter on a selected reference, reported through `handlers`. */
export function triggerExtension(handlers: TriggerBridge) {
  return Extension.create({
    name: "workspaceTrigger",
    addProseMirrorPlugins() {
      return [
        new Plugin<TriggerPluginState>({
          key: triggerKey,
          state: {
            init: (): TriggerPluginState => ({ dismissedAt: null }),
            apply(tr, value): TriggerPluginState {
              const meta = tr.getMeta(triggerKey) as number | null | undefined;
              if (meta !== undefined) return { dismissedAt: meta };
              if (tr.docChanged && value.dismissedAt !== null) return { dismissedAt: tr.mapping.map(value.dismissedAt) };
              return value;
            },
          },
          view: () => ({
            update: (view) => handlers.current.onTrigger(view.editable ? readTrigger(view.state) : null),
            destroy: () => handlers.current.onTrigger(null),
          }),
          props: {
            handleKeyDown: (view, event) => (readTrigger(view.state) ? handlers.current.onKey(event) : false),
          },
        }),
      ];
    },
    addKeyboardShortcuts() {
      const open = (newTab: boolean) => {
        const { selection } = this.editor.state;
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== REFERENCE_NODE) return false;
        const id = selection.node.attrs.targetId;
        if (typeof id !== "string") return false;
        handlers.current.onOpenReference(id, newTab);
        return true;
      };
      return { Enter: () => open(false), "Mod-Enter": () => open(true) };
    },
  });
}

/** Closes the open trigger until something else is typed there. */
export function dismissTrigger(state: EditorState, trigger: ActiveTrigger) {
  return state.tr.setMeta(triggerKey, trigger.from);
}

type Range = { from: number; to: number };

/** Replaces the typed "/…" with a text block (or turns the line into one). */
export function applyTextBlock(editor: Editor, range: Range, block: Extract<SlashAction, { kind: "block" }>["block"]): boolean {
  const chain = editor.chain().focus().deleteRange(range);
  switch (block) {
    case "heading2":
      return chain.setNode("heading", { level: 2 }).run();
    case "heading3":
      return chain.setNode("heading", { level: 3 }).run();
    case "bulletList":
      return chain.toggleBulletList().run();
    case "orderedList":
      return chain.toggleOrderedList().run();
    case "taskList":
      return chain.toggleTaskList().run();
    case "blockquote":
      return chain.toggleBlockquote().run();
    case "aside":
      return chain.toggleWrap(ASIDE_NODE).run();
    case "divider":
      return chain.setHorizontalRule().run();
  }
}

/** Replaces the typed "@…" with a reference to `target` (and a space after it). */
export function insertReference(
  editor: Editor,
  range: Range,
  target: { type: ReferenceTargetType; id: string; title: string }
): boolean {
  return editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent([
      { type: REFERENCE_NODE, attrs: { targetType: target.type, targetId: target.id, label: target.title } },
      { type: "text", text: " " },
    ])
    .run();
}

/**
 * Inserts a View embed as its own block where the cursor was — replacing an
 * empty line, else after the block the cursor is in — with a line after it
 * to write on.
 */
export function insertViewEmbed(editor: Editor, pos: number, attrs: { viewKind: ViewEmbedKind; viewId: string }) {
  const { state } = editor;
  const schema = state.schema;
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  const embed = schema.nodes[VIEW_EMBED_NODE].create(attrs);
  const top = $pos.depth >= 1 ? $pos.node(1) : null;
  const replaceEmpty = !!top && top.isTextblock && top.content.size === 0;
  const from = top ? (replaceEmpty ? $pos.before(1) : $pos.after(1)) : $pos.pos;
  const to = replaceEmpty ? $pos.after(1) : from;
  const next = state.doc.resolve(to).nodeAfter;
  const nodes = next?.isTextblock ? [embed] : [embed, schema.nodes.paragraph.create()];
  const tr = state.tr.replaceWith(from, to, nodes);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from + embed.nodeSize + 1, tr.doc.content.size))));
  editor.view.dispatch(tr.scrollIntoView());
  if (editor.isInitialized) editor.view.focus();
}
