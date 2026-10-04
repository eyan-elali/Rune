// Hands a file made on this device to the browser to save. Nothing is
// uploaded: the bytes go from memory to the writer's Downloads.
//
// A PreparedDownload owns one object URL for its file: start() asks the
// browser to save it (a hidden <a download> click — allowed without a fresh
// click from the writer, since the file is already in memory), and the same
// URL stays valid for a visible "Download" link as a fallback until release()
// frees the memory.

export type PreparedDownload = {
  url: string;
  fileName: string;
  size: number;
  /** Starts the download. Throws if the browser refuses. */
  start: () => void;
  /** Frees the file's memory; the URL stops working. Safe to call twice. */
  release: () => void;
};

export function prepareDownload(bytes: Uint8Array, fileName: string, mime: string): PreparedDownload {
  if (bytes.length === 0) throw new Error("download: empty file");
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  let released = false;
  return {
    url,
    fileName,
    size: bytes.length,
    start() {
      if (released) throw new Error("download: already released");
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      try {
        a.click();
      } finally {
        a.remove();
      }
    },
    release() {
      if (released) return;
      released = true;
      URL.revokeObjectURL(url);
    },
  };
}

/** Saves a file now, and frees it once the browser has had ample time to start the download. */
export function saveFile(bytes: Uint8Array, fileName: string, mime: string): void {
  const download = prepareDownload(bytes, fileName, mime);
  try {
    download.start();
  } catch (e) {
    download.release();
    throw e;
  }
  setTimeout(download.release, 60_000);
}
