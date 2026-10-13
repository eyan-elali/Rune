import { readRecent, readWidgetLayout, serializeWidgetLayout, type WidgetLayout } from "./widgets";

// Where the Widgets board is kept: on this device, per writer (lib/rune2/
// widgets.ts decides what it means). Ways of looking at the screen, never
// content — ids and sizes — and nothing here is authoritative: without
// storage the writer sees the default board every time, which is correct.
// Not shared across devices (that would need server-side state; this pass
// deliberately adds no schema). The Recent list is the same kind of thing,
// kept per writer and Project.
//
// Guarded like resumeLocation.ts: a browser without storage (private mode,
// blocked site data) still works.

const LAYOUT_PREFIX = "rune:widgets:";
const RECENT_PREFIX = "rune:recent:";

export function widgetLayoutKey(userId: string): string {
  return `${LAYOUT_PREFIX}${userId}`;
}

export function recentKey(userId: string, projectId: string): string {
  return `${RECENT_PREFIX}${userId}:${projectId}`;
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the board is remembered for this visit only.
  }
}

export function readStoredWidgetLayout(userId: string): WidgetLayout {
  return readWidgetLayout(readJson(widgetLayoutKey(userId)));
}

export function writeStoredWidgetLayout(userId: string, layout: WidgetLayout): void {
  writeJson(widgetLayoutKey(userId), serializeWidgetLayout(layout));
}

export function readStoredRecent(userId: string, projectId: string): string[] {
  return readRecent(readJson(recentKey(userId, projectId)));
}

export function writeStoredRecent(userId: string, projectId: string, ids: readonly string[]): void {
  writeJson(recentKey(userId, projectId), ids);
}
