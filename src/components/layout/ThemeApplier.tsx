"use client";

import { useEffect } from "react";
import { useProfileStore } from "@/store/profileStore";

export function ThemeApplier() {
  const preferences = useProfileStore((s) => s.profile?.preferences) as
    | Record<string, unknown>
    | null
    | undefined;

  const activeTheme =
    (preferences?.activeTheme as string | undefined) ?? "parchment";

  useEffect(() => {
    if (activeTheme && activeTheme !== "parchment") {
      document.documentElement.setAttribute("data-theme", activeTheme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [activeTheme]);

  return null;
}
