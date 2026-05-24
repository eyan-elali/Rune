"use client";

import { useEffect } from "react";
import { useProfileStore } from "@/store/profileStore";
import { DEFAULT_THEME_ID, resolveThemeId } from "@/lib/themes";

export function ThemeApplier() {
  const preferences = useProfileStore((s) => s.profile?.preferences) as
    | Record<string, unknown>
    | null
    | undefined;

  const activeTheme = resolveThemeId(
    preferences?.activeTheme as string | undefined
  );
  const activeFont =
    (preferences?.activeFont as string | undefined) ?? "";

  useEffect(() => {
    const root = document.documentElement;
    if (activeTheme === DEFAULT_THEME_ID) {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", activeTheme);
    }
  }, [activeTheme]);

  useEffect(() => {
    if (activeFont && activeFont !== "font-classical") {
      document.documentElement.setAttribute("data-font", activeFont);
    } else {
      document.documentElement.removeAttribute("data-font");
    }
  }, [activeFont]);

  return null;
}
