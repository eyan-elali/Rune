"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { PhoneWaitingRoom, type WaitingRoomVariant } from "./PhoneWaitingRoom";

// useLayoutEffect is a no-op (with a console warning) during SSR, so this
// falls back to useEffect on the server render pass and only switches to
// the synchronous, pre-paint version once mounted in the browser.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Matches Tailwind's default `md` breakpoint — the smallest width Rune's
// existing responsive code already treats as tablet-and-up supported.
const SUPPORTED_DEVICE_QUERY = "(min-width: 768px)";

interface SupportedDeviceGateProps {
  children: ReactNode;
  variant: WaitingRoomVariant;
}

// Gates authenticated app content behind a phone-width check. Renders
// nothing but a neutral loading surface until the real viewport is known
// (both on the server and on first client paint) so a phone never
// glimpses onboarding, the dashboard, or the editor before the gate
// resolves, and children are never mounted at all when gated — heavy
// client experiences like the Tiptap editor simply never initialize.
export function SupportedDeviceGate({ children, variant }: SupportedDeviceGateProps) {
  const [isSupported, setIsSupported] = useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    const mql = window.matchMedia(SUPPORTED_DEVICE_QUERY);
    setIsSupported(mql.matches);

    function handleChange(e: MediaQueryListEvent) {
      setIsSupported(e.matches);
    }

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  if (isSupported === null) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--bg-primary)" }}
        aria-hidden="true"
      >
        <span
          className="select-none font-rune-serif text-2xl opacity-60"
          style={{ color: "var(--color-gold)", letterSpacing: "0.3em", fontStyle: "italic" }}
        >
          Rune
        </span>
      </div>
    );
  }

  if (!isSupported) {
    return <PhoneWaitingRoom variant={variant} />;
  }

  return <>{children}</>;
}
