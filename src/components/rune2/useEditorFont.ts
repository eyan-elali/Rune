"use client";

import { useCallback } from "react";
import { updatePreferences } from "@/lib/actions/settings";
import type { Rune2EditorFont, UserPreferences } from "@/lib/types";
import { useProfileStore } from "@/store/profileStore";

// The manuscript type preference (Milestone 21C): the prose serif, or Rune's
// sans. One writer-level preference, kept with the writer's other preferences
// on the profile (server-side, like the legacy manuscript-font choice) and
// read from the hydrated profile store. It reaches the CSS as the shell's
// `data-editor-font`, where the prose tokens change; nothing in the chrome
// reads it. Saved optimistically: the type changes at once, and a failed
// save puts it back.

export const EDITOR_FONTS: { id: Rune2EditorFont; label: string }[] = [
  { id: "serif", label: "Serif" },
  { id: "sans", label: "Sans serif" },
];

export function useEditorFont(): { font: Rune2EditorFont; setFont: (font: Rune2EditorFont) => void } {
  const prefs = useProfileStore((s) => s.profile?.preferences) as Partial<UserPreferences> | null | undefined;
  const setPreferences = useProfileStore((s) => s.setPreferences);
  const font: Rune2EditorFont = prefs?.rune2EditorFont === "sans" ? "sans" : "serif";

  const setFont = useCallback(
    (next: Rune2EditorFont) => {
      if (next === font) return;
      setPreferences({ rune2EditorFont: next });
      void updatePreferences({ rune2EditorFont: next })
        .then((r) => {
          if (r.error) setPreferences({ rune2EditorFont: font });
        })
        .catch(() => setPreferences({ rune2EditorFont: font }));
    },
    [font, setPreferences]
  );

  return { font, setFont };
}
