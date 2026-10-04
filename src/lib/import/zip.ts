// Reads named entries out of a ZIP archive (a .docx is one), using the
// platform's DecompressionStream for "deflate-raw" — no dependency, and the
// same code in the browser and in Node. Stored and deflated entries only;
// encrypted and ZIP64 archives are refused with a clear message. An entry's
// inflated size is capped, so a hostile archive cannot exhaust memory.

export class ImportFileError extends Error {}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

type Entry = { method: number; flags: number; compressedSize: number; size: number; offset: number };

function centralDirectory(bytes: Uint8Array): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new ImportFileError("This file isn’t a valid Word document (.docx).");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new ImportFileError("This Word document is too large to read here.");
  const decoder = new TextDecoder();
  const entries = new Map<string, Entry>();
  for (let k = 0; k < count; k++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) {
      throw new ImportFileError("This Word document appears to be damaged.");
    }
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, {
      flags: view.getUint16(at + 8, true),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      offset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new ImportFileError("This Word document is too large to import.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export type ZipReader = {
  has: (name: string) => boolean;
  /** The entry's text (UTF-8), or null when the archive has no such entry. */
  text: (name: string) => Promise<string | null>;
  /** The entry's bytes, or null when the archive has no such entry. */
  bytes: (name: string) => Promise<Uint8Array | null>;
};

export function openZip(bytes: Uint8Array): ZipReader {
  const entries = centralDirectory(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read = async (name: string): Promise<Uint8Array | null> => {
    const e = entries.get(name);
    if (!e) return null;
    if (e.flags & 1) throw new ImportFileError("This Word document is password-protected. Save an unprotected copy and try again.");
    if (e.offset + 30 > bytes.length || view.getUint32(e.offset, true) !== LOCAL) {
      throw new ImportFileError("This Word document appears to be damaged.");
    }
    const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
    const data = bytes.subarray(start, start + e.compressedSize);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRaw(data, MAX_ENTRY_BYTES);
    throw new ImportFileError("This Word document uses a compression Sutura can’t read.");
  };
  return {
    has: (name) => entries.has(name),
    async text(name) {
      const raw = await read(name);
      return raw === null ? null : new TextDecoder("utf-8").decode(raw);
    },
    bytes: read,
  };
}
