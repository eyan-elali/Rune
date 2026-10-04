"use client";

import type { Extensions } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { describeTarget } from "@/lib/rune2/references";
import { isReferenceTargetType, REFERENCE_NODE, VIEW_EMBED_NODE, type ViewEmbedKind } from "@/lib/rune2/workspaceDocument";
import { triggerExtension, type TriggerBridge } from "@/lib/rune2/workspaceEditorCommands";
import { ReferenceNode, ViewEmbedNode, workspaceSchemaExtensions } from "@/lib/rune2/workspaceEditorSchema";
import { EmbeddedView } from "./EmbeddedView";
import { useRune2Selection } from "./Rune2Selection";
import { useOpenObject } from "./useOpenObject";

// The Workspace rich-text editor's moving parts, shared by every Workspace
// Page and Collection Entry body (there is one editor, WorkspacePageEditor):
// the document schema (lib/rune2/workspaceEditorSchema.ts) with its
// presentation — a reference as a live title that opens its object, a View
// embed as the View itself — and the "/" and "@" triggers
// (lib/rune2/workspaceEditorCommands.ts) the command menus
// (WorkspaceCommandMenus.tsx) listen to. The manuscript editor uses none of it.
//
// Progressive disclosure: nothing here is on screen until the writer asks. A
// blank Page is a blank Page; a menu exists only while "/" or "@" is typed.

/**
 * The editor's extensions: exactly the Workspace schema, its nodes given
 * their presentation, a placeholder, and the triggers.
 */
export function workspaceEditorExtensions(handlers: TriggerBridge, placeholder: string): Extensions {
  return [
    ...workspaceSchemaExtensions().map((extension) =>
      extension.name === REFERENCE_NODE
        ? ReferenceNode.extend({ addNodeView: () => ReactNodeViewRenderer(ReferenceView) })
        : extension.name === VIEW_EMBED_NODE
          ? ViewEmbedNode.extend({
              addNodeView: () =>
                ReactNodeViewRenderer(ViewEmbedView, {
                  // The View inside is its own interface (open, sort columns, move
                  // cards): its events are never the document's.
                  stopEvent: ({ event }) => !!(event.target as Element | null)?.closest?.("[data-embed-body]"),
                }),
            })
          : extension
    ),
    Placeholder.configure({
      placeholder,
      emptyEditorClass: "is-editor-empty",
      emptyNodeClass: "is-empty",
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
    }),
    triggerExtension(handlers),
  ];
}

// ── Node views ──────────────────────────────────────────────────────────────

/**
 * An inline reference: the target's CURRENT title (a rename shows at once),
 * opening it as the navigator would — a Chapter's only Scene as its Chapter,
 * ⌘/Ctrl-click in a tab of its own. A target that is gone (in Trash, deleted)
 * shows the label it had, quietly marked, and is left exactly as written.
 */
function ReferenceView({ node, selected }: NodeViewProps) {
  const { index } = useRune2Selection();
  const openObject = useOpenObject();
  const { targetType, targetId, label } = node.attrs as { targetType: unknown; targetId: unknown; label: string };
  const target =
    isReferenceTargetType(targetType) && typeof targetId === "string" ? { type: targetType, id: targetId } : null;
  const described = target && describeTarget(index, target);

  return (
    <NodeViewWrapper as="span" className="r2-ref" contentEditable={false} data-selected={selected || undefined}>
      {target && described ? (
        <button type="button" className="r2-ref-link" title={described.hint} {...openObject(target.id)}>
          {described.title}
        </button>
      ) : (
        <span className="r2-ref-missing" title="Not available — in Trash, or deleted">
          {label || "Unavailable"}
        </span>
      )}
    </NodeViewWrapper>
  );
}

/** A saved View in place: the View itself, never a copy of it. */
function ViewEmbedView({ node, selected, deleteNode, editor }: NodeViewProps) {
  const { viewKind, viewId } = node.attrs as { viewKind: ViewEmbedKind; viewId: string | null };
  return (
    <NodeViewWrapper className="r2-embed" contentEditable={false} data-selected={selected || undefined}>
      <EmbeddedView viewId={viewId} kind={viewKind} onRemove={editor.isEditable ? deleteNode : undefined} />
    </NodeViewWrapper>
  );
}
