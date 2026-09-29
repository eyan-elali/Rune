// Builds real .docx files for the Manuscript Import tests: a ZIP archive
// (deflated with zlib, CRC-32 filled in) holding [Content_Types].xml, the
// package relationships, word/document.xml, word/styles.xml and optionally
// docProps/core.xml and word/comments.xml — the same parts Word writes.
//
// Paragraphs are described as:
//   'plain text'
//   { style: 'Heading1' | 'Title' | …, runs: [...] }      a styled paragraph
//   { runs: ['plain', { t: 'bold', b: true }, { t: 'x', i: true, u: true, s: true }, { br: true }, { tab: true }] }
//   { raw: '<w:p>…</w:p>' }                                 exact XML
import zlib from 'node:zlib';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runXml(r) {
  if (typeof r === 'string') return `<w:r><w:t xml:space="preserve">${esc(r)}</w:t></w:r>`;
  if (r.br) return `<w:r><w:br/></w:r>`;
  if (r.pageBreak) return `<w:r><w:br w:type="page"/></w:r>`;
  if (r.tab) return `<w:r><w:tab/></w:r>`;
  const props = [r.b && '<w:b/>', r.i && '<w:i/>', r.u && '<w:u w:val="single"/>', r.s && '<w:strike/>', r.style && `<w:rStyle w:val="${r.style}"/>`]
    .filter(Boolean).join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(r.t)}</w:t></w:r>`;
}

export function paragraphXml(p) {
  if (typeof p === 'string') return `<w:p>${p ? runXml(p) : ''}</w:p>`;
  if (p.raw) return p.raw;
  const pPr = p.style ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>` : '';
  return `<w:p>${pPr}${(p.runs ?? []).map(runXml).join('')}</w:p>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ChapterTitle"><w:name w:val="Chapter Title"/><w:basedOn w:val="Heading2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Epigraph"><w:name w:val="Epigraph"/><w:basedOn w:val="Normal"/><w:rPr><w:i/></w:rPr></w:style>
  <w:style w:type="character" w:styleId="Emphasis"><w:name w:val="Emphasis"/><w:rPr><w:i/></w:rPr></w:style>
</w:styles>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

export function documentXml(paragraphs) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <w:body>${paragraphs.map(paragraphXml).join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body>
</w:document>`;
}

/** A ZIP archive of { name: string | Buffer } entries, deflated (or stored with `store`). */
export function zip(files, { store = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const packed = store ? data : zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const method = store ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** A .docx of these paragraphs. `title`: docProps/core.xml dc:title. `comments`: how many comments. */
export function buildDocx(paragraphs, { title, comments = 0, store = false } = {}) {
  const files = {
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': RELS,
    'word/document.xml': documentXml(paragraphs),
    'word/styles.xml': STYLES,
  };
  if (title) {
    files['docProps/core.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`;
  }
  if (comments) {
    files['word/comments.xml'] = `<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${
      Array.from({ length: comments }, (_, i) => `<w:comment w:id="${i}"><w:p><w:r><w:t>note</w:t></w:r></w:p></w:comment>`).join('')}</w:comments>`;
  }
  return new Uint8Array(zip(files, { store }));
}
