"use client";

import { useCallback } from "react";
import type { Rune2EditorFont } from "@/lib/types";
import { useRunePreferences } from "./RunePreferences";

// The manuscript type preference (Milestone 21C): the prose serif, or Rune's
// sans. An account-wide preference (lib/rune2/preferences.ts), read from
// RunePreferences. It reaches the CSS as the shell's `data-editor-font`,
// where the prose tokens change; nothing in the chrome reads it. Changing it
// is immediate; a failed save puts it back.

export const EDITOR_FONTS: { id: Rune2EditorFont; label: string }[] = [
  { id: "serif", label: "Serif" },
  { id: "sans", label: "Sans serif" },
];

export function useEditorFont(): { font: Rune2EditorFont; setFont: (font: Rune2EditorFont) => void } {
  const { editorFont, update } = useRunePreferences();
  const setFont = useCallback((next: Rune2EditorFont) => void update({ editorFont: next }), [update]);
  return { font: editorFont, setFont };
}
