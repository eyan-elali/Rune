"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { markHintSeen } from "@/lib/actions/settings";
import { HINTS, readSeenHints, type HintId } from "@/lib/rune2/hints";
import { ICON_SM_BOLD } from "./icons";

// One-time anchored hints (Beta Completion E; the registry is
// lib/rune2/hints.ts). Seeded by the (rune2) layout from the profile, so a
// hint already seen never paints even for a moment. Dismissing it hides it
// at once and records it on the account; if that save fails it stays hidden
// for this visit and may show once more later — never a blocking prompt.
// Doing what a hint teaches (completeHint: a Collection's first Entry made)
// records it too, without taking it away mid-read: it is simply not there
// next time.

type Api = { seen: ReadonlySet<HintId>; dismiss: (id: HintId) => void; complete: (id: HintId) => void };

const Ctx = createContext<Api | null>(null);

export function HintsProvider({ initial, children }: { initial: unknown; children: ReactNode }) {
  const [seen, setSeen] = useState<ReadonlySet<HintId>>(() => new Set(readSeenHints(initial)));
  const dismiss = useCallback((id: HintId) => {
    setSeen((prev) => new Set([...prev, id]));
    void markHintSeen(id).catch(() => {});
  }, []);
  // Recorded once per visit at most; still shown until this visit ends or it is dismissed.
  const completed = useRef(new Set<HintId>());
  const complete = useCallback(
    (id: HintId) => {
      if (seen.has(id) || completed.current.has(id)) return;
      completed.current.add(id);
      void markHintSeen(id).catch(() => completed.current.delete(id));
    },
    [seen]
  );
  const api = useMemo(() => ({ seen, dismiss, complete }), [seen, dismiss, complete]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Records that the writer has done what hint `id` teaches (a no-op outside the provider). */
export function useCompleteHint(): (id: HintId) => void {
  const api = useContext(Ctx);
  return api?.complete ?? noop;
}
const noop = () => {};

/**
 * A hint, once: its two lines and a way to put it away. Given several, the
 * first not yet seen — one at a time, never a stack. Nothing outside the
 * provider (it would never be recorded).
 */
export function OneTimeHint({ id: ids, className }: { id: HintId | readonly HintId[]; className?: string }) {
  const api = useContext(Ctx);
  const id = api ? (typeof ids === "string" ? [ids] : ids).find((h) => !api.seen.has(h)) : undefined;
  if (!api || !id) return null;
  const hint = HINTS[id];
  return (
    <aside className={className ? `r2-hint ${className}` : "r2-hint"} aria-label={hint.title} data-hint={id}>
      <p className="r2-hint-text">
        <span className="r2-hint-title">{hint.title}</span>
        {hint.body}
      </p>
      <button type="button" className="r2-icon-button r2-icon-button--xs" aria-label="Dismiss" onClick={() => api.dismiss(id)}>
        <X {...ICON_SM_BOLD} aria-hidden />
      </button>
    </aside>
  );
}
