"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { updateRunePreferences } from "@/lib/actions/settings";
import { PREFERENCE_KEYS, readRunePreferences, type AppearanceId, type RunePreferences } from "@/lib/rune2/preferences";
import type { UserPreferences } from "@/lib/types";
import { useProfileStore } from "@/store/profileStore";

// The writer's account-wide Rune preferences on the client (Beta Completion
// A; the model is lib/rune2/preferences.ts). Seeded by the (rune2) layout
// from the profile it read on the server, so the first server-rendered paint
// already carries the writer's manuscript type and appearance — no flash of
// the defaults before hydration. A change shows at once and is saved; if the
// save fails, that preference goes back and the caller is told, so nothing
// claims a change the server did not keep.

type Api = RunePreferences & {
  /** Changes and saves preferences; resolves with the error, or null once the server has them. */
  update: (change: Partial<RunePreferences>) => Promise<string | null>;
};

const Ctx = createContext<Api | null>(null);

export function RunePreferencesProvider({ initial, children }: { initial: unknown; children: ReactNode }) {
  const [prefs, setPrefs] = useState<RunePreferences>(() => readRunePreferences(initial));
  // The latest preferences, for an update's "before" (kept in step after each render, and at once by apply).
  const current = useRef(prefs);
  useLayoutEffect(() => {
    current.current = prefs;
  }, [prefs]);
  const setStorePreferences = useProfileStore((s) => s.setPreferences);

  const update = useCallback(
    async (change: Partial<RunePreferences>) => {
      const before = current.current;
      const keys = Object.keys(change) as (keyof RunePreferences)[];
      if (keys.every((k) => before[k] === change[k])) return null;

      const apply = (next: RunePreferences) => {
        current.current = next;
        setPrefs(next);
        // The hydrated profile store mirrors them for anything that reads it.
        setStorePreferences(Object.fromEntries(keys.map((k) => [PREFERENCE_KEYS[k], next[k]])) as Partial<UserPreferences>);
      };
      apply({ ...before, ...change });

      let error: string | null;
      try {
        const result = await updateRunePreferences(change);
        error = result.error;
      } catch {
        error = "You appear to be offline. The change wasn’t saved.";
      }
      if (error !== null) {
        // Only what this change touched goes back.
        apply({ ...current.current, ...Object.fromEntries(keys.map((k) => [k, before[k]])) });
      }
      return error;
    },
    [setStorePreferences]
  );

  const api = useMemo<Api>(() => ({ ...prefs, update }), [prefs, update]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

const FALLBACK: Api = { ...readRunePreferences(null), update: async () => "Preferences aren’t available here." };

export function useRunePreferences(): Api {
  return useContext(Ctx) ?? FALLBACK;
}

/** The `data-theme` every `.r2` root carries. */
export function useAppearance(): AppearanceId {
  return useRunePreferences().appearance;
}
