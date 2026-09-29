// Writes a ZIP archive (a .docx is one; so is a Project backup) — the
// counterpart of lib/import/zip.ts, with no dependency: entries are deflated
// with the platform's CompressionStream ("deflate-raw", in every current
// browser and in Node), or stored when it isn't available. UTF-8 names
// (general-purpose flag bit 11). Not ZIP64: an archive stays under 4 GB and
// 65,535 entries, far beyond any Project.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

type Written = { name: Uint8Array; crc: number; method: number; compressed: number; size: number; offset: number };

/** DOS date and time of a moment (local time, two-second precision). */
function dosDateTime(at: Date): { date: number; time: number } {
  const year = Math.max(1980, at.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
  };
}

export class ZipWriter {
  private chunks: Uint8Array[] = [];
  private entries: Written[] = [];
  private offset = 0;
  private names = new Set<string>();
  private readonly stamp: { date: number; time: number };
  private readonly encoder = new TextEncoder();

  constructor(at: Date = new Date()) {
    this.stamp = dosDateTime(at);
  }

  /** Adds one file. Text is written as UTF-8. Names are unique; "/" separates folders. */
  async add(name: string, content: string | Uint8Array, options: { store?: boolean } = {}): Promise<void> {
    if (this.names.has(name)) throw new Error(`zip: duplicate entry ${name}`);
    this.names.add(name);
    const data = typeof content === "string" ? this.encoder.encode(content) : content;
    const deflated = options.store || data.length < 64 ? null : await deflateRaw(data);
    const useDeflate = deflated !== null && deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const nameBytes = this.encoder.encode(name);
    const entry: Written = {
      name: nameBytes,
      crc: crc32(data),
      method: useDeflate ? 8 : 0,
      compressed: body.length,
      size: data.length,
      offset: this.offset,
    };
    const header = new Uint8Array(30 + nameBytes.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // version needed: 2.0
    v.setUint16(6, 0x0800, true); // UTF-8 names
    v.setUint16(8, entry.method, true);
    v.setUint16(10, this.stamp.time, true);
    v.setUint16(12, this.stamp.date, true);
    v.setUint32(14, entry.crc, true);
    v.setUint32(18, entry.compressed, true);
    v.setUint32(22, entry.size, true);
    v.setUint16(26, nameBytes.length, true);
    v.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    this.push(header);
    this.push(body);
    this.entries.push(entry);
  }

  private push(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.offset += bytes.length;
    if (this.offset > 0xfffffff0) throw new Error("zip: archive too large");
  }

  /** The finished archive. The writer can't be added to afterwards. */
  finish(): Uint8Array {
    const start = this.offset;
    for (const e of this.entries) {
      const rec = new Uint8Array(46 + e.name.length);
      const v = new DataView(rec.buffer);
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 0x0314, true); // made by: Unix, 2.0
      v.setUint16(6, 20, true);
      v.setUint16(8, 0x0800, true);
      v.setUint16(10, e.method, true);
      v.setUint16(12, this.stamp.time, true);
      v.setUint16(14, this.stamp.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.compressed, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.name.length, true);
      v.setUint32(38, (0o100644 << 16) >>> 0, true); // a regular file, rw-r--r--
      v.setUint32(42, e.offset, true);
      rec.set(e.name, 46);
      this.push(rec);
    }
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, this.offset - start, true);
    v.setUint32(16, start, true);
    this.push(end);
    const out = new Uint8Array(this.offset);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    this.chunks = [];
    return out;
  }
}
