// A small, strict-enough XML reader for the parts of a .docx Rune reads
// (word/document.xml, word/styles.xml, docProps/core.xml). Linear in the
// input; no DTDs, no external entities (none are ever resolved). Runs in the
// browser and in Node alike, so the same code is tested as shipped.

export type XmlElement = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
};
export type XmlNode = XmlElement | string;

const ENTITY: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITY[ref] ?? whole;
  });
}

const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

/** Parses a document into its root element. Throws on malformed nesting. */
export function parseXml(xml: string): XmlElement {
  const root: XmlElement = { name: "#root", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      pushText(stack[stack.length - 1], xml.slice(i));
      break;
    }
    if (lt > i) pushText(stack[stack.length - 1], xml.slice(i, lt));
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      if (end === -1) throw new Error("Unterminated comment");
      i = end + 3;
    } else if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      if (end === -1) throw new Error("Unterminated CDATA");
      stack[stack.length - 1].children.push(xml.slice(lt + 9, end));
      i = end + 3;
    } else if (xml[lt + 1] === "?" || xml[lt + 1] === "!") {
      const end = xml.indexOf(">", lt);
      if (end === -1) throw new Error("Unterminated declaration");
      i = end + 1;
    } else if (xml[lt + 1] === "/") {
      const end = xml.indexOf(">", lt);
      if (end === -1) throw new Error("Unterminated end tag");
      const name = xml.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name || stack.length === 0) throw new Error(`Mismatched </${name}>`);
      i = end + 1;
    } else {
      // Find the tag's end, skipping ">" inside quoted attribute values.
      let j = lt + 1;
      let quote: string | null = null;
      for (; j < n; j++) {
        const c = xml[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      if (j >= n) throw new Error("Unterminated tag");
      let body = xml.slice(lt + 1, j);
      const selfClosing = body.endsWith("/");
      if (selfClosing) body = body.slice(0, -1);
      const space = body.search(/\s/);
      const name = space === -1 ? body : body.slice(0, space);
      const attrs: Record<string, string> = {};
      if (space !== -1) {
        ATTR.lastIndex = 0;
        const rest = body.slice(space);
        let m: RegExpExecArray | null;
        while ((m = ATTR.exec(rest))) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
      }
      const el: XmlElement = { name, attrs, children: [] };
      stack[stack.length - 1].children.push(el);
      if (!selfClosing) stack.push(el);
      i = j + 1;
    }
  }
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1].name}>`);
  const first = root.children.find((c): c is XmlElement => typeof c !== "string");
  if (!first) throw new Error("No root element");
  return first;
}

function pushText(parent: XmlElement, raw: string) {
  if (raw) parent.children.push(decodeEntities(raw));
}

/** Direct child elements, optionally by name. */
export function elements(el: XmlElement, name?: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const c of el.children) if (typeof c !== "string" && (name === undefined || c.name === name)) out.push(c);
  return out;
}

export function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) if (typeof c !== "string" && c.name === name) return c;
  return undefined;
}

/** The concatenated text directly inside an element (and its descendants). */
export function textContent(el: XmlElement): string {
  let out = "";
  for (const c of el.children) out += typeof c === "string" ? c : textContent(c);
  return out;
}
