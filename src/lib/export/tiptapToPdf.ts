// Plain lines of a TipTap document, for the Arena's context header
// (ContextSceneHeader). Exports use lib/export/plan.ts and its renderers.

export type TNode = {
  type: string;
  content?: TNode[];
  text?: string;
  marks?: Array<{ type: string }>;
  attrs?: Record<string, unknown>;
};

export type Seg = { text: string; bold: boolean; italic: boolean };

export function collectSegs(node: TNode): Seg[] {
  if (node.type === "text") {
    const bold = node.marks?.some((m) => m.type === "bold") ?? false;
    const italic = node.marks?.some((m) => m.type === "italic") ?? false;
    return [{ text: node.text ?? "", bold, italic }];
  }
  if (node.type === "hardBreak") return [{ text: "\n", bold: false, italic: false }];
  return (node.content ?? []).flatMap(collectSegs);
}

export function tiptapToPlainLines(root: TNode): string[] {
  const lines: string[] = [];

  function walk(node: TNode): void {
    switch (node.type) {
      case "doc":
        for (const child of node.content ?? []) walk(child);
        break;
      case "paragraph": {
        const text = collectSegs(node).map((s) => s.text).join("").trim();
        if (text) lines.push(text);
        break;
      }
      case "heading": {
        const text = collectSegs(node).map((s) => s.text).join("").trim();
        if (text) lines.push(text);
        break;
      }
      case "blockquote":
        for (const child of node.content ?? [])
          if (child.type === "paragraph") {
            const text = collectSegs(child).map((s) => s.text).join("").trim();
            if (text) lines.push(text);
          }
        break;
      case "bulletList":
        for (const item of node.content ?? []) {
          if (item.type !== "listItem") continue;
          const text = (item.content ?? [])
            .flatMap((c) => (c.type === "paragraph" ? collectSegs(c) : []))
            .map((s) => s.text).join("").trim();
          if (text) lines.push(`• ${text}`);
        }
        break;
      case "orderedList": {
        let n = (node.attrs?.start as number) ?? 1;
        for (const item of node.content ?? []) {
          if (item.type !== "listItem") continue;
          const text = (item.content ?? [])
            .flatMap((c) => (c.type === "paragraph" ? collectSegs(c) : []))
            .map((s) => s.text).join("").trim();
          if (text) { lines.push(`${n}. ${text}`); n++; }
        }
        break;
      }
      case "horizontalRule":
        lines.push("—");
        break;
      default:
        for (const child of node.content ?? []) walk(child);
    }
  }

  walk(root);
  return lines;
}
