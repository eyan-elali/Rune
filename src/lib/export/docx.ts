import type { ExportBlock, ExportDocument } from "./plan";
import { escapeXml, LINE_BREAK, type ProseBlock, type Segment } from "./prose";
import { ZipWriter } from "./zipWriter";

// ExportDocument → .docx (Office Open XML), written directly: a conventional
// manuscript document for beta readers, editors and workshops, meant to be
// edited further in Word, Pages, Google Docs or LibreOffice.
//
// What it carries — everything semantic Rune knows, as real Word structure:
//   * the title (Word's Title style, on its own page) and Group and Chapter
//     headings as Heading 1–6 by outline depth (so Word's navigation pane and
//     table of contents see the book's structure); each starts a new page;
//   * paragraphs (Normal: first-line indent; the first paragraph of a Chapter
//     or after a Scene break is not indented — "First Paragraph"), intentional
//     empty paragraphs as empty paragraphs, line breaks as line breaks;
//   * bold, italic, underline, strikethrough, inline code, links (real
//     hyperlinks), block quotes (Quote), bulleted and numbered lists (Word
//     numbering, nesting kept), code blocks (Code), horizontal rules;
//   * Scene breaks as a centred "* * *" (Scene Break style);
//   * page numbers in the footer (not on the title page).
// What it doesn't: fonts, sizes and page geometry beyond one conventional
// setup (Times New Roman 12 pt, 1.5 spacing, US Letter, 1-inch margins),
// which the writer can change in Word through the named styles.

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const SCENE_BREAK_TEXT = "* * *";

type Context = {
  links: string[];
  /** Ordered lists get their own numbering instance (so each restarts); [numId, start]. */
  orderedNums: [number, number][];
};

function runs(segments: Segment[], ctx: Context): string {
  let xml = "";
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    if (seg.href) {
      // Consecutive runs to the same address share one hyperlink.
      let j = i;
      let inner = "";
      while (j < segments.length && segments[j].href === seg.href) inner += run(segments[j++], true);
      ctx.links.push(seg.href);
      xml += `<w:hyperlink r:id="rIdLink${ctx.links.length}" w:history="1">${inner}</w:hyperlink>`;
      i = j;
    } else {
      xml += run(seg, false);
      i += 1;
    }
  }
  return xml;
}

function run(seg: Segment, link: boolean): string {
  if (seg.text === LINE_BREAK) return "<w:r><w:br/></w:r>";
  const props =
    (link ? '<w:rStyle w:val="Hyperlink"/>' : seg.code ? '<w:rStyle w:val="InlineCode"/>' : "") +
    (seg.bold ? "<w:b/>" : "") +
    (seg.italic ? "<w:i/>" : "") +
    (seg.strike ? "<w:strike/>" : "") +
    (seg.underline && !link ? '<w:u w:val="single"/>' : "");
  const rPr = props ? `<w:rPr>${props}</w:rPr>` : "";
  // A tab is its own element; everything else is literal text.
  const body = seg.text
    .split("\t")
    .map((part) => (part ? `<w:t xml:space="preserve">${escapeXml(part)}</w:t>` : ""))
    .join("<w:tab/>");
  return `<w:r>${rPr}${body}</w:r>`;
}

type ParaOptions = { style?: string; pageBreak?: boolean; num?: { id: number; level: number }; indentLeft?: number; border?: boolean };

function paragraph(inner: string, o: ParaOptions = {}): string {
  const pPr =
    (o.style ? `<w:pStyle w:val="${o.style}"/>` : "") +
    (o.pageBreak ? "<w:pageBreakBefore/>" : "") +
    (o.num ? `<w:numPr><w:ilvl w:val="${o.num.level}"/><w:numId w:val="${o.num.id}"/></w:numPr>` : "") +
    (o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>' : "") +
    (o.indentLeft !== undefined ? `<w:ind w:left="${o.indentLeft}" w:firstLine="0"/>` : "");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${inner}</w:p>`;
}

const BULLET_NUM = 1;
const headingStyle = (level: number) => `Heading${Math.min(6, Math.max(1, level))}`;

/**
 * Prose blocks → paragraphs. `first` is whether the next body paragraph opens
 * a passage (no first-line indent); `quote` puts paragraphs in the Quote style.
 */
function proseXml(
  blocks: ProseBlock[],
  headingBase: number,
  ctx: Context,
  state: { first: boolean },
  quote = false,
  listLevel = -1
): string {
  let xml = "";
  for (const b of blocks) {
    switch (b.kind) {
      case "paragraph": {
        const style = quote ? "Quote" : state.first ? "FirstParagraph" : undefined;
        xml += paragraph(runs(b.segments, ctx), { style });
        // An empty paragraph is spacing, not the passage's first paragraph.
        if (b.segments.length > 0) state.first = false;
        break;
      }
      case "heading":
        xml += paragraph(runs(b.segments, ctx), { style: headingStyle(headingBase + b.level) });
        state.first = true;
        break;
      case "quote":
        xml += proseXml(b.blocks, headingBase, ctx, state, true, listLevel);
        state.first = false;
        break;
      case "list": {
        const level = Math.min(8, listLevel + 1);
        let numId = BULLET_NUM;
        if (b.ordered) {
          numId = BULLET_NUM + 1 + ctx.orderedNums.length;
          ctx.orderedNums.push([numId, b.start]);
        }
        for (const item of b.items) {
          let numbered = false;
          for (const inner of item) {
            if (inner.kind === "paragraph" && !numbered) {
              xml += paragraph(runs(inner.segments, ctx), { style: "ListParagraph", num: { id: numId, level } });
              numbered = true;
            } else if (inner.kind === "paragraph") {
              xml += paragraph(runs(inner.segments, ctx), { style: "ListParagraph", indentLeft: 720 * (level + 1) });
            } else {
              if (!numbered && inner.kind !== "list") {
                xml += paragraph("", { style: "ListParagraph", num: { id: numId, level } });
                numbered = true;
              }
              xml += proseXml([inner], headingBase, ctx, state, quote, level);
            }
          }
          if (!numbered) xml += paragraph("", { style: "ListParagraph", num: { id: numId, level } });
        }
        state.first = false;
        break;
      }
      case "code": {
        const lines = b.text.split("\n");
        const inner = lines
          .map((line, i) => (i > 0 ? "<w:r><w:br/></w:r>" : "") + (line ? run({ ...PLAIN_CODE, text: line }, false) : ""))
          .join("");
        xml += paragraph(inner, { style: "Code" });
        state.first = false;
        break;
      }
      case "rule":
        xml += paragraph("", { style: "FirstParagraph", border: true });
        state.first = true;
        break;
    }
  }
  return xml;
}

const PLAIN_CODE: Omit<Segment, "text"> = { bold: false, italic: false, underline: false, strike: false, code: false, href: null };

function bodyXml(blocks: ExportBlock[], ctx: Context): string {
  let xml = "";
  const state = { first: true };
  for (const block of blocks) {
    switch (block.kind) {
      case "title":
        xml += paragraph(runs([{ ...PLAIN_CODE, text: block.text }], ctx), { style: "Title" });
        state.first = true;
        break;
      case "heading":
        xml += paragraph(runs([{ ...PLAIN_CODE, text: block.text }], ctx), {
          style: headingStyle(block.level),
          pageBreak: block.newPage,
        });
        state.first = true;
        break;
      case "sceneBreak":
        xml += paragraph(runs([{ ...PLAIN_CODE, text: SCENE_BREAK_TEXT }], ctx), { style: "SceneBreak" });
        state.first = true;
        break;
      case "prose":
        xml += proseXml(block.blocks, block.headingBase, ctx, state);
        break;
    }
  }
  return xml;
}

function documentXml(body: string, titlePage: boolean): string {
  return (
    XML_HEAD +
    `<w:document ${W_NS}><w:body>${body}` +
    '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>' +
    '<w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
    (titlePage ? "<w:titlePg/>" : "") +
    "</w:sectPr></w:body></w:document>"
  );
}

function style(
  type: "paragraph" | "character",
  id: string,
  name: string,
  inner: string,
  extra: { basedOn?: string; next?: string; isDefault?: boolean } = {}
): string {
  return (
    `<w:style w:type="${type}" w:styleId="${id}"${extra.isDefault ? ' w:default="1"' : ""}>` +
    `<w:name w:val="${name}"/>` +
    (extra.basedOn ? `<w:basedOn w:val="${extra.basedOn}"/>` : "") +
    (extra.next ? `<w:next w:val="${extra.next}"/>` : "") +
    `<w:qFormat/>${inner}</w:style>`
  );
}

const HEADINGS: [number, string][] = [
  [1, '<w:pPr><w:keepNext/><w:spacing w:before="480" w:after="360"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr>'],
  [2, '<w:pPr><w:keepNext/><w:spacing w:before="480" w:after="360"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr>'],
  [3, '<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="240"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr>'],
  [4, '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:i/></w:rPr>'],
  [5, '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="4"/></w:pPr><w:rPr><w:i/></w:rPr>'],
  [6, '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="5"/></w:pPr><w:rPr><w:i/></w:rPr>'],
];

function stylesXml(): string {
  return (
    XML_HEAD +
    `<w:styles ${W_NS}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    style("paragraph", "Normal", "Normal", '<w:pPr><w:ind w:firstLine="720"/></w:pPr>', { isDefault: true }) +
    style("paragraph", "FirstParagraph", "First Paragraph", '<w:pPr><w:ind w:firstLine="0"/></w:pPr>', { basedOn: "Normal", next: "Normal" }) +
    style(
      "paragraph",
      "Title",
      "Title",
      '<w:pPr><w:spacing w:before="2880" w:after="480"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr>',
      { basedOn: "Normal", next: "Normal" }
    ) +
    HEADINGS.map(([n, inner]) => style("paragraph", `Heading${n}`, `heading ${n}`, inner, { basedOn: "Normal", next: "FirstParagraph" })).join("") +
    style(
      "paragraph",
      "SceneBreak",
      "Scene Break",
      '<w:pPr><w:spacing w:before="240" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>',
      { basedOn: "Normal", next: "FirstParagraph" }
    ) +
    style("paragraph", "Quote", "Quote", '<w:pPr><w:ind w:left="720" w:right="720" w:firstLine="0"/></w:pPr>', { basedOn: "Normal" }) +
    style("paragraph", "ListParagraph", "List Paragraph", '<w:pPr><w:ind w:firstLine="0"/></w:pPr>', { basedOn: "Normal" }) +
    style(
      "paragraph",
      "Code",
      "Code",
      '<w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/></w:rPr>',
      { basedOn: "Normal" }
    ) +
    style("paragraph", "Footer", "footer", '<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="right"/></w:pPr>', { basedOn: "Normal" }) +
    style("character", "Hyperlink", "Hyperlink", '<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>') +
    style("character", "InlineCode", "Inline Code", '<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/></w:rPr>') +
    "</w:styles>"
  );
}

const BULLETS = ["•", "◦", "▪"];

function numberingXml(ordered: [number, number][]): string {
  const levels = (fmt: (i: number) => string) =>
    Array.from({ length: 9 }, (_, i) => `<w:lvl w:ilvl="${i}">${fmt(i)}<w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join("");
  return (
    XML_HEAD +
    `<w:numbering ${W_NS}>` +
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels(
      (i) => `<w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${BULLETS[i % 3]}"/><w:lvlJc w:val="left"/>`
    )}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(
      (i) => `<w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/>`
    )}</w:abstractNum>` +
    `<w:num w:numId="${BULLET_NUM}"><w:abstractNumId w:val="0"/></w:num>` +
    ordered
      .map(
        ([id, start]) =>
          `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`
      )
      .join("") +
    "</w:numbering>"
  );
}

const FOOTER =
  XML_HEAD +
  `<w:ftr ${W_NS}><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>` +
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>' +
  "</w:p></w:ftr>";

function relsXml(links: string[]): string {
  return (
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
    '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
    links
      .map(
        (href, i) =>
          `<Relationship Id="rIdLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(href)}" TargetMode="External"/>`
      )
      .join("") +
    "</Relationships>"
  );
}

const CONTENT_TYPES =
  XML_HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
  '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  "</Types>";

const PACKAGE_RELS =
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  "</Relationships>";

function coreXml(title: string, at: Date): string {
  const when = at.toISOString().replace(/\.\d{3}Z$/, "Z");
  return (
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified>` +
    "</cp:coreProperties>"
  );
}

/** The document as a .docx file's bytes. */
export async function renderDocx(doc: ExportDocument, at: Date = new Date()): Promise<Uint8Array> {
  const ctx: Context = { links: [], orderedNums: [] };
  const body = bodyXml(doc.blocks, ctx);
  const zip = new ZipWriter(at);
  await zip.add("[Content_Types].xml", CONTENT_TYPES);
  await zip.add("_rels/.rels", PACKAGE_RELS);
  await zip.add("docProps/core.xml", coreXml(doc.subject, at));
  await zip.add("word/document.xml", documentXml(body, doc.blocks[0]?.kind === "title"));
  await zip.add("word/_rels/document.xml.rels", relsXml(ctx.links));
  await zip.add("word/styles.xml", stylesXml());
  await zip.add("word/numbering.xml", numberingXml(ctx.orderedNums));
  await zip.add("word/footer1.xml", FOOTER);
  return zip.finish();
}
