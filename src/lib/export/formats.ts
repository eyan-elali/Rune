import { renderDocx } from "./docx";
import { renderMarkdown } from "./markdown";
import type { ExportDocument } from "./plan";
import { renderText } from "./text";

// The export formats, in the order the dialog offers them, and the one place
// a document becomes a file: its bytes, type and name.

export type ExportFormat = "docx" | "pdf" | "md" | "txt";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; extension: string; mime: string; hint: string }[] = [
  {
    id: "docx",
    label: "Word document",
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    hint: "For editors and beta readers. Opens in Word, Pages, Google Docs and LibreOffice.",
  },
  { id: "pdf", label: "PDF", extension: "pdf", mime: "application/pdf", hint: "A fixed, printable manuscript for reading." },
  { id: "md", label: "Markdown", extension: "md", mime: "text/markdown;charset=utf-8", hint: "Plain text with light formatting marks." },
  { id: "txt", label: "Plain text", extension: "txt", mime: "text/plain;charset=utf-8", hint: "Just the words, no formatting." },
];

export type ExportFile = { bytes: Uint8Array; mime: string; extension: string };

export async function renderExport(doc: ExportDocument, format: ExportFormat): Promise<ExportFile> {
  const meta = EXPORT_FORMATS.find((f) => f.id === format)!;
  let bytes: Uint8Array;
  if (format === "docx") bytes = await renderDocx(doc);
  else if (format === "pdf") bytes = await (await import("./pdf")).renderPdf(doc);
  else bytes = new TextEncoder().encode(format === "md" ? renderMarkdown(doc) : renderText(doc));
  return { bytes, mime: meta.mime, extension: meta.extension };
}

/** A name every file system accepts: no path separators, reserved or control characters, not too long. */
export function safeFileName(name: string, fallback = "Manuscript"): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  return (cleaned || fallback).slice(0, 120).trim();
}

/** The name an export is offered under, without extension: "The Hollow", "The Hollow – Chapter 3". */
export function defaultExportName(doc: ExportDocument): string {
  const project = doc.projectTitle.trim() || "Untitled";
  return safeFileName(doc.scope === "manuscript" ? project : `${project} – ${doc.subject}`);
}

/** The file name with the format's extension (an extension the writer typed is replaced). */
export function exportFileName(name: string, format: ExportFormat): string {
  const ext = EXPORT_FORMATS.find((f) => f.id === format)!.extension;
  const base = safeFileName(name.replace(/\.(docx|pdf|md|markdown|txt)$/i, ""));
  return `${base}.${ext}`;
}
