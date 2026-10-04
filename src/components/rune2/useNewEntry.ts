"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCollectionEntry } from "@/lib/actions/workspaceCollections";
import type { PropertyValue } from "@/lib/types";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";

/**
 * Creates an Entry at the end of a Collection and opens it, title first —
 * with `initial` set first (a Board lane's value). Failures show in `notice`.
 */
export function useNewEntry(collectionId: string) {
  const { selectWhenPresent, requestSceneFocus } = useRune2Selection();
  const { setValue } = usePropertyStore();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function add(initial?: { propertyId: string; value: PropertyValue }) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await createCollectionEntry(collectionId, null);
      if (r.error !== null) {
        setNotice("Couldn’t create the entry.");
        return;
      }
      if (initial) await setValue(r.data.id, initial.propertyId, initial.value);
      selectWhenPresent(r.data.id);
      requestSceneFocus(r.data.id);
    } catch {
      setNotice("Couldn’t create the entry.");
    } finally {
      setBusy(false);
      startRefresh(() => router.refresh());
    }
  }

  return { add, busy, notice };
}
