export const FB_PIXEL_ID = '2001689237155573';

declare global {
  interface Window {
    fbq: ((
      action: string,
      event: string,
      params?: Record<string, unknown>
    ) => void) & { disablePushState?: boolean };
    _fbq: unknown;
  }
}

// The marketing boundary (closed beta): third-party marketing scripts — the
// Meta Pixel and PromoteKit — load only on the public front door. The
// authenticated writing product (Projects, the Project shell, Settings,
// onboarding, Pulse) never loads them, and an event is never sent from it,
// even when a script loaded on the front door survives a client-side
// navigation into the app. Rune's first-party analytics are unaffected.
export const MARKETING_PATHS: ReadonlySet<string> = new Set(['/']);

export function isMarketingPath(pathname: string | null | undefined): boolean {
  return pathname != null && MARKETING_PATHS.has(pathname);
}

export function trackPixelEvent(
  event: string,
  params?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return;
  if (!isMarketingPath(window.location.pathname)) return;
  if (typeof window.fbq === 'function') {
    window.fbq('track', event, params);
  }
}
