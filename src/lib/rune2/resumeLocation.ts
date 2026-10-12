import type { TabState } from "@/lib/rune2/workingSet";

// Where the writer was in each Project — its open tabs and the active one —
// kept on this device per writer and Project, so a refresh, a reopened
// browser, signing in again or coming back from another Project lands where
// they left off (resumedTabs decides what of it still stands). Temporary UI
// recovery only: object ids, never titles or prose, and nothing here is
// authoritative — without storage, the Project simply opens on its
// Manuscript overview. Not shared across devices (that would need
// server-side state).

const PREFIX = "rune:resume:";

function storageKey(userId: string, projectId: string) {
  return `${PREFIX}${userId}:${projectId}`;
}

export function readResumeLocation(userId: string, projectId: string): unknown {
  try {
    const raw = window.localStorage.getItem(storageKey(userId, projectId));
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeResumeLocation(userId: string, projectId: string, state: TabState): void {
  try {
    window.localStorage.setItem(storageKey(userId, projectId), JSON.stringify({ tabs: state.tabs, active: state.active }));
  } catch {
    // Storage unavailable: the Project opens on its overview next time.
  }
}
