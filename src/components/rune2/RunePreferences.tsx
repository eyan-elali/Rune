"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { updateRunePreferences } from "@/lib/actions/settings";
import type { Account } from "@/lib/rune2/account";
import { PREFERENCE_KEYS, readRunePreferences, type AppearanceId, type RunePreferences } from "@/lib/rune2/preferences";
import { resolveTheme, THEME_SCHEME, writingSurface, type ResolvedThemeId } from "@/lib/rune2/themes";
import type { UserPreferences } from "@/lib/types";
import { useProfileStore } from "@/store/profileStore";

// The writer's account-wide Rune preferences on the client (Beta Completion
// A; the model is lib/rune2/preferences.ts). Seeded by the (rune2) layout
// from the profile it read on the server, so the first server-rendered paint
// already carries the writer's manuscript type and appearance — no flash of
// the defaults before hydration. A change shows at once and is saved; if the
// save fails, that preference goes back and the caller is told, so nothing
// claims a change the server did not keep.
//
// Themes (Beta Completion C): every `.r2` root spreads useRuneRootProps() —
// data-theme and the writing surface — and the palettes (themes.ts) do the
// rest in CSS, System included, so neither the first paint nor a change of
// the operating system's appearance waits for JavaScript. The provider also
// marks <html> with the theme as painted, for the backdrop past a page's
// edges, and follows the operating system while System is chosen (never
// writing anything back: the stored choice stays "system").

type Api = RunePreferences & {
  /** Changes and saves preferences; resolves with the error, or null once the server has them. */
  update: (change: Partial<RunePreferences>) => Promise<string | null>;
};

const Ctx = createContext<Api | null>(null);

export function RunePreferencesProvider({
  initial,
  account = null,
  children,
}: {
  initial: unknown;
  /** Who is signed in, for the account control wherever it appears. */
  account?: Account | null;
  children: ReactNode;
}) {
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

  // The page behind Rune: <html> takes the theme as painted while Rune is open.
  const painted = useResolvedTheme(prefs.appearance);
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.r2Theme = painted;
    return () => {
      delete html.dataset.r2Theme;
    };
  }, [painted]);

  return (
    <Ctx.Provider value={api}>
      <AccountCtx.Provider value={account}>{children}</AccountCtx.Provider>
    </Ctx.Provider>
  );
}

const AccountCtx = createContext<Account | null>(null);

/** Who is signed in (seeded by the (rune2) layout), or null outside it. */
export function useRuneAccount(): Account | null {
  return useContext(AccountCtx);
}

// The operating system's appearance, followed live.
const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const systemIsDark = () => window.matchMedia(DARK_QUERY).matches;

/** Whether the operating system is set to dark (false on the server, where CSS decides). */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribeSystem, systemIsDark, () => false);
}

/** The theme as painted: System resolved against the operating system. */
export function useResolvedTheme(appearance?: AppearanceId): ResolvedThemeId {
  const own = useRunePreferences().appearance;
  return resolveTheme(appearance ?? own, useSystemDark());
}

const FALLBACK: Api = { ...readRunePreferences(null), update: async () => "Preferences aren’t available here." };

export function useRunePreferences(): Api {
  return useContext(Ctx) ?? FALLBACK;
}

/** The `data-theme` every `.r2` root carries. */
export function useAppearance(): AppearanceId {
  return useRunePreferences().appearance;
}

/**
 * What every `.r2` root carries: the theme, the accent, and the writing surface with its
 * scheme (light or dark page). The surface is set on every root, so any
 * manuscript surface under it — the editor, Reading Mode — reads it.
 */
export function useRuneRootProps(): {
  "data-theme": AppearanceId;
  "data-accent": string;
  "data-surface": string;
  "data-surface-scheme"?: string;
} {
  const { appearance, accent, writingSurface: surface } = useRunePreferences();
  const scheme = writingSurface(surface).scheme;
  return {
    "data-theme": appearance,
    "data-accent": accent,
    "data-surface": surface,
    ...(scheme ? { "data-surface-scheme": scheme } : {}),
  };
}

export { THEME_SCHEME };

/** A Rune 2.0 page root: `.r2` with the writer's theme and surface. For server pages that render no other client root. */
export function RuneRoot({
  className,
  children,
  ...rest
}: { className?: string; children?: ReactNode } & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const rootProps = useRuneRootProps();
  return (
    <div className={className ? `r2 ${className}` : "r2"} {...rootProps} {...rest}>
      {children}
    </div>
  );
}
