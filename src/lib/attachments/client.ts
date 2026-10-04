import type { WorkspaceAttachment } from "@/lib/types";
import { displayDerivative, imageUploadProblem } from "@/lib/rune2/attachments";

// Uploading an image from the browser (Milestone 22C): read its size, make
// a browser-sized derivative of a large one (so a card never decodes a
// 6,000-pixel photograph), send both to /api/attachments, get the attachment
// back. Nothing here knows about the Canvas: the surface places what comes
// back. Never logs the file.

export type PreparedImage = {
  file: Blob;
  fileName: string;
  width: number;
  height: number;
  display: { blob: Blob; width: number; height: number } | null;
};

/** The image files in a paste or a drop, in order; nothing else. */
export function imageFilesOf(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const out: File[] = [];
  for (const item of dt.items ?? []) {
    if (item.kind === "file") {
      const f = item.getAsFile();
      if (f && f.type.startsWith("image/")) out.push(f);
    }
  }
  if (out.length === 0) for (const f of dt.files ?? []) if (f.type.startsWith("image/")) out.push(f);
  return out;
}

async function decode(blob: Blob): Promise<{ width: number; height: number; bitmap: ImageBitmap | null }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { width: bitmap.width, height: bitmap.height, bitmap };
    } catch {
      // Fall through to an <img>.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image couldn’t be read."));
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, bitmap: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Reads an image file and, when it is large, draws a smaller copy for cards.
 * A GIF keeps no derivative (it may move). Throws with a message to show
 * when the file isn't an acceptable image.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const problem = imageUploadProblem(file);
  if (problem) throw new Error(problem);
  const { width, height, bitmap } = await decode(file);
  if (!(width > 0 && height > 0)) throw new Error("That image couldn’t be read.");
  let display: PreparedImage["display"] = null;
  const target = file.type === "image/gif" ? null : displayDerivative(width, height);
  if (target && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      let source: CanvasImageSource | null = bitmap;
      if (!source) {
        const url = URL.createObjectURL(file);
        try {
          source = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("That image couldn’t be read."));
            el.src = url;
          });
          ctx.drawImage(source, 0, 0, target.width, target.height);
        } finally {
          URL.revokeObjectURL(url);
        }
      } else ctx.drawImage(source, 0, 0, target.width, target.height);
      // PNG keeps transparency; everything else becomes a good JPEG.
      const type = file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
      if (blob && blob.size > 0 && blob.size < file.size) display = { blob, width: target.width, height: target.height };
    }
  }
  bitmap?.close?.();
  return { file, fileName: file.name, width, height, display };
}

/** Sends a prepared image to the server; resolves to the Project's new attachment. Throws with a message to show. */
export async function uploadImage(projectId: string, prepared: PreparedImage, fetchImpl: typeof fetch = fetch): Promise<WorkspaceAttachment> {
  const form = new FormData();
  form.set("projectId", projectId);
  form.set("file", prepared.file, prepared.fileName);
  form.set("width", String(prepared.width));
  form.set("height", String(prepared.height));
  if (prepared.display) {
    form.set("display", prepared.display.blob, "display");
    form.set("displayWidth", String(prepared.display.width));
    form.set("displayHeight", String(prepared.display.height));
  }
  let res: Response;
  try {
    res = await fetchImpl("/api/attachments", { method: "POST", body: form });
  } catch {
    throw new Error("The image couldn’t be uploaded. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as { attachment?: WorkspaceAttachment; error?: string } | null;
  if (!res.ok || !body?.attachment) throw new Error(body?.error ?? "The image couldn’t be uploaded.");
  return body.attachment;
}
