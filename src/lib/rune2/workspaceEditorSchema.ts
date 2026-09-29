import { mergeAttributes, Node, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { ASIDE_NODE, REFERENCE_NODE, VIEW_EMBED_NODE } from "./workspaceDocument";

// The one document schema of Workspace rich text — a Workspace Page and a
// Collection Entry body alike — without any presentation, so the editor, the
// tests and anything that reads stored Workspace JSON parse it identically.
// The editor (components/rune2/WorkspaceEditorKit.tsx) adds node views and
// the "/" and "@" menus on top; it never adds a node type of its own.
//
// Manuscript prose never uses this: the Scene editor keeps its own
// StarterKit configuration, with none of these nodes.

/** An inline pointer at an Entry, Page, Scene or Chapter, by canonical id. */
export const ReferenceNode = Node.create({
  name: REFERENCE_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      targetType: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-target-type"),
        renderHTML: (attrs) => ({ "data-target-type": attrs.targetType }),
      },
      targetId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-target-id"),
        renderHTML: (attrs) => ({ "data-target-id": attrs.targetId }),
      },
      /** The title when inserted — shown only if the target is gone. */
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? el.textContent ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-reference]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-reference": "", class: "r2-ref" }, HTMLAttributes), node.attrs.label || "Untitled"];
  },

  renderText({ node }) {
    return node.attrs.label || "";
  },
});

/** A saved View shown in place — by its id only; nothing of the View is copied. */
export const ViewEmbedNode = Node.create({
  name: VIEW_EMBED_NODE,
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  isolating: true,

  addAttributes() {
    return {
      viewKind: {
        default: "collection",
        parseHTML: (el) => el.getAttribute("data-view-kind"),
        renderHTML: (attrs) => ({ "data-view-kind": attrs.viewKind }),
      },
      viewId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-view-id"),
        renderHTML: (attrs) => ({ "data-view-id": attrs.viewId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-view-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-view-embed": "" }, HTMLAttributes)];
  },

  renderText() {
    return "";
  },
});

/** A quiet aside beside the main text: a note to self, a caution, a margin remark. */
export const AsideNode = Node.create({
  name: ASIDE_NODE,
  group: "block",
  content: "paragraph+",
  defining: true,

  parseHTML() {
    return [{ tag: "aside" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes({ class: "r2-aside" }, HTMLAttributes), 0];
  },
});

/**
 * Every Workspace rich-text extension: StarterKit exactly as Workspace Pages
 * have used it since Milestone 6 (so every stored document still parses),
 * plus a checklist, the aside, references and View embeds.
 */
export function workspaceSchemaExtensions(): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    AsideNode,
    ReferenceNode,
    ViewEmbedNode,
  ];
}
