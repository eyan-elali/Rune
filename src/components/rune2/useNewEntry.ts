"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCollectionEntry } from "@/lib/actions/workspaceCollections";
import type { PropertyValue } from "@/lib/types";
import { useCompleteHint } from "./Hint";
import { releaseTextEntry } from "./pendingCreation";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";

// ── Naming a new Entry in place ─────────────────────────────────────────────
// An Entry made from a Collection's View stays in that View: its row (or card,
// or timeline item) shows a name field until the writer leaves it, and the
// Entry's own page opens only when they open it. One Entry is being named at a
// time, for the whole shell — a tiny store rather than context, so every View
// body can read it without threading it through.

type Naming = { id: string; returnTo: HTMLElement | null } | null;

let naming: Naming = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function setNaming(next: Naming) {
  naming = next;
  for (const fn of listeners) fn();
}

/** The Entry whose name is being typed in place (null: none). */
export function useNamingEntry(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => naming?.id ?? null,
    () => null
  );
}

/**
 * Ends naming `id` in place. `returnFocus`: back to the control that made it
 * ("New entry", a lane's "New"), so Enter, Enter makes the next one.
 */
export function finishNaming(id: string, returnFocus: boolean) {
  if (naming?.id !== id) return;
  const back = naming.returnTo;
  setNaming(null);
  if (returnFocus && back?.isConnected) requestAnimationFrame(() => back.focus());
}

/**
 * Creates an Entry at the end of a Collection — with `initial` set first (a
 * Board lane's value). `inPlace` (a Collection's View): the writer stays in
 * the View and names it there. Otherwise (an open Entry's "+ Entry") it opens,
 * title first. Failures show in `notice`.
 */
export function useNewEntry(collectionId: string, { inPlace = false }: { inPlace?: boolean } = {}) {
  const { selectWhenPresent, requestSceneFocus } = useRune2Selection();
  const { setValue } = usePropertyStore();
  const completeHint = useCompleteHint();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  // One creation at a time, even for clicks that land before `busy` renders.
  const creating = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Until the Entry exists there is no name field or body to type into, and
  // no other text surface keeps focus meanwhile (pendingCreation).
  async function add(initial?: { propertyId: string; value: PropertyValue }) {
    if (creating.current) return;
    creating.current = true;
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    releaseTextEntry(from);
    setBusy(true);
    setNotice(null);
    try {
      const r = await createCollectionEntry(collectionId, null);
      if (r.error !== null) {
        setNotice("Couldn’t create the entry.");
        return;
      }
      if (initial) await setValue(r.data.id, initial.propertyId, initial.value);
      // The Collection hint has done its work once an Entry is made.
      completeHint("collection");
      if (inPlace) {
        setNaming({ id: r.data.id, returnTo: from });
      } else {
        selectWhenPresent(r.data.id);
        requestSceneFocus(r.data.id);
      }
    } catch {
      setNotice("Couldn’t create the entry.");
    } finally {
      creating.current = false;
      setBusy(false);
      startRefresh(() => router.refresh());
    }
  }

  return { add, busy, notice };
}
