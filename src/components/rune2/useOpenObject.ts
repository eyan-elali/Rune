"use client";

import { useCallback, type MouseEvent } from "react";
import { openableId } from "@/lib/rune2/references";
import { useRune2Selection } from "./Rune2Selection";

/**
 * Opens a referenced object through the working set, as everywhere else in
 * the shell: a click opens it in the active tab (or goes to its tab), ⌘/Ctrl-
 * click or a middle click in a tab of its own. A Chapter's only Scene opens as
 * its Chapter, so the same writing never has two tabs.
 */
export function useOpenObject() {
  const { index, select, openInNewTab } = useRune2Selection();
  return useCallback(
    (id: string) => {
      const target = openableId(index, id);
      return {
        onClick: (e: MouseEvent) => (e.metaKey || e.ctrlKey ? openInNewTab(target) : select(target)),
        onAuxClick: (e: MouseEvent) => {
          if (e.button === 1) {
            e.preventDefault();
            openInNewTab(target);
          }
        },
      };
    },
    [index, select, openInNewTab]
  );
}
