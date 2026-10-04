import { resolveBlankParagraphs } from "./blanks";
import { parseDocx } from "./docx";
import { parseMarkdown } from "./markdown";
import { parseText, type TextOptions } from "./text";
import type { ParsedFile } from "./types";
import { ImportFileError } from "./zip";

// Reads a chosen file on the writer's own device. Nothing is uploaded here:
// the file's bytes never leave the browser, and only the structure the
// writer confirms is sent (see actions/manuscriptImport.ts).

export { ImportFileError };

export const IMPORT_ACCEPT = ".docx,.md,.markdown,.txt";
const MAX_BYTES = 40 * 1024 * 1024;

export type ImportFormat = ParsedFile["format"];

export function formatOf(fileName: string): ImportFormat | null {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "docx") return "docx";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "txt") return "txt";
  return null;
}

/** Text as UTF-8; a file that isn't valid UTF-8 is read as Windows-1252 (older Windows text files). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function parseImportFile(
  fileName: string,
  bytes: Uint8Array,
  options: TextOptions = {}
): Promise<ParsedFile & { hardWrapped?: boolean }> {
  const format = formatOf(fileName);
  if (!format) throw new ImportFileError("Sutura can import .docx, .md and .txt files.");
  if (bytes.byteLength > MAX_BYTES) throw new ImportFileError("This file is too large to import (the limit is 40 MB).");
  if (bytes.byteLength === 0) throw new ImportFileError("This file is empty.");
  let parsed: ParsedFile & { hardWrapped?: boolean };
  if (format === "docx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new ImportFileError(
        "This isn’t a .docx file. If it’s an older Word document (.doc), open it in Word and save it as .docx."
      );
    }
    parsed = await parseDocx(bytes);
  } else if (format === "md") parsed = parseMarkdown(decodeText(bytes));
  else parsed = parseText(decodeText(bytes), options);
  parsed = { ...parsed, blocks: resolveBlankParagraphs(parsed.blocks) };
  if (parsed.blocks.every((b) => b.kind === "paragraph" && b.blank)) {
    throw new ImportFileError("Sutura couldn’t find any text in this file.");
  }
  return parsed;
}

/** The file name without its extension: the Project title when the file suggests none. */
export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Imported manuscript";
}
