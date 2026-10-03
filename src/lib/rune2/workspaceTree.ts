import type {
  WorkspaceCanvasSummary,
  WorkspaceCollectionSummary,
  WorkspaceFolderSummary,
  WorkspaceNode,
  WorkspacePageSummary,
} from "@/lib/types";

// The Workspace tree as the Rune 2.0 shell shows it: Pages, Folders,
// Collections and Canvases in the places the writer gave them (migrations
// 024–025, 045; table workspace_nodes). Pure — no reads — so the server loader and tests share it.
// Titles only, never a Page's content. A Collection's Entries are not tree
// items: its own view lists them.

export type WorkspaceTreeNode = {
  /** The object's Workspace node; null only when the tree can't be read (every Page then shown flat). */
  nodeId: string | null;
  kind: "page" | "folder" | "collection" | "canvas";
  /** The Page's, Folder's, Collection's or Canvas's own id — its identity, whatever its place. */
  id: string;
  title: string | null;
  children: WorkspaceTreeNode[];
};

/**
 * Builds the tree from the Project's nodes and objects. The database
 * guarantees one node per object, a Folder parent, no cycles and 1..n
 * sibling order; this only defends the display against a partial read: an
 * object with no node is shown at the end of the top level, and a node whose
 * parent is missing is shown at the top level too. Nothing is ever hidden.
 */
export function buildWorkspaceTree(
  nodes: readonly WorkspaceNode[],
  pages: readonly WorkspacePageSummary[],
  folders: readonly WorkspaceFolderSummary[],
  collections: readonly WorkspaceCollectionSummary[] = [],
  canvases: readonly WorkspaceCanvasSummary[] = []
): WorkspaceTreeNode[] {
  const byId = {
    page: new Map(pages.map((p) => [p.id, p])),
    folder: new Map(folders.map((f) => [f.id, f])),
    collection: new Map(collections.map((c) => [c.id, c])),
    canvas: new Map(canvases.map((c) => [c.id, c])),
  };

  const treeNodes = new Map<string, WorkspaceTreeNode & { parent: string | null; position: number }>();
  for (const n of nodes) {
    const id =
      n.target_type === "page"
        ? n.document_id
        : n.target_type === "folder"
          ? n.folder_id
          : n.target_type === "canvas"
            ? n.canvas_id
            : n.collection_id;
    const target = id ? byId[n.target_type]?.get(id) : undefined;
    if (!id || !target) continue;
    treeNodes.set(n.id, {
      nodeId: n.id,
      kind: n.target_type,
      id,
      title: target.title,
      children: [],
      parent: n.parent_node_id,
      position: n.position,
    });
  }

  const byPosition = (a: { position: number; nodeId: string | null }, b: { position: number; nodeId: string | null }) =>
    a.position - b.position || (a.nodeId ?? "").localeCompare(b.nodeId ?? "");

  const top: (WorkspaceTreeNode & { position: number })[] = [];
  const childLists = new Map<string, (WorkspaceTreeNode & { position: number })[]>();
  for (const node of treeNodes.values()) {
    const parent = node.parent && treeNodes.get(node.parent);
    if (parent && parent.kind === "folder") {
      const list = childLists.get(parent.nodeId!) ?? [];
      list.push(node);
      childLists.set(parent.nodeId!, list);
    } else {
      top.push(node);
    }
  }

  const strip = (list: (WorkspaceTreeNode & { position: number })[], seen: Set<string>): WorkspaceTreeNode[] =>
    list.sort(byPosition).flatMap((node) => {
      if (seen.has(node.nodeId!)) return [];
      seen.add(node.nodeId!);
      return [
        {
          nodeId: node.nodeId,
          kind: node.kind,
          id: node.id,
          title: node.title,
          children: strip(childLists.get(node.nodeId!) ?? [], seen),
        },
      ];
    });

  const tree = strip(top, new Set());

  // Objects with no node (never expected after 024): shown, never lost.
  const placed = new Set([...treeNodes.values()].map((n) => n.id));
  for (const f of folders) {
    if (!placed.has(f.id)) tree.push({ nodeId: null, kind: "folder", id: f.id, title: f.title, children: [] });
  }
  for (const c of collections) {
    if (!placed.has(c.id)) tree.push({ nodeId: null, kind: "collection", id: c.id, title: c.title, children: [] });
  }
  for (const c of canvases) {
    if (!placed.has(c.id)) tree.push({ nodeId: null, kind: "canvas", id: c.id, title: c.title, children: [] });
  }
  for (const p of pages) {
    if (!placed.has(p.id)) tree.push({ nodeId: null, kind: "page", id: p.id, title: p.title, children: [] });
  }
  return tree;
}

/** Every node of the tree, depth first, with its depth (0 = top level) and parent. */
export function walkWorkspaceTree(
  tree: readonly WorkspaceTreeNode[]
): { node: WorkspaceTreeNode; depth: number; parent: WorkspaceTreeNode | null; index: number; siblings: readonly WorkspaceTreeNode[] }[] {
  const out: ReturnType<typeof walkWorkspaceTree> = [];
  const visit = (list: readonly WorkspaceTreeNode[], depth: number, parent: WorkspaceTreeNode | null) =>
    list.forEach((node, index) => {
      out.push({ node, depth, parent, index, siblings: list });
      visit(node.children, depth + 1, node);
    });
  visit(tree, 0, null);
  return out;
}

/**
 * Where a node can move to: the top level (parentNodeId null) and every
 * Folder, except the node itself and — for a Folder — anything inside it.
 * In tree order, with each destination's depth.
 */
export function moveDestinations(
  tree: readonly WorkspaceTreeNode[],
  moving: WorkspaceTreeNode
): { parentNodeId: string | null; folder: WorkspaceTreeNode | null; depth: number }[] {
  const out: ReturnType<typeof moveDestinations> = [{ parentNodeId: null, folder: null, depth: 0 }];
  const visit = (list: readonly WorkspaceTreeNode[], depth: number) =>
    list.forEach((node) => {
      if (node.kind !== "folder" || !node.nodeId || node.nodeId === moving.nodeId) return;
      out.push({ parentNodeId: node.nodeId, folder: node, depth: depth + 1 });
      visit(node.children, depth + 1);
    });
  visit(tree, 0);
  return out;
}

/**
 * The 0-based index to send to moveWorkspaceNode to put `moving` just before
 * or after `target` among `siblings` (the target's siblings, which may include
 * `moving` itself). The server counts siblings without the moving node.
 */
export function indexBeside(
  siblings: readonly WorkspaceTreeNode[],
  moving: WorkspaceTreeNode,
  target: WorkspaceTreeNode,
  side: "before" | "after"
): number {
  const others = siblings.filter((s) => s.nodeId !== moving.nodeId);
  const at = others.findIndex((s) => s.nodeId === target.nodeId);
  return side === "before" ? at : at + 1;
}
