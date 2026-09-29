// Manuscript Import (Rune 2.0, Milestone 15, migration 033): the REAL file
// readers, structure detection, preview corrections and payload
// (src/lib/import/*), and the REAL confirmation path (src/lib/manuscriptImport.ts,
// the POST /api/manuscript-import route and import_manuscript_checked) against
// the Rune 2.0 schema in real Postgres + RLS.
//
//   * DOCX (real ZIP archives, deflated and stored), Markdown and plain text
//   * Group / Chapter / explicit Scene-break detection; blank lines are never
//     Scene breaks; capitals alone never make a heading
//   * the preview's hierarchy and its corrections (Group ↔ Chapter, remove,
//     rename, merge by un-breaking, split at a possible heading)
//   * no database access before confirmation; one atomic transaction after it
//     (a failure mid-insert leaves nothing); retries never import twice
//   * prose preserved exactly (paragraph order, emphasis, line breaks) and
//     every Scene a valid editor document with the editor's own word count
//   * totals and export include the import; writing history does not move
//   * ownership: always the caller's new Project; nothing reaches another
//     writer or an existing Project; clients can't call the internals
//   * a realistic ~110,000-word manuscript (4 Parts, 48 Chapters, ~280 Scenes)
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// (starter_2k, near her limit) owns hollow; bram (legacy_15k) owns tide; cora
// (made a Scribe here) owns only an empty project; dana is a new writer with
// nothing (starter_2k).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, createAuthUser, LEGACY_BASELINE, RUNE2_SCHEMA, HARNESS_DIR } from '../lib/pg.mjs';
import path from 'node:path';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';
import { buildDocx } from '../lib/docx-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const CORA = USERS.cora.id;
const HOLLOW = projectId('hollow');
const DANA = 'aaaaaaaa-0000-4000-8000-0000000000d4';

const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const enc = (s) => new TextEncoder().encode(s);
const uuid = () => crypto.randomUUID();

let legacy, reader, structure, content, confirm, route, tiptap, loader, exporter;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  reader = await bundleForTest('src/lib/import/readFile.ts', { name: 'imp_read' });
  structure = await bundleForTest('src/lib/import/structure.ts', { name: 'imp_structure' });
  content = await bundleForTest('src/lib/import/content.ts', { name: 'imp_content' });
  confirm = await bundleForTest('src/lib/manuscriptImport.ts', { name: 'imp_confirm' });
  route = await bundleForTest('src/app/api/manuscript-import/route.ts', { name: 'imp_route' });
  tiptap = await bundleForTest('tools/sync-harness/lib/tiptap-schema.mjs', { name: 'imp_tiptap' });
  loader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'imp_loader' });
  exporter = await bundleForTest('src/lib/export/projectExport.ts', {
    name: 'imp_export', aliases: { jspdf: path.join(HARNESS_DIR, 'mocks/jspdf.js') },
  });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  await db.query(`update public.profiles set subscription_tier = 'scribe' where id = $1`, [CORA]);
  await createAuthUser(db, DANA);
  return db;
}

const as = (db, userId) => createSupabaseAdapter(db, { userId });
function signIn(db, userId) {
  const sb = as(db, userId);
  for (const mod of [route, loader]) mod.setServerClient(sb);
  return sb;
}

/** Read → detect → plan → payload, exactly as the preview does. */
async function preview(fileName, bytes, overrides = {}, options = {}) {
  const parsed = await reader.parseImportFile(fileName, bytes, options);
  const lines = structure.detectLines(parsed);
  const plan = structure.buildPlan(lines, overrides, parsed.suggestedTitle ?? reader.titleFromFileName(fileName));
  return { parsed, lines, plan, payload: structure.planPayload(plan, plan.title) };
}

const lineAt = (lines, text) => {
  const l = lines.find((x) => x.text === text);
  assert.ok(l, `no line ${JSON.stringify(text)}`);
  return l.index;
};
const runsText = (runs) => runs.map((r) => (typeof r === 'string' ? r : r[0])).join('');
const paraText = (p) => runsText(Array.isArray(p) ? p : p.q);

/** The plan as a readable outline: [kind, title, [scene paragraph texts…]]. */
function outline(items) {
  return items.map((it) => (it.kind === 'group'
    ? ['group', it.title, outline(it.items)]
    : ['chapter', it.title, it.scenes.map((s) => s.paragraphs.map(paraText))]));
}

// ── 1. DOCX ───────────────────────────────────────────────────────────────────

const HOLLOW_CROWN = [
  { style: 'Title', runs: ['The Hollow Crown'] },
  { style: 'Epigraph', runs: ['For the ones who stayed.'] },
  { style: 'Heading1', runs: ['Part One: Ash'] },
  { style: 'Heading2', runs: ['Chapter 1'] },
  { runs: [{ tab: true }, 'She ', { t: 'never', i: true }, ' looked ', { t: 'back', b: true }, '.', { br: true }, 'Not once.'] },
  '',
  '',
  { runs: ['An ', { t: 'underlined', u: true }, ' and a ', { t: 'struck', s: true }, ' word, and ', { t: 'styled', style: 'Emphasis' }, '.'] },
  '* * *',
  { runs: ['After the break.', { pageBreak: true }] },
  { style: 'Heading2', runs: ['The Storm'] },
  'Rain.',
  '#',
  'More rain.',
  { style: 'Heading1', runs: ['Part Two'] },
  { style: 'Heading2', runs: ['Chapter 3'] },
  'End.',
];

test('DOCX: paragraphs, bold / italic / underline / strike (direct, character-style and paragraph-style), line breaks; layout left behind', async () => {
  const { parsed } = await preview('hollow.docx', buildDocx(HOLLOW_CROWN, { title: 'Core Title' }));
  assert.equal(parsed.format, 'docx');
  assert.equal(parsed.suggestedTitle, 'Core Title');
  assert.deepEqual(parsed.blocks.slice(0, 5), [
    { kind: 'heading', level: 0, runs: ['The Hollow Crown'] },
    { kind: 'paragraph', runs: [['For the ones who stayed.', 2]] },
    { kind: 'heading', level: 1, runs: ['Part One: Ash'] },
    { kind: 'heading', level: 2, runs: ['Chapter 1'] },
    { kind: 'paragraph', runs: ['She ', ['never', 2], ' looked ', ['back', 1], '.\nNot once.'] },
  ], 'the leading tab (indentation) is layout; the line break is kept');
  const blank = { kind: 'paragraph', runs: [], blank: 'explicit' };
  assert.deepEqual(parsed.blocks[5], blank,
    'two empty paragraphs in the one gap between prose paragraphs: one separates them, one is kept');
  assert.deepEqual(parsed.blocks[6], { kind: 'paragraph', runs: ['An ', ['underlined', 4], ' and a ', ['struck', 8], ' word, and ', ['styled', 2], '.'] });
  assert.deepEqual(parsed.blocks[8], { kind: 'paragraph', runs: ['After the break.'] }, 'a page break is layout, not a line break');
  assert.deepEqual(parsed.notices, []);
  // A stored (uncompressed) archive reads the same.
  const stored = await reader.parseImportFile('hollow.docx', buildDocx(HOLLOW_CROWN, { title: 'Core Title', store: true }));
  assert.deepEqual(stored.blocks, parsed.blocks);
});

test('DOCX: groups, chapters and scene breaks are detected; the document title names the Project', async () => {
  const { plan, lines } = await preview('hollow.docx', buildDocx(HOLLOW_CROWN));
  assert.equal(plan.title, 'The Hollow Crown');
  assert.equal(lines[plan.titleLine].text, 'The Hollow Crown');
  assert.deepEqual(outline(plan.items), [
    ['group', 'Part One: Ash', [
      ['chapter', 'Chapter 1', [
        ['She never looked back.\nNot once.', '', 'An underlined and a struck word, and styled.'],
        ['After the break.'],
      ]],
      ['chapter', 'The Storm', [['Rain.'], ['More rain.']]],
    ]],
    ['group', 'Part Two', [['chapter', 'Chapter 3', [['End.']]]]],
  ]);
  assert.deepEqual(plan.unplaced.map((s) => [s.title, s.paragraphs.map(paraText)]), [['Front matter', ['For the ones who stayed.']]],
    'the epigraph before the first chapter is kept, as an Unplaced Scene');
  assert.deepEqual([plan.groups, plan.chapters, plan.scenes, plan.words, plan.unplacedWords], [2, 3, 5, 21, 5]);
});

test('DOCX: what can’t be carried over is reported, never silently dropped; tracked insertions, links and table text are kept', async () => {
  const w = (xml) => ({ raw: `<w:p>${xml}</w:p>` });
  const docx = buildDocx([
    { style: 'Heading2', runs: ['Chapter 1'] },
    w('<w:r><w:t>Before </w:t></w:r><w:ins w:id="1"><w:r><w:t>inserted </w:t></w:r></w:ins><w:del w:id="2"><w:r><w:delText>deleted </w:delText></w:r></w:del><w:r><w:t>after.</w:t></w:r>'),
    w('<w:hyperlink r:id="rId9"><w:r><w:t>Linked text</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> stays.</w:t></w:r>'),
    w('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>7</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'),
    w('<w:r><w:t>A picture:</w:t></w:r><w:r><w:drawing/></w:r><w:r><w:t xml:space="preserve"> and a note</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r>'),
    { raw: '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell one</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell two</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' },
    w('<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>A list item</w:t></w:r>'),
    w('<w:r><w:t>&lt;Ampersands &amp; &#8220;quotes&#8221;&gt;</w:t></w:r>'),
  ], { comments: 3 });
  const { parsed, plan } = await preview('notes.docx', docx);
  assert.deepEqual(plan.items[0].scenes[0].paragraphs.map(paraText), [
    'Before inserted after.',
    'Linked text stays.',
    '7',
    'A picture: and a note',
    'Cell one',
    'Cell two',
    'A list item',
    '<Ampersands & “quotes”>',
  ]);
  assert.deepEqual(parsed.notices.map((n) => n.code).sort(), ['comment', 'deletion', 'footnote', 'image', 'list', 'table']);
  for (const n of parsed.notices) assert.ok(n.message.length > 10);
});

test('DOCX: a damaged file, an old .doc and an unsupported format fail with a clear message', async () => {
  await assert.rejects(reader.parseImportFile('x.docx', enc('not a zip at all')), (e) => e instanceof reader.ImportFileError && /\.doc/.test(e.message));
  const truncated = buildDocx(['Hello']).slice(0, 60);
  await assert.rejects(reader.parseImportFile('x.docx', truncated), reader.ImportFileError);
  const oldDoc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  await assert.rejects(reader.parseImportFile('old.docx', oldDoc), /save it as \.docx/);
  await assert.rejects(reader.parseImportFile('book.pdf', enc('%PDF')), /\.docx, \.md and \.txt/);
  await assert.rejects(reader.parseImportFile('empty.txt', new Uint8Array()), /empty/);
  await assert.rejects(reader.parseImportFile('blank.md', enc('\n\n   \n')), /any text/);
});

// ── 2. Markdown ───────────────────────────────────────────────────────────────

const MD = `# The Glass Road

## Chapter One

Hello *there*, **bold** and ***both*** and ~~gone~~ and snake_case_name and 2*3*4.
A soft line joins.\\
A hard line breaks.

***

> A quoted line
> continues.

Escaped \\*not italic\\*. A [link](https://example.com) and ![an image](x.png).

- a list item

#

After the lone hash.

---

After the rule.

## Chapter Two

Last.
`;

test('Markdown: headings, emphasis, soft and hard line breaks, quotes, escapes; explicit breaks ***, #, --- are Scene breaks', async () => {
  const { plan, parsed } = await preview('glass.md', enc(MD));
  assert.equal(plan.title, 'The Glass Road');
  const [ch1, ch2] = plan.items;
  assert.equal(ch1.title, 'Chapter One');
  assert.deepEqual(ch1.scenes[0].paragraphs, [[
    'Hello ', ['there', 2], ', ', ['bold', 1], ' and ', ['both', 3], ' and ', ['gone', 8],
    ' and snake_case_name and 2', ['3', 2], '4. A soft line joins.\nA hard line breaks.',
  ]]);
  assert.deepEqual(ch1.scenes[1].paragraphs, [
    { q: ['A quoted line continues.'] },
    ['Escaped *not italic*. A link and .'],
    ['- a list item'],
  ]);
  assert.deepEqual(ch1.scenes.slice(2).map((s) => s.paragraphs.map(paraText)), [['After the lone hash.'], ['After the rule.']]);
  assert.deepEqual(outline([ch2]), [['chapter', 'Chapter Two', [['Last.']]]]);
  assert.deepEqual(parsed.notices.map((n) => n.code).sort(), ['image', 'list']);
  const twoSpaces = await preview('h.md', enc('## Chapter 1\n\nfirst line' + '  ' + '\nsecond line\n'));
  assert.deepEqual(twoSpaces.plan.items[0].scenes[0].paragraphs, [['first line\nsecond line']], 'two trailing spaces: a line break');
});

test('Markdown: heading depth is read conservatively — one level of Groups above the Chapters, deeper headings stay prose', async () => {
  const md = `# Book One\n\n## Arrival\n\nText a.\n\n### A subheading\n\nText b.\n\n## Departure\n\nText c.\n\n# Book Two\n\n## Return\n\nText d.\n`;
  const { plan, lines } = await preview('b.md', enc(md));
  assert.deepEqual(outline(plan.items), [
    ['group', 'Book One', [
      ['chapter', 'Arrival', [['Text a.', 'A subheading', 'Text b.']]],
      ['chapter', 'Departure', [['Text c.']]],
    ]],
    ['group', 'Book Two', [['chapter', 'Return', [['Text d.']]]]],
  ]);
  assert.deepEqual(lines[lineAt(lines, 'A subheading')].options, ['text', 'chapter', 'group', 'scene'], 'offered as a possible heading');
  assert.equal(plan.items[0].items[0].scenes[0].candidates.length, 1);
});

// ── 3. Plain text ─────────────────────────────────────────────────────────────

test('TXT: one paragraph per line; blank lines — even several — are never Scene breaks', async () => {
  const txt = 'CHAPTER ONE\n\nIt was dark.\nIt was cold.\n\n\n\nStill cold.\n\n* * *\n\nMorning.\n\nChapter Two: Light\n\nDay.\n';
  const { plan } = await preview('a.txt', enc(txt));
  assert.deepEqual(outline(plan.items), [
    ['chapter', 'CHAPTER ONE', [['It was dark.', 'It was cold.', '', '', '', 'Still cold.'], ['Morning.']]],
    ['chapter', 'Chapter Two: Light', [['Day.']]],
  ]);
  const noBreaks = await preview('b.txt', enc('One.\n\n\n\nTwo.\n\n\n\n\n\nThree.\n'));
  assert.deepEqual(outline(noBreaks.plan.items), [['chapter', 'Chapter 1', [['One.', '', '', 'Two.', '', '', '', '', 'Three.']]]],
    'no structure: one Chapter holding one Scene; blank lines beyond the one separating paragraphs are empty paragraphs');
});

test('TXT: capitals alone never make a heading, and sentences that start like one stay prose', async () => {
  const txt = [
    'THE STORM', '', 'Part two of the plan was simple.', 'Chapter one was hard.', 'Book three, she said, was lost.',
    '', '7', '', 'Chapter 7', '', 'Rain.', '', 'Part III', '', 'Chapter 8.', '', 'Sun.',
  ].join('\n');
  const { lines, plan } = await preview('c.txt', enc(txt));
  const detected = Object.fromEntries(lines.filter((l) => !l.block.blank).map((l) => [l.text, l.detected]));
  assert.deepEqual(detected, {
    'THE STORM': 'text', 'Part two of the plan was simple.': 'text', 'Chapter one was hard.': 'text',
    'Book three, she said, was lost.': 'text', '7': 'text', 'Chapter 7': 'chapter', 'Rain.': 'text',
    'Part III': 'group', 'Chapter 8.': 'chapter', 'Sun.': 'text',
  });
  assert.ok(lines[lineAt(lines, 'THE STORM')].options.includes('chapter'), 'offered, not applied');
  assert.ok(lines[lineAt(lines, '7')].options.includes('chapter'));
  assert.deepEqual(plan.unplaced.map((s) => s.paragraphs.map(paraText)),
    [['THE STORM', '', 'Part two of the plan was simple.', 'Chapter one was hard.', 'Book three, she said, was lost.', '', '7']],
    'this file sets paragraphs directly after each other, so each blank line is an intentional empty paragraph');
});

test('TXT: bare numbers 1, 2, 3 … on their own lines are Chapters only as a sequence of at least three', async () => {
  const seq = await preview('n.txt', enc('1\n\nAlpha.\n\n2\n\nBeta.\n\n3\n\nGamma.\n\nThe 4 of us.\n'));
  assert.deepEqual(outline(seq.plan.items).map(([, t]) => t), ['1', '2', '3']);
  const roman = await preview('r.txt', enc('I\n\nAlpha.\n\nII\n\nBeta.\n\nIII\n\nGamma.\n\nIV\n\nDelta.\n'));
  assert.deepEqual(outline(roman.plan.items).map(([, t]) => t), ['I', 'II', 'III', 'IV']);
  const two = await preview('t.txt', enc('1\n\nAlpha.\n\n2\n\nBeta.\n'));
  assert.equal(two.plan.chapters, 1, 'two numbers are not enough: one Chapter');
  assert.deepEqual(two.plan.items[0].scenes[0].paragraphs.map(paraText), ['1', 'Alpha.', '2', 'Beta.']);
});

test('TXT: a hard-wrapped file is joined into paragraphs (and says so); “Keep every line break” keeps them', async () => {
  const wrap = (s) => s.match(/.{1,60}(\s|$)/g).map((l) => l.trim()).join('\n');
  const p1 = wrap('The road ran north through the glass hills, and every step rang like a bell under her boots, which she hated.');
  const p2 = wrap('Nobody had walked it for a hundred years, the innkeeper said, and nobody would walk it again after her, he hoped.');
  const p3 = wrap('She thanked him, paid for the bread and the lamp oil, and went out into the cold light before he could say more.');
  const txt = `Chapter 1\n\n${p1}\n\n${p2}\n\n* * *\n\n${p3}\n`;
  const joined = await preview('w.txt', enc(txt));
  assert.equal(joined.parsed.hardWrapped, true);
  assert.equal(joined.parsed.notices[0].code, 'hard_wrapped');
  assert.deepEqual(joined.plan.items[0].scenes.map((s) => s.paragraphs.map(paraText)),
    [[p1.replace(/\n/g, ' '), p2.replace(/\n/g, ' ')], [p3.replace(/\n/g, ' ')]]);
  const kept = await preview('w.txt', enc(txt), {}, { keepLineBreaks: true });
  assert.deepEqual(kept.plan.items[0].scenes[0].paragraphs.map(paraText), [p1, p2]);
  // An ordinary one-line-per-paragraph file is never joined.
  const plain = await preview('p.txt', enc('Chapter 1\nFirst paragraph here.\nSecond paragraph here.\n'));
  assert.equal(plain.parsed.hardWrapped, false);
  assert.deepEqual(plain.plan.items[0].scenes[0].paragraphs.map(paraText), ['First paragraph here.', 'Second paragraph here.']);
});

test('TXT: Windows line endings, a BOM and Windows-1252 text read correctly', async () => {
  const crlf = await preview('w.txt', enc('﻿Chapter 1\r\n\r\nCafé au lait.\r\n'));
  assert.deepEqual(outline(crlf.plan.items), [['chapter', 'Chapter 1', [['Café au lait.']]]]);
  const cp1252 = await preview('old.txt', new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x6f, 0x6b, 0x94]));
  assert.deepEqual(cp1252.plan.items[0].scenes[0].paragraphs.map(paraText), ['Café “ok”']);
});

// ── 3b. Intentional blank paragraphs ──────────────────────────────────────────

/** Source → preview → stored editor document, for one Scene's paragraphs ('' = an empty paragraph). */
async function sceneShape(name, bytes) {
  const { plan, payload } = await preview(name, bytes);
  const rows = confirm.importRows(payload);
  const chapter = rows.manuscript.items.find((i) => i.kind === 'chapter') ?? rows.manuscript.items[0].items[0];
  const stored = chapter.scenes.map((s) => {
    tiptap.editorDocument(s.content); // a valid editor document
    return s.content.content.map((n) => (n.content ? n.content.map((t) => t.text ?? '\n').join('') : ''));
  });
  const previewed = (plan.items.find((i) => i.kind === 'chapter') ?? plan.items[0].items[0]).scenes.map((s) => s.paragraphs.map(paraText));
  assert.deepEqual(stored, previewed, 'the stored document is exactly what the preview showed');
  return { stored, words: chapter.scenes.map((s) => s.word_count), plan };
}

test('blank paragraphs, TXT: one blank line is a paragraph break; blank lines beyond it are empty paragraphs; never a Scene break', async () => {
  assert.deepEqual((await sceneShape('a.txt', enc('Paragraph A.\n\nParagraph B.\n'))).stored, [['Paragraph A.', 'Paragraph B.']]);
  assert.deepEqual((await sceneShape('a.txt', enc('Paragraph A.\n\n\nParagraph B.\n'))).stored, [['Paragraph A.', '', 'Paragraph B.']]);
  assert.deepEqual((await sceneShape('a.txt', enc('Paragraph A.\n\n\n\n\nParagraph B.\n'))).stored, [['Paragraph A.', '', '', '', 'Paragraph B.']]);
  // A file that sets paragraphs directly after each other: its one blank line is intentional.
  assert.deepEqual((await sceneShape('a.txt', enc('A.\nB.\nC.\n\nD.\n'))).stored, [['A.', 'B.', 'C.', '', 'D.']]);
  // Blank lines around structure or at the edge of a Scene are spacing, not prose; only the marker breaks a Scene.
  const framed = await sceneShape('f.txt', enc('\n\nChapter 1\n\n\n\nA.\n\nB.\n\n\n\n* * *\n\n\n\nC.\n\n\n\n'));
  assert.deepEqual(framed.stored, [['A.', 'B.'], ['C.']]);
  assert.equal(framed.plan.scenes, 2);
  const many = await sceneShape('m.txt', enc('A.\n\n\n\n\n\n\n\nB.\n\n\n\n\n\n\n\nC.\n'));
  assert.equal(many.plan.scenes, 1, 'however many blank lines, no Scene break');
  assert.deepEqual(many.words, [3], 'empty paragraphs add no words');
});

test('blank paragraphs, TXT hard-wrapped: lines are still joined into paragraphs; an extra blank line between them is kept', async () => {
  const wrap = (s) => s.match(/.{1,60}(\s|$)/g).map((l) => l.trim()).join('\n');
  const p = (n) => wrap(`Paragraph ${n} runs on across several lines of an old hard-wrapped text file, as such files do, to the end.`);
  const { stored } = await sceneShape('w.txt', enc(`${p(1)}\n\n${p(2)}\n\n\n${p(3)}\n\n${p(4)}\n`));
  assert.deepEqual(stored, [[p(1), p(2), '', p(3), p(4)].map((x) => x.replace(/\n/g, ' '))]);
});

test('blank paragraphs, DOCX: an empty paragraph the writer typed is kept; page / section breaks and images are layout, not blanks', async () => {
  // Paragraphs that sit together (Word's own spacing) with one intentional empty paragraph.
  const one = await sceneShape('a.docx', buildDocx(['A.', 'B.', '', 'C.']));
  assert.deepEqual(one.stored, [['A.', 'B.', '', 'C.']]);
  const several = await sceneShape('a.docx', buildDocx(['A.', 'B.', '', '', '', 'C.']));
  assert.deepEqual(several.stored, [['A.', 'B.', '', '', '', 'C.']]);
  assert.equal(several.plan.scenes, 1);
  // A writer who presses Enter twice between every paragraph: those are separators; a third is kept.
  const doubled = await sceneShape('a.docx', buildDocx(['A.', '', 'B.', '', 'C.', '', '', 'D.']));
  assert.deepEqual(doubled.stored, [['A.', 'B.', 'C.', '', 'D.']]);
  // Whitespace-only is empty; a paragraph holding only a page break, a section break or an image is layout.
  const layout = await sceneShape('a.docx', buildDocx([
    'A.',
    'B.',
    { runs: ['   '] },
    'C.',
    { runs: [{ pageBreak: true }] },
    { raw: '<w:p><w:pPr><w:sectPr/></w:pPr></w:p>' },
    { raw: '<w:p><w:r><w:drawing/></w:r></w:p>' },
    'D.',
  ]));
  assert.deepEqual(layout.stored, [['A.', 'B.', '', 'C.', 'D.']]);
});

test('blank paragraphs, Markdown: blank lines separate paragraphs, as Markdown defines; an explicit &nbsp; or <br> line is an empty paragraph', async () => {
  assert.deepEqual((await sceneShape('a.md', enc('Paragraph A.\n\nParagraph B.\n'))).stored, [['Paragraph A.', 'Paragraph B.']]);
  assert.deepEqual((await sceneShape('a.md', enc('Paragraph A.\n\n\n\nParagraph B.\n'))).stored, [['Paragraph A.', 'Paragraph B.']],
    'in Markdown extra blank lines carry no meaning (every Markdown reader collapses them)');
  assert.deepEqual((await sceneShape('a.md', enc('Paragraph A.\n\n&nbsp;\n\nParagraph B.\n'))).stored, [['Paragraph A.', '', 'Paragraph B.']]);
  assert.deepEqual((await sceneShape('a.md', enc('A.\n\n<br>\n\n<br/>\n\nB.\n\n***\n\nC.\n'))).stored, [['A.', '', '', 'B.'], ['C.']]);
});

// ── 4. The preview's corrections ──────────────────────────────────────────────

test('corrections: Group ↔ Chapter, removing false structure, renaming, merging by un-breaking, splitting at a possible heading', async () => {
  const bytes = buildDocx(HOLLOW_CROWN);
  const { lines } = await preview('hollow.docx', bytes);
  const at = (t) => lineAt(lines, t);
  const build = (o) => structure.buildPlan(lines, o, 'x');

  // "Part Two" read as a Chapter instead: its Chapter 3 follows inside Part One.
  const asChapter = build({ [at('Part Two')]: { role: 'chapter' } });
  assert.deepEqual(outline(asChapter.items)[0][2].map(([k, t]) => [k, t]),
    [['chapter', 'Chapter 1'], ['chapter', 'The Storm'], ['chapter', 'Part Two'], ['chapter', 'Chapter 3']]);
  assert.equal(asChapter.groups, 1);
  assert.equal(asChapter.items[0].items[2].scenes[0].paragraphs.length, 0, 'a Chapter with no prose keeps one empty Scene');

  // "The Storm" is not a heading: its text joins Chapter 1's last Scene, kept as prose.
  const removed = build({ [at('The Storm')]: { role: 'text' } });
  assert.deepEqual(outline(removed.items)[0][2][0], ['chapter', 'Chapter 1', [
    ['She never looked back.\nNot once.', '', 'An underlined and a struck word, and styled.'],
    ['After the break.', 'The Storm', 'Rain.'],
    ['More rain.'],
  ]]);
  assert.ok(removed.items[0].items[0].scenes[1].candidates.includes(at('The Storm')), 'still in the preview, so it can be put back');

  // Renaming; the title line becoming a Group.
  const renamed = build({ [at('Chapter 1')]: { title: '  The Beginning ' }, [at('Part One: Ash')]: { title: '' } });
  assert.equal(renamed.items[0].items[0].title, 'The Beginning');
  assert.equal(renamed.items[0].title, null, 'a Group may be untitled');
  const titleAsGroup = build({ [at('The Hollow Crown')]: { role: 'group' } });
  assert.equal(titleAsGroup.titleLine, null);
  assert.deepEqual(titleAsGroup.items.map((i) => i.title), ['The Hollow Crown', 'Part One: Ash', 'Part Two'],
    'Groups of the same rank are siblings');

  // Merge: "#" is not a scene break — The Storm is one Scene, the "#" kept as text.
  const merged = build({ [at('#')]: { role: 'text' } });
  assert.deepEqual(merged.items[0].items[1].scenes.map((s) => s.paragraphs.map(paraText)), [['Rain.', '#', 'More rain.']]);

  // A role a line doesn't offer is ignored.
  assert.deepEqual(build({ [at('Rain.')]: { role: 'chapter' } }).items, structure.buildPlan(lines, {}, 'x').items);

  // Split: a possible heading made a new Scene, and one made a Chapter.
  const md = await preview('s.md', enc('## Chapter 1\n\nOne.\n\nTHE NEXT MORNING\n\nTwo.\n\nLATER\n\nThree.\n'));
  const mAt = (t) => lineAt(md.lines, t);
  const split = structure.buildPlan(md.lines, { [mAt('THE NEXT MORNING')]: { role: 'scene' }, [mAt('LATER')]: { role: 'chapter' } }, 's');
  assert.deepEqual(outline(split.items), [
    ['chapter', 'Chapter 1', [['One.'], ['THE NEXT MORNING', 'Two.']]],
    ['chapter', 'LATER', [['Three.']]],
  ]);
});

test('corrections change the payload, and nothing but the payload leaves the device — no database access before confirmation', async () => {
  const db = await seededDb();
  let calls = 0;
  const counting = new Proxy(as(db, CORA), { get: (t, k) => { if (['from', 'rpc', 'auth'].includes(k)) calls += 1; return t[k]; } });
  route.setServerClient(counting);
  const { lines, payload } = await preview('hollow.docx', buildDocx(HOLLOW_CROWN));
  const corrected = structure.planPayload(structure.buildPlan(lines, { [lineAt(lines, 'Part Two')]: { role: 'text' } }, 'x'), 'Mine');
  assert.equal(corrected.title, 'Mine');
  assert.notDeepEqual(corrected.items, payload.items);
  assert.equal(calls, 0, 'reading, detecting, correcting and building the payload touch no database');
  assert.equal((await all(db, `select id from public.projects where user_id = $1`, [CORA])).length, 1, 'only coraEmpty, from the fixture');
});

// ── 5. Prose preservation and editor fidelity ─────────────────────────────────

/**
 * Every paragraph of the payload, in reading order (front matter first), and
 * every title. Empty paragraphs are left out here: whether one is kept depends
 * on where it stands (see the blank-paragraph tests, which assert them exactly).
 */
function payloadProse(payload) {
  const out = [];
  for (const s of payload.unplaced) for (const p of s.paragraphs) out.push(paraText(p));
  const walk = (items) => {
    for (const it of items) {
      if (it.title) out.push(`#${it.title}`);
      if (it.kind === 'group') walk(it.items);
      else for (const s of it.scenes) for (const p of s.paragraphs) out.push(paraText(p));
    }
  };
  walk(payload.items);
  return out.filter((t) => t !== '');
}

/** The file's blocks, in order, as the payload should carry them: structure as titles, breaks consumed, prose as is. */
function expectedProse(lines, plan, overrides = {}) {
  return lines.filter((l) => !l.block.blank).flatMap((l) => {
    const role = structure.roleOf(l, overrides);
    if (role === 'break') return [];
    if (role === 'title' && l.index === plan.titleLine) return [];
    if (role === 'group' || role === 'chapter') return [`#${structure.titleOf(l, overrides)}`];
    return [runsText(l.block.runs)];
  });
}

test('prose preservation: every paragraph arrives once, in order, with its formatting; every Scene is a valid editor document with the editor’s word count', async () => {
  for (const [name, bytes] of [['hollow.docx', buildDocx(HOLLOW_CROWN)], ['glass.md', enc(MD)]]) {
    const { lines, plan, payload } = await preview(name, bytes);
    assert.deepEqual(payloadProse(payload), expectedProse(lines, plan), name);
    const rows = confirm.importRows(payload);
    const scenes = [...rows.manuscript.unplaced];
    const walk = (items) => items.forEach((it) => (it.kind === 'group' ? walk(it.items) : scenes.push(...it.scenes)));
    walk(rows.manuscript.items);
    for (const s of scenes) {
      assert.equal(s.word_count, tiptap.editorWordCount(s.content), `${name}: the stored count is the editor's count`);
    }
  }
  const doc = content.sceneDocument([['She ', ['never', 2], ' looked ', ['back', 3], '.\nNot once.'], { q: ['Quoted'] }, { q: ['twice'] }, []]);
  assert.deepEqual(doc, {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'She ' }, { type: 'text', text: 'never', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' looked ' }, { type: 'text', text: 'back', marks: [{ type: 'bold' }, { type: 'italic' }] },
        { type: 'text', text: '.' }, { type: 'hardBreak' }, { type: 'text', text: 'Not once.' },
      ] },
      { type: 'blockquote', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'twice' }] },
      ] },
      { type: 'paragraph' },
    ],
  });
  tiptap.editorDocument(doc);
  assert.equal(content.paragraphsWordCount([['a  b'], ['c d'], ['e\nf']]), 5, 'the editor splits on spaces only');
});

// ── 6. Confirmation: one atomic transaction ───────────────────────────────────

async function postImport(db, userId, payload, requestId = uuid()) {
  route.setServerClient(as(db, userId));
  const res = await route.POST(new Request('http://rune.test/api/manuscript-import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload, requestId }),
  }));
  return { status: res.status, body: await res.json() };
}

async function manuscriptRows(db, projectId) {
  const m = await one(db, `select id from public.manuscripts where project_id = $1`, [projectId]);
  return {
    groups: await all(db, `select id, parent_group_id, title, position from public.manuscript_groups where manuscript_id = $1 order by parent_group_id nulls first, position`, [m.id]),
    chapters: await all(db, `select c.id, c.group_id, c.title, c.position from public.chapters c
      left join public.manuscript_groups g on g.id = c.group_id
      where c.manuscript_id = $1 order by coalesce(g.position, c.position), g.position is not null, c.position`, [m.id]),
    scenes: await all(db, `select id, chapter_id, title, content, word_count, position, version from public.scenes where manuscript_id = $1 order by chapter_id nulls last, position`, [m.id]),
  };
}

/** Everything that exists before an import — which no import may change. */
const worldBefore = (db) => all(db, `
  select 'p' k, id::text, title || ':' || word_count v from public.projects
  union all select 'c', id::text, title || ':' || position || ':' || coalesce(group_id::text, '') from public.chapters
  union all select 's', id::text, md5(coalesce(content::text, '')) || ':' || word_count || ':' || version || ':' || position from public.scenes
  union all select 'w', id::text, words_added || ':' || session_date from public.writing_sessions
  order by 1, 2`);

test('confirmation creates a new Project with exactly the previewed structure, owned by the caller, in reading order', async () => {
  const db = await seededDb();
  const { payload } = await preview('hollow.docx', buildDocx(HOLLOW_CROWN));
  const r = await postImport(db, CORA, payload);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.created, true);
  const project = await one(db, `select * from public.projects where id = $1`, [r.body.projectId]);
  assert.equal(project.user_id, CORA);
  assert.equal(project.title, 'The Hollow Crown');
  const rows = await manuscriptRows(db, project.id);
  assert.deepEqual(rows.groups.map((g) => [g.title, g.position, g.parent_group_id]), [['Part One: Ash', 1, null], ['Part Two', 2, null]]);
  const [partOne, partTwo] = rows.groups;
  assert.deepEqual(rows.chapters.map((c) => [c.title, c.group_id, c.position]),
    [['Chapter 1', partOne.id, 1], ['The Storm', partOne.id, 2], ['Chapter 3', partTwo.id, 1]]);
  const byChapter = (i) => rows.scenes.filter((s) => s.chapter_id === rows.chapters[i].id);
  assert.deepEqual(byChapter(0).map((s) => [s.position, s.title, s.version]), [[0, '', 1], [1, '', 1]], 'unnamed Scenes, version 1');
  assert.deepEqual(byChapter(0)[0].content, content.sceneDocument(payload.items[0].items[0].scenes[0].paragraphs));
  const unplaced = rows.scenes.filter((s) => s.chapter_id === null);
  assert.deepEqual(unplaced.map((s) => [s.title, s.position, s.word_count]), [['Front matter', 0, 5]]);

  // The shell and the totals: placed words counted, Unplaced kept apart.
  signIn(db, CORA);
  const m = await loader.loadProjectManuscript(project.id);
  assert.deepEqual([m.groupCount, m.chapterCount, m.placedSceneCount, m.manuscriptWords, m.unplacedWords], [2, 3, 5, 21, 5]);
  assert.equal(project.word_count, 21, 'projects.word_count is the ordered total (placed Scenes only)');
  for (const s of rows.scenes) assert.equal(s.word_count, tiptap.editorWordCount(s.content));

  // Export: every placed Scene with text, in order; Unplaced never.
  const loaded = await exporter.loadManuscriptForExport(as(db, CORA), project.id);
  const plan = exporter.planManuscriptExport(loaded.chapters, loaded.scenesPerChapter, loaded.groups);
  assert.deepEqual(plan.map((e) => [e.chapter.title, e.scenes.length]), [['Chapter 1', 2], ['The Storm', 2], ['Chapter 3', 1]]);
});

test('imported prose is not writing activity: no writing session, Today’s Words, XP or analytics event is created', async () => {
  const db = await seededDb();
  const counts = async () => ({
    sessions: (await one(db, `select count(*)::int n, coalesce(sum(words_added), 0)::int w from public.writing_sessions`)),
    xp: (await one(db, `select count(*)::int n from public.xp_events`)).n,
    profile: (await one(db, `select xp, level from public.profiles where id = $1`, [CORA])),
    events: (await one(db, `select count(*)::int n from public.analytics_events`)).n,
  });
  const before = await counts();
  const { payload } = await preview('glass.md', enc(MD));
  assert.equal((await postImport(db, CORA, payload)).status, 200);
  assert.deepEqual(await counts(), before);
});

test('a retried confirmation (same request id) never imports twice; a new attempt is a new Project', async () => {
  const db = await seededDb();
  const { payload } = await preview('glass.md', enc(MD));
  const id = uuid();
  const a = await postImport(db, CORA, payload, id);
  const b = await postImport(db, CORA, payload, id);
  assert.equal(a.body.created, true);
  assert.deepEqual(b.body, { projectId: a.body.projectId, created: false });
  assert.equal((await all(db, `select id from public.projects where user_id = $1`, [CORA])).length, 2, 'coraEmpty and the one import');
  const c = await postImport(db, CORA, payload);
  assert.notEqual(c.body.projectId, a.body.projectId);
});

test('atomic: a failure in the middle of the import leaves nothing behind — no Project, Group, Chapter or Scene', async () => {
  const db = await seededDb();
  const before = await worldBefore(db);
  const { payload } = await preview('hollow.docx', buildDocx(HOLLOW_CROWN));
  // Fail the 4th Scene insert, after the Project, Groups, Chapters and three Scenes are written.
  await db.exec(`
    create sequence public.test_scene_inserts;
    create function public.test_fail_fourth_scene() returns trigger language plpgsql as $$
    begin
      if nextval('public.test_scene_inserts') = 4 then raise exception 'simulated failure'; end if;
      return new;
    end $$;
    create trigger test_fail_fourth_scene before insert on public.scenes for each row execute function public.test_fail_fourth_scene();`);
  const r = await postImport(db, CORA, payload);
  assert.equal(r.status, 422, JSON.stringify(r.body));
  assert.match(r.body.error, /Nothing was created/);
  assert.equal((await one(db, `select nextval('public.test_scene_inserts')::int n`)).n, 5, 'the failure really happened mid-import');
  assert.deepEqual(await worldBefore(db), before);
  assert.equal((await one(db, `select count(*)::int n from public.manuscript_groups`)).n, 0);
  // Retry (the file and preview are still in hand) after the fault is gone.
  await db.exec(`drop trigger test_fail_fourth_scene on public.scenes`);
  const retry = await postImport(db, CORA, payload);
  assert.equal(retry.status, 200);
});

test('refused imports write nothing: invalid structure, empty, too deep, over the free word limit, malformed body, signed out', async () => {
  const db = await seededDb();
  const before = await worldBefore(db);
  const scene = (words) => ({ title: null, paragraphs: [[Array.from({ length: words }, (_, i) => `w${i}`).join(' ')]] });
  const cases = [
    { title: 'x', items: [{ kind: 'chapter', title: 'A', scenes: [] }], unplaced: [] },
    { title: 'x', items: [], unplaced: [] },
    { title: '   ', items: [{ kind: 'chapter', title: 'A', scenes: [scene(1)] }], unplaced: [] },
    { title: 'x', items: [{ kind: 'group', title: 'g', items: [{ kind: 'group', title: 'g', items: [{ kind: 'group', title: 'g', items: [{ kind: 'group', title: 'g', items: [{ kind: 'group', title: 'g', items: [] }] }] }] }] }], unplaced: [] },
    { title: 'x', items: [{ kind: 'scene', title: 'A' }], unplaced: [] },
    { title: 'x', items: [{ kind: 'chapter', title: 'A', scenes: [{ title: null, paragraphs: [[['bad', 99]]] }] }], unplaced: [] },
  ];
  for (const payload of cases) {
    const r = await postImport(db, CORA, payload);
    assert.equal(r.status, 422, JSON.stringify(payload).slice(0, 80));
    assert.match(r.body.error, /Nothing was created/);
  }
  // dana is a new free writer (starter_2k): 2,500 words would pass her limit.
  const big = { title: 'Big', items: [{ kind: 'chapter', title: 'A', scenes: [scene(2500)] }], unplaced: [] };
  const blocked = await postImport(db, DANA, big);
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.wordLimitBlocked, true);
  assert.match(blocked.body.error, /2,000-word limit/);
  // Malformed and unauthenticated requests.
  route.setServerClient(as(db, CORA));
  const bad = await route.POST(new Request('http://rune.test/x', { method: 'POST', body: '{not json' }));
  assert.equal(bad.status, 400);
  const huge = await route.POST(new Request('http://rune.test/x', { method: 'POST', body: 'x'.repeat(4 * 1024 * 1024 + 1) }));
  assert.equal(huge.status, 413);
  route.setServerClient(createSupabaseAdapter(db, { role: 'anon' }));
  const anon = await route.POST(new Request('http://rune.test/x', { method: 'POST', body: JSON.stringify({ payload: big }) }));
  assert.equal(anon.status, 401);
  assert.deepEqual(await worldBefore(db), before, 'nothing written by any refusal');
  // Under the limit, a free writer can import.
  assert.equal((await postImport(db, DANA, { ...big, items: [{ kind: 'chapter', title: 'A', scenes: [scene(300)] }] })).status, 200);
});

// ── 7. Ownership and isolation ────────────────────────────────────────────────

test('isolation: an import is always the caller’s new Project — ids in the payload are ignored, other writers see nothing, internals are closed', async () => {
  const db = await seededDb();
  const hollowChapter = (await one(db, `select c.id from public.chapters c join public.manuscripts m on m.id = c.manuscript_id where m.project_id = $1 limit 1`, [HOLLOW])).id;
  const before = await worldBefore(db);
  const payload = {
    title: 'Sneaky', project_id: HOLLOW,
    items: [{ kind: 'chapter', id: hollowChapter, manuscript_id: 'x', title: 'Mine', scenes: [{ id: hollowChapter, chapter_id: hollowChapter, title: null, paragraphs: [['Words here.']] }] }],
    unplaced: [],
  };
  const r = await postImport(db, BRAM, payload);
  assert.equal(r.status, 200);
  const created = await manuscriptRows(db, r.body.projectId);
  assert.notEqual(created.chapters[0].id, hollowChapter);
  assert.equal((await one(db, `select user_id from public.projects where id = $1`, [r.body.projectId])).user_id, BRAM);
  // Everything that existed is exactly as it was (the new rows aside).
  const after = await worldBefore(db);
  const newIds = new Set([r.body.projectId, ...created.chapters.map((c) => c.id), ...created.scenes.map((s) => s.id)]);
  assert.deepEqual(after.filter((row) => !newIds.has(row.id)), before);

  // alice can't see bram's import.
  const aliceSees = await as(db, ALICE).from('projects').select('id').eq('id', r.body.projectId);
  assert.deepEqual(aliceSees.data, []);
  const aliceScenes = await as(db, ALICE).from('scenes').select('id').eq('id', created.scenes[0].id);
  assert.deepEqual(aliceScenes.data, []);

  // Clients may call only the checked entry point, and anon not even that.
  const call = (userId, fn, args) => (userId ? as(db, userId) : createSupabaseAdapter(db, { role: 'anon' })).rpc(fn, args);
  const internal = await call(ALICE, 'import_manuscript_items', { p_manuscript_id: created.chapters[0].id, p_parent_group_id: null, p_items: [] });
  assert.match(internal.error?.message ?? '', /permission denied/);
  const shape = await call(ALICE, 'import_manuscript_shape', { p_items: [], p_depth: 0 });
  assert.match(shape.error?.message ?? '', /permission denied/);
  const anon = await call(null, 'import_manuscript_checked', { p_title: 'x', p_manuscript: { items: [], unplaced: [] }, p_request_id: null });
  assert.match(anon.error?.message ?? '', /permission denied/);
  // bram's request id replayed by cora creates cora's own Project, never returns bram's.
  const id = uuid();
  const mine = await postImport(db, BRAM, { title: 'B', items: [{ kind: 'chapter', title: 'A', scenes: [{ title: null, paragraphs: [['x']] }] }], unplaced: [] }, id);
  const theirs = await postImport(db, CORA, { title: 'A', items: [{ kind: 'chapter', title: 'A', scenes: [{ title: null, paragraphs: [['y']] }] }], unplaced: [] }, id);
  assert.notEqual(theirs.body.projectId, mine.body.projectId);
  assert.equal(theirs.body.created, true);
});

// ── 8. A realistic manuscript ─────────────────────────────────────────────────

/** A deterministic ~110,000-word novel: 4 Parts, 48 Chapters, 2–9 Scenes each, some emphasis and line breaks. */
function novel() {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const WORDS = 'the a she he they road glass bell light cold night river stone quiet letter hand door window fire iron ash crown hollow storm morning never always under over through beyond'.split(' ');
  const sentence = () => {
    const n = 8 + Math.floor(rand() * 15);
    const w = Array.from({ length: n }, () => WORDS[Math.floor(rand() * WORDS.length)]);
    w[0] = w[0][0].toUpperCase() + w[0].slice(1);
    return `${w.join(' ')}.`;
  };
  const paras = [{ style: 'Title', runs: ['The Long Glass Road'] }];
  let words = 0;
  let scenes = 0;
  for (let part = 1; part <= 4; part++) {
    paras.push({ style: 'Heading1', runs: [`Part ${['One', 'Two', 'Three', 'Four'][part - 1]}`] });
    for (let c = 1; c <= 12; c++) {
      paras.push({ style: 'Heading2', runs: [`Chapter ${(part - 1) * 12 + c}`] });
      const sceneCount = 2 + Math.floor(rand() * 8);
      for (let s = 0; s < sceneCount; s++) {
        if (s > 0) paras.push(s % 3 === 0 ? '#' : '* * *');
        scenes += 1;
        const paraCount = 4 + Math.floor(rand() * 6);
        for (let p = 0; p < paraCount; p++) {
          const text = Array.from({ length: 3 + Math.floor(rand() * 4) }, sentence).join(' ');
          words += text.split(' ').length;
          if (rand() < 0.15) {
            const cut = text.indexOf(' ', 20);
            paras.push({ runs: [text.slice(0, cut), { t: ' in italics', i: true }, { br: true }, text.slice(cut + 1)] });
            words += 2;
          } else paras.push(text);
          if (rand() < 0.1) paras.push('');
        }
      }
    }
  }
  return { paras, words, scenes };
}

test('a realistic manuscript: ~110,000 words, 4 Parts, 48 Chapters, hundreds of Scenes — read, previewed and imported whole', async () => {
  const { paras, words, scenes } = novel();
  assert.ok(words > 90000 && words < 130000, `fixture size ${words}`);
  const t0 = performance.now();
  const bytes = buildDocx(paras);
  const { plan, lines, payload } = await preview('long.docx', bytes);
  const readMs = performance.now() - t0;
  assert.deepEqual([plan.groups, plan.chapters, plan.scenes, plan.words], [4, 48, scenes, words]);
  assert.deepEqual(payloadProse(payload), expectedProse(lines, plan));
  const body = JSON.stringify({ payload, requestId: uuid() });
  assert.ok(body.length < 4 * 1024 * 1024, `payload ${body.length} bytes fits the route's cap`);

  const db = await seededDb();
  const before = await worldBefore(db);
  const t1 = performance.now();
  const r = await postImport(db, CORA, payload);
  const importMs = performance.now() - t1;
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const rows = await manuscriptRows(db, r.body.projectId);
  assert.deepEqual([rows.groups.length, rows.chapters.length, rows.scenes.length], [4, 48, scenes]);
  assert.equal((await one(db, `select word_count from public.projects where id = $1`, [r.body.projectId])).word_count, words);
  assert.equal(rows.scenes.reduce((n, s) => n + s.word_count, 0), words);
  for (const s of rows.scenes.slice(0, 40)) assert.equal(s.word_count, tiptap.editorWordCount(s.content));
  signIn(db, CORA);
  const m = await loader.loadProjectManuscript(r.body.projectId);
  assert.equal(m.manuscriptWords, words);
  const newIds = new Set([r.body.projectId, ...rows.chapters.map((c) => c.id), ...rows.scenes.map((s) => s.id)]);
  assert.deepEqual((await worldBefore(db)).filter((row) => !newIds.has(row.id)), before);
  // Markdown of the same novel imports to the same shape.
  const md = paras.map((p) => {
    if (typeof p === 'string') return p;
    if (p.style === 'Title') return `# ${p.runs[0]}`;
    if (p.style === 'Heading1') return `## ${p.runs[0]}`;
    if (p.style === 'Heading2') return `### ${p.runs[0]}`;
    return p.runs.map((x) => (typeof x === 'string' ? x : x.br ? '  \n' : `*${x.t.trim()}* `)).join('');
  }).join('\n\n');
  const mdPlan = (await preview('long.md', enc(md))).plan;
  assert.deepEqual([mdPlan.groups, mdPlan.chapters, mdPlan.scenes], [4, 48, scenes]);
  console.log(`# large manuscript: ${words} words, ${scenes} scenes — read+preview ${readMs.toFixed(0)} ms, import ${importMs.toFixed(0)} ms (PGlite), payload ${(body.length / 1024).toFixed(0)} KiB`);
});
