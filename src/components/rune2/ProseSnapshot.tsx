import type { ReactNode } from "react";

// Scene prose as it was, read-only: a Scene's TipTap JSON (the StarterKit
// schema the Scene editor writes) rendered straight to elements, with the
// manuscript's own typography (.r2-prose). No editor instance, nothing
// editable, no links followed: an earlier text is something to read. A node
// type this renderer doesn't know still shows its text.

type ProseNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type?: string }[];
  content?: ProseNode[];
};

function children(node: ProseNode): ReactNode {
  return (node.content ?? []).map((child, i) => render(child, i));
}

function withMarks(text: string, marks: ProseNode["marks"]): ReactNode {
  return (marks ?? []).reduce<ReactNode>((inner, mark) => {
    switch (mark.type) {
      case "bold":
        return <strong>{inner}</strong>;
      case "italic":
        return <em>{inner}</em>;
      case "strike":
        return <s>{inner}</s>;
      case "underline":
        return <u>{inner}</u>;
      case "code":
        return <code>{inner}</code>;
      default:
        return inner;
    }
  }, text);
}

function render(node: ProseNode, key: number): ReactNode {
  switch (node.type) {
    case "text":
      return <span key={key}>{withMarks(node.text ?? "", node.marks)}</span>;
    case "paragraph":
      return <p key={key}>{children(node)}</p>;
    case "heading": {
      const level = node.attrs?.level;
      if (level === 1) return <h1 key={key}>{children(node)}</h1>;
      if (level === 2) return <h2 key={key}>{children(node)}</h2>;
      return <h3 key={key}>{children(node)}</h3>;
    }
    case "blockquote":
      return <blockquote key={key}>{children(node)}</blockquote>;
    case "bulletList":
      return <ul key={key}>{children(node)}</ul>;
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : undefined;
      return (
        <ol key={key} start={start}>
          {children(node)}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{children(node)}</li>;
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children(node)}</code>
        </pre>
      );
    default:
      return node.content ? <div key={key}>{children(node)}</div> : null;
  }
}

/** True when a Scene document holds any text at all. */
export function proseHasText(content: unknown): boolean {
  const walk = (node: ProseNode): boolean =>
    node.type === "text" ? (node.text ?? "").trim().length > 0 : (node.content ?? []).some(walk);
  return !!content && typeof content === "object" && walk(content as ProseNode);
}

export function ProseSnapshot({ content, empty }: { content: unknown; empty: ReactNode }) {
  if (!proseHasText(content)) return <p className="r2-snapshot-empty">{empty}</p>;
  return (
    <div className="r2-prose r2-snapshot">
      <div className="ProseMirror">{children(content as ProseNode)}</div>
    </div>
  );
}
