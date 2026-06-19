export const FB_PIXEL_ID = '2001689237155573';

declare global {
  interface Window {
    fbq: (
      action: string,
      event: string,
      params?: Record<string, unknown>
    ) => void;
    _fbq: unknown;
  }
}

export function trackPixelEvent(
  event: string,
  params?: Record<string, unknown>
): void {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', event, params);
  }
}
