import type { ReferenceObjectType } from "@/lib/types";

// What a Workspace document (a Page or a Collection Entry body) may hold
// beyond text, and the rules the editor, the reference store and the tests
// share. Pure — no I/O, no TipTap — so the same rules run anywhere.
//
// A block is one of three things: text (paragraphs, headings, lists, a
// checklist, a quote, a divider, an aside), a pointer at the story (an inline
// reference to an Entry, Page, Scene or Chapter; an embedded saved View), or
// — later — media. Never a general block catalogue, and never in manuscript
// prose: the Scene editor has none of this.
//
// Stored as TipTap JSON in the document's own content, saved by its own
// PageSaver exactly as before:
//   { "type": "reference", "attrs": { "targetType", "targetId", "label" } }
//   { "type": "viewEmbed", "attrs": { "viewKind": "collection" | "scene", "viewId" } }
// Every target is a canonical id; `label` is only the title when inserted,
// shown if the target is ever gone (architecture §28: the sentence survives).
// Migration 035 derives the document's inline references from this JSON on
// every save, with the same reading as inlineReferences below.

export const REFERENCE_NODE = "reference";
export const VIEW_EMBED_NODE = "viewEmbed";
export const ASIDE_NODE = "aside";

/** What an inline reference can point at: an Entry, a Page, a Scene, or a Chapter. */
export type ReferenceTargetType = ReferenceObjectType | "chapter";
export const REFERENCE_TARGET_TYPES: readonly ReferenceTargetType[] = ["entry", "page", "scene", "chapter"];

export type InlineTarget = { type: ReferenceTargetType; id: string };

export type ViewEmbedKind = "collection" | "scene";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReferenceTargetType(value: unknown): value is ReferenceTargetType {
  return typeof value === "string" && (REFERENCE_TARGET_TYPES as readonly string[]).includes(value);
}

type JsonNode = { type?: unknown; attrs?: Record<string, unknown> | null; content?: unknown };

/**
 * A document's inline references, once each, in order of first appearance —
 * exactly what migration 035's trigger reads: nodes of type "reference" with a
 * known target type and a well-formed id, never the document itself
 * (`self`). Anything malformed is skipped, never repaired.
 */
export function inlineReferences(doc: unknown, self?: InlineTarget | { type: string; id: string }): InlineTarget[] {
  const out: InlineTarget[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const n = node as JsonNode;
    if (n.type === REFERENCE_NODE && n.attrs) {
      const type = n.attrs.targetType;
      const id = typeof n.attrs.targetId === "string" ? n.attrs.targetId.toLowerCase() : null;
      if (isReferenceTargetType(type) && id && UUID.test(id) && !(self && self.type === type && self.id === id)) {
        const key = `${type}:${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ type, id });
        }
      }
    }
    // Every value is walked (as `$.**` does), not only `content`.
    for (const value of Object.values(n)) if (typeof value === "object" && value !== null) visit(value);
  };
  visit(doc);
  return out;
}

/**
 * A document as plain JSON, to send to the server. ProseMirror builds every
 * node's `attrs` as an object without a prototype, and a server action never
 * carries such an object: it arrives as an opaque reference and is stored as
 * nothing — so a heading's level, a checklist's ticks, a reference's target
 * and an embed's View would all be lost. A JSON round trip gives ordinary
 * objects with exactly the same data.
 */
export function toPlainDocument<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc)) as T;
}

/** Whether two ordered target lists are the same. */
export function sameTargets(a: readonly InlineTarget[], b: readonly InlineTarget[]): boolean {
  return a.length === b.length && a.every((t, i) => t.type === b[i].type && t.id === b[i].id);
}

/**
 * Whether the editor's content check failed because the document holds a
 * node or mark type this editor doesn't know — written by a newer Rune — so
 * loading it would drop that part. Every other check failure (an empty
 * document, a loose structure) loads leniently, as it always has.
 */
export function holdsUnknownContent(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : null;
  const message = cause instanceof Error ? cause.message : "";
  return /Unknown node type|There is no mark type/i.test(message);
}

// ── Typing triggers: "/" and "@" ────────────────────────────────────────────

export type TriggerChar = "/" | "@";

/** The longest query a trigger keeps open (a title with spaces fits). */
export const TRIGGER_QUERY_MAX = 40;

/**
 * The trigger the writer is typing at the cursor, from the text of the block
 * up to the cursor: "/" or "@" at the block's start or after a space, then a
 * query that doesn't start with a space and hasn't grown past the limit or
 * two spaces. `offset`: where the trigger character sits in `textBefore`.
 * null: none (an e-mail address, a date "1/2", prose). Atoms in the text
 * (a reference) count as a non-space character.
 */
export function findTrigger(textBefore: string): { char: TriggerChar; query: string; offset: number } | null {
  const offset = Math.max(textBefore.lastIndexOf("/"), textBefore.lastIndexOf("@"));
  if (offset < 0) return null;
  if (offset > 0 && !/\s/.test(textBefore[offset - 1])) return null;
  const query = textBefore.slice(offset + 1);
  if (query.length > TRIGGER_QUERY_MAX || /^\s/.test(query) || /\s\s/.test(query)) return null;
  return { char: textBefore[offset] as TriggerChar, query, offset };
}

// ── The "/" menu ────────────────────────────────────────────────────────────

export type SlashGroup = "Text" | "Story" | "Media";

export type SlashAction =
  | { kind: "block"; block: "heading2" | "heading3" | "bulletList" | "orderedList" | "taskList" | "blockquote" | "aside" | "divider" }
  | { kind: "reference"; scope: ReferenceTargetType }
  | { kind: "embed"; view: ViewEmbedKind };

export type SlashCommand = {
  id: string;
  label: string;
  group: SlashGroup;
  /** Words it is also found by. */
  keywords: string[];
  action: SlashAction;
};

/**
 * The whole "/" menu: writing-oriented text blocks and pointers at the
 * story. Media (images, attachments) is deferred: Attachments are
 * Project-owned assets (architecture §25) with their own storage, and the
 * menu offers nothing it can't do.
 */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { id: "heading", label: "Heading", group: "Text", keywords: ["title", "h2", "section"], action: { kind: "block", block: "heading2" } },
  { id: "subheading", label: "Subheading", group: "Text", keywords: ["heading", "h3"], action: { kind: "block", block: "heading3" } },
  { id: "bullets", label: "Bulleted list", group: "Text", keywords: ["list", "unordered", "ul"], action: { kind: "block", block: "bulletList" } },
  { id: "numbers", label: "Numbered list", group: "Text", keywords: ["list", "ordered", "ol"], action: { kind: "block", block: "orderedList" } },
  { id: "checklist", label: "Checklist", group: "Text", keywords: ["todo", "task", "check", "list"], action: { kind: "block", block: "taskList" } },
  { id: "quote", label: "Quote", group: "Text", keywords: ["blockquote", "citation"], action: { kind: "block", block: "blockquote" } },
  { id: "aside", label: "Aside", group: "Text", keywords: ["callout", "note", "margin"], action: { kind: "block", block: "aside" } },
  { id: "divider", label: "Divider", group: "Text", keywords: ["rule", "line", "separator", "hr"], action: { kind: "block", block: "divider" } },
  { id: "ref-entry", label: "Reference to entry", group: "Story", keywords: ["link", "mention", "character", "collection"], action: { kind: "reference", scope: "entry" } },
  { id: "ref-page", label: "Reference to page", group: "Story", keywords: ["link", "mention", "note"], action: { kind: "reference", scope: "page" } },
  { id: "ref-scene", label: "Reference to scene", group: "Story", keywords: ["link", "mention", "manuscript"], action: { kind: "reference", scope: "scene" } },
  { id: "ref-chapter", label: "Reference to chapter", group: "Story", keywords: ["link", "mention", "manuscript"], action: { kind: "reference", scope: "chapter" } },
  { id: "embed-collection", label: "Collection view", group: "Story", keywords: ["embed", "table", "board", "list", "database"], action: { kind: "embed", view: "collection" } },
  { id: "embed-scene", label: "Scene view", group: "Story", keywords: ["embed", "manuscript", "table", "board", "list"], action: { kind: "embed", view: "scene" } },
];

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The commands matching a "/" query, in menu order: a label starting with it
 * first, then a label containing it, then a keyword starting with it. Empty
 * query: every command. `available` removes what this database can't do yet.
 */
export function matchSlashCommands(
  query: string,
  available: (command: SlashCommand) => boolean = () => true
): SlashCommand[] {
  const q = fold(query);
  const offered = SLASH_COMMANDS.filter(available);
  if (!q) return offered;
  const tier = (c: SlashCommand) => {
    const label = fold(c.label);
    if (label.startsWith(q)) return 0;
    if (label.includes(q)) return 1;
    if (c.keywords.some((k) => fold(k).startsWith(q))) return 2;
    return null;
  };
  return offered
    .map((c, at) => ({ c, at, t: tier(c) }))
    .filter((x): x is { c: SlashCommand; at: number; t: 0 | 1 | 2 } => x.t !== null)
    .sort((a, b) => a.t - b.t || a.at - b.at)
    .map((x) => x.c);
}
