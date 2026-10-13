"use client";

import { useSyncExternalStore } from "react";

// The credits this tab has made (useSceneEditor), as they are made — the
// same words, ids and local dates it sends to the server (or queues offline).
// A read-only mirror for the Widgets board: Today's Words is the server's
// total at its last read plus the credits made here since, so it moves with
// each save without a request per keystroke, and a credit queued offline is
// shown at once and reconciled when the queue has replayed. Nothing here
// touches a save, the queue or the ledger.

export type LoggedCredit = {
  id: string;
  projectId: string | null;
  /** The device's local calendar date the credit was made on. */
  date: string;
  words: number;
  /** Queued on this device (offline), not yet known to be on the server. */
  pending: boolean;
  /** When it was logged, for reconciling against a later server read. */
  at: number;
};

type Snapshot = { version: number; credits: readonly LoggedCredit[] };

let credits: LoggedCredit[] = [];
let snapshot: Snapshot = { version: 0, credits };
const listeners = new Set<() => void>();

function publish() {
  snapshot = { version: snapshot.version + 1, credits };
  for (const fn of listeners) fn();
}

export function logWritingCredit(credit: Omit<LoggedCredit, "at">): void {
  credits = [...credits, { ...credit, at: Date.now() }];
  publish();
}

/**
 * The server has been read at `at`: credits sent online before then are in
 * its totals and are let go. A credit queued offline is kept until the
 * queue no longer holds it (`stillQueued`), whichever read comes first.
 */
export function reconcileWritingCredits(at: number, stillQueued: (id: string) => boolean): void {
  const kept = credits.filter((c) => (c.pending ? stillQueued(c.id) : c.at > at));
  if (kept.length === credits.length) return;
  credits = kept;
  publish();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const get = () => snapshot;

/** Every credit this tab has logged and not yet reconciled away. */
export function useLoggedWritingCredits(): readonly LoggedCredit[] {
  return useSyncExternalStore(subscribe, get, get).credits;
}
