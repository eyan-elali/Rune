"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The document status ("3,319 words · Saved") is a shell element, not part of
// the writing surface's layout: it is anchored at the bottom-right of the
// content column (.r2-status, Rune2Shell) and keeps that exact place whether
// the contextual panel is closed, showing the Inspector or showing Revision
// Notes — the panel stops above it. The writing surfaces still own what the
// status *says*: they render <DocStatus> where they always did, and it is
// carried to the shell's slot. Only one surface is mounted with a status at a
// time (Rune2Editor without a target and WorkspacePages without a Page render
// nothing), so the slot never holds two.
//
// Without a slot (a surface mounted outside the shell) the status renders in
// place, so nothing depends on the shell being there.

const StatusSlotContext = createContext<HTMLElement | null>(null);

export function StatusSlotProvider({ slot, children }: { slot: HTMLElement | null; children: ReactNode }) {
  return <StatusSlotContext.Provider value={slot}>{children}</StatusSlotContext.Provider>;
}

// Not a live region: the word count changes with every word typed and the
// save state with every pause, and a screen reader would read both out
// endlessly. What a writer must hear is announced: a problem is a role="alert"
// where it is written, and `announce` — the save state when it is something
// other than routine (offline, kept on this device) — goes to a polite region
// that stays mounted, so its changes are heard.
export function DocStatus({ announce = null, children }: { announce?: string | null; children: ReactNode }) {
  const slot = useContext(StatusSlotContext);
  const status = (
    <div className="r2-doc-status">
      {children}
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
  return slot ? createPortal(status, slot) : status;
}
