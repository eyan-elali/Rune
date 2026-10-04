import type { NextConfig } from "next";
import { LEGACY_REDIRECTS } from "./src/lib/legacyRedirects";

// ── Browser security headers (pre-beta security audit, sections N/O) ────────
//
// Every response carries the non-CSP headers below outright; they are safe
// for Sutura as built (nothing embeds Sutura in a frame, nothing needs camera /
// microphone / geolocation, every asset is served with a real Content-Type).
//
// The Content-Security-Policy ships REPORT-ONLY until a browser pass of the
// front door, signup, onboarding, the editor (paste, image attachments,
// export downloads), Settings and Pulse shows no violations. Promote it by
// renaming the header key to "Content-Security-Policy".
//
// Why no nonce: next-themes and the Meta Pixel both render inline scripts,
// and nonces force every page into dynamic rendering (see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
// script-src therefore keeps 'unsafe-inline' and lists each third-party
// origin explicitly; the policy's value is in connect/frame/object/base
// restrictions rather than inline-script blocking. A nonce-based policy is
// the documented upgrade path once the Pixel inline script is hashed or
// moved to a nonce'd <Script>.
//
// Origins, in order of appearance in the policy:
//   * NEXT_PUBLIC_SUPABASE_URL (https + wss)  — auth, PostgREST, realtime.
//   * connect.facebook.net / www.facebook.com — Meta Pixel (src/components/MetaPixel.tsx).
//   * cdn.promotekit.com / *.promotekit.com   — PromoteKit affiliate script (src/app/layout.tsx).
//   * fonts.googleapis.com / fonts.gstatic.com — manuscript fonts imported in globals.css
//     (next/font Inter + Newsreader are self-hosted under /_next/static and need nothing).
//   * blob:  — export downloads (src/lib/export/download.ts) and image previews
//              (src/lib/attachments/client.ts, RuneSettings avatar preview).
//   * data:  — img fallback only (next/image placeholders, inline icons).
// js.stripe.com is NOT listed: @stripe/stripe-js is installed but never
// imported; Checkout is a server-side redirect to checkout.stripe.com, which
// a top-level navigation does not need in CSP. Add it with the Stripe reopen.

const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
})();
const supabaseConnect = supabaseOrigin
  ? `${supabaseOrigin} ${supabaseOrigin.replace(/^https:/, "wss:")}`
  : "https://*.supabase.co wss://*.supabase.co";

const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' only in development: React/Next use eval for the dev overlay's source maps.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://connect.facebook.net https://cdn.promotekit.com`,
  // Tailwind/next/font are external files; 'unsafe-inline' covers React style props,
  // TipTap/ProseMirror's injected <style>, and the Google Fonts stylesheet.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' blob: data: https://www.facebook.com",
  `connect-src 'self' ${supabaseConnect} https://connect.facebook.net https://www.facebook.com https://*.promotekit.com`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "manifest-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Two years, subdomains, preload-eligible. Vercel already serves HTTPS only;
  // this pins browsers to it. Submit to hstspreload.org only once www + apex
  // are both confirmed HTTPS-only.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // REPORT-ONLY (see the note above). Promote after the browser pass.
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  // The retired Rune 1.x addresses (and /rune2) lead into Rune 2.0.
  async redirects() {
    return [
      // Sutura's canonical host is the apex (src/lib/brand.ts SITE_URL). Vercel's
      // domain settings should redirect www too; this covers it if they don't.
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: "www.writesutura.com" }],
        destination: "https://writesutura.com/:path*",
        permanent: true,
      },
      ...LEGACY_REDIRECTS.map((r) => ({ ...r, permanent: false })),
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
