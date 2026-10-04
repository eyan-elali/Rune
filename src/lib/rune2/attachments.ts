import type { WorkspaceAttachment } from "@/lib/types";

// Project attachments (Milestone 22C, migration 047) — the pure rules: what
// an image upload may be, how large, when a browser-sized derivative is
// made, where bytes are keyed, and the URL a card loads them from. Shared by
// the upload route, the Canvas and the tests; no I/O here.
//
// An attachment belongs to a Project and lives while anything references it
// (an image placement on any Canvas, in Trash included); one nothing
// references is kept for ATTACHMENT_GRACE_HOURS, then the server's sweep
// deletes its bytes and its row (lib/attachments/server.ts).

/** Common, browser-safe image formats. SVG is deliberately not accepted (it is a document, not a picture). */
export const ACCEPTED_IMAGE_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const ACCEPTED_IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Above this many pixels on its longer edge, an image gets a display derivative for its cards. */
export const DISPLAY_MAX_EDGE = 1600;
/** The bucket the server keeps attachments in (private; created by the server when first needed). */
export const ATTACHMENT_BUCKET = "workspace-attachments";
/** How long an unreferenced attachment is kept before the sweep may remove it. */
export const ATTACHMENT_GRACE_HOURS = 24;

const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export function isAcceptedImageType(mime: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(mime.toLowerCase());
}

/** The file extension an attachment's bytes take (for a backup's file name). */
export function attachmentExtension(mime: string): string {
  return EXTENSION[mime.toLowerCase()] ?? "bin";
}

/**
 * Whether these bytes begin the way a file of this type does (PNG, JPEG,
 * GIF, WebP signatures). The declared type comes from the browser; the
 * server trusts it only when the bytes agree, so nothing but a picture is
 * ever stored or served as one.
 */
export function imageBytesMatchType(mime: string, bytes: Uint8Array): boolean {
  const at = (i: number) => bytes[i] ?? -1;
  switch (mime.toLowerCase()) {
    case "image/png":
      return at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a;
    case "image/jpeg":
      return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
    case "image/gif":
      return at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38 && (at(4) === 0x37 || at(4) === 0x39) && at(5) === 0x61;
    case "image/webp":
      return at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50;
    default:
      return false;
  }
}

/** Why a file can't be an image attachment, or null when it can. */
export function imageUploadProblem(file: { type: string; size: number }): string | null {
  if (!isAcceptedImageType(file.type)) return "Sutura can hold PNG, JPEG, GIF and WebP images.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_IMAGE_BYTES) return `An image can be up to ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`;
  return null;
}

/** Whether an image this size needs a browser-sized derivative, and the derivative's size. */
export function displayDerivative(width: number, height: number, maxEdge = DISPLAY_MAX_EDGE): { width: number; height: number } | null {
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return null;
  const scale = maxEdge / edge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Where an attachment's bytes live in the bucket: by Project, then by id, so a key never collides and says whose it is. */
export function storageKeyFor(projectId: string, attachmentId: string, variant: "original" | "display", mime: string): string {
  return `${projectId}/${attachmentId}/${variant}.${attachmentExtension(mime)}`;
}

/** The URL a card loads an attachment's bytes from — the server, under the writer's own session. */
export function attachmentUrl(attachmentId: string, variant: "original" | "display" = "original"): string {
  return `/api/attachments/${attachmentId}${variant === "display" ? "?variant=display" : ""}`;
}

/** The variant a card should show: the display derivative when there is one. */
export function cardVariant(a: Pick<WorkspaceAttachment, "display_key">): "original" | "display" {
  return a.display_key ? "display" : "original";
}

/** An attachment's aspect ratio (width / height), or null when unknown. */
export function aspectOf(a: Pick<WorkspaceAttachment, "width" | "height"> | null | undefined): number | null {
  if (!a || !a.width || !a.height) return null;
  return a.width / a.height;
}

/** A file name safe to show and store: trimmed, never blank, at most 255 characters. */
export function cleanFileName(name: string): string {
  const trimmed = name.replace(/[\u0000-\u001f]/g, "").trim();
  return (trimmed || "image").slice(0, 255);
}
