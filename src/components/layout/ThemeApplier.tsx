"use client";

import { useEffect } from "react";
import { useProfileStore } from "@/store/profileStore";
import { resolveThemeId } from "@/lib/themes";

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
    // Always set the attribute explicitly rather than stripping it for the
    // "default" theme. The old shortcut (remove attribute → fall through to
    // bare `:root`) only worked because `:root` happened to hold Parchment's
    // palette, which was also DEFAULT_THEME_ID — reassigning the default to
    // any other theme would silently render the wrong colors otherwise.
    document.documentElement.setAttribute("data-theme", activeTheme);
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
