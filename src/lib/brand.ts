// Sutura's public identity, in one place (Rune 2.0 was the development name
// of the product now branded Sutura). Product copy says "Sutura" directly;
// these are the values that must agree wherever they appear: the canonical
// address (metadata, social cards, the manifest) and the contact mailboxes.
// Runtime origins for auth and billing redirects still come from
// NEXT_PUBLIC_APP_URL or the request — never from here.

export const PRODUCT_NAME = "Sutura";
export const SITE_URL = "https://writesutura.com";
export const SUPPORT_EMAIL = "support@writesutura.com";
export const PRIVACY_EMAIL = "privacy@writesutura.com";
export const POSITIONING = "A home for writing novels.";

/** The approved wordmark, trimmed to its letters (public/brand/sutura/web). */
export const WORDMARK = {
  /** Dark ink — for Light and Candlelight surfaces. */
  onLight: "/brand/sutura/web/sutura-wordmark-dark.png",
  /** Light ink — for Dark surfaces. */
  onDark: "/brand/sutura/web/sutura-wordmark-light.png",
} as const;
