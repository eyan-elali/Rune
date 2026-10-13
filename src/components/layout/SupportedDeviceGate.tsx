"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isPhoneDevice } from "@/lib/device";
import type { AccountStage } from "@/lib/onboarding";
import { PhoneWaitingRoom } from "./PhoneWaitingRoom";

// useLayoutEffect is a no-op (with a console warning) during SSR, so this
// falls back to useEffect on the server render pass and only switches to
// the synchronous, pre-paint version once mounted in the browser.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Matches Tailwind's default `md` breakpoint — the smallest width Sutura's
// existing responsive code already treats as tablet-and-up supported. A
// phone is excluded at any width (useSupportedDevice).
const SUPPORTED_DEVICE_QUERY = "(min-width: 768px)";

// The authenticated routes a phone may use: onboarding, which ends in the
// desktop handoff on a phone (components/rune2/Onboarding.tsx). Everything
// else behind sign-in is the desktop workspace and is gated by default, so a
// new route is never opened to phones by omission. Sign-in, sign-up and the
// pen name are outside this layout and never gated.
const PHONE_ROUTES = ["/onboarding"];

/** Whether this device gets the full app: null until the viewport is known (the server render, first paint). */
// A phone (lib/device.ts) is never supported, in portrait or landscape;
// anything else keeps the width rule.
export function useSupportedDevice(): boolean | null {
  const [isSupported, setIsSupported] = useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    const wide = window.matchMedia(SUPPORTED_DEVICE_QUERY);
    const coarse = window.matchMedia("(pointer: coarse)");

    function update() {
      const phone = isPhoneDevice({
        coarsePointer: coarse.matches,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
      });
      setIsSupported(wide.matches && !phone);
    }

    update();
    wide.addEventListener("change", update);
    coarse.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      coarse.removeEventListener("change", update);
    };
  }, []);

  return isSupported;
}

interface SupportedDeviceGateProps {
  children: ReactNode;
  /** Where the account stands, from the server (lib/onboarding.ts accountStage). */
  stage: AccountStage;
  preferences?: Record<string, unknown> | null;
  /** What paints before the device is known (the server render); a plain Sutura Light page tone if omitted. */
  placeholder?: ReactNode;
}

// Gates authenticated app content behind a phone-width check. Renders
// nothing but a neutral loading surface until the real viewport is known
// (both on the server and on first client paint) so a phone never
// glimpses the Projects home, a Project or Settings before the gate
// resolves, and children are never mounted at all when gated — heavy
// client experiences like the Tiptap editor simply never initialize.
//
// On a phone, a gated route resolves by the account's server-backed stage:
// an unfinished onboarding goes to onboarding (a full navigation, so the
// layout re-reads the stage — never a client-side bounce between stale
// states); a finished one sees the returning desktop handoff; an account
// whose stage could not be read sees the neutral one.
export function SupportedDeviceGate({ children, stage, preferences, placeholder }: SupportedDeviceGateProps) {
  const pathname = usePathname();
  const isSupported = useSupportedDevice();
  const phoneRoute = PHONE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const toOnboarding = isSupported === false && !phoneRoute && stage === "onboarding";
  const sent = useRef(false);

  useEffect(() => {
    if (!toOnboarding || sent.current) return;
    sent.current = true;
    window.location.replace("/onboarding");
  }, [toOnboarding]);

  // Onboarding paints at once on every device: it adapts to a phone itself.
  if (phoneRoute) return <>{children}</>;

  if (isSupported === null || toOnboarding) {
    if (placeholder !== undefined) return <>{placeholder}</>;
    // A quiet Sutura Light page tone (rune2.css .r2-gate) — never a legacy palette.
    return <div className="r2 r2-gate" data-theme="light" aria-hidden="true" />;
  }

  if (!isSupported) {
    const initialSentAt =
      (preferences?.mobile_desktop_email_sent_at as string | undefined) ?? null;
    return (
      <PhoneWaitingRoom variant={stage === "returning" ? "returning" : "neutral"} initialEmailSentAt={initialSentAt} />
    );
  }

  return <>{children}</>;
}
