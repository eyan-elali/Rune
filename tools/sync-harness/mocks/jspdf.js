// Recording jsPDF stand-in for running the REAL manuscript export
// (src/lib/export/projectExport.ts + tiptapToPdf.ts) in tests. It implements
// only the methods the export calls, draws nothing, and records every string
// passed to text() in order. Lines never wrap (splitTextToSize returns its
// input), so each whitespace-free token the export draws arrives intact.
//
// The recording lives on globalThis because the bundled export and the test
// file load separate copies of this module.
const recorder = (globalThis.__runeTestPdf ??= { texts: [], saved: [] });

export function resetPdfRecording() {
  recorder.texts.length = 0;
  recorder.saved.length = 0;
}

export default class jsPDF {
  addPage() {}
  line() {}
  setDrawColor() {}
  setFont() {}
  setFontSize() {}
  setLineWidth() {}
  setTextColor() {}
  getTextWidth(s) { return String(s).length * 0.1; }
  splitTextToSize(s) { return [String(s)]; }
  text(t) { recorder.texts.push(Array.isArray(t) ? t.join(' ') : String(t)); }
  save(name) { recorder.saved.push(name); }
  setProperties() {}
  output() { return new ArrayBuffer(0); }
}
