import type { NextConfig } from "next";
import { LEGACY_REDIRECTS } from "./src/lib/legacyRedirects";

const nextConfig: NextConfig = {
  // The retired Rune 1.x addresses (and /rune2) lead into Rune 2.0.
  async redirects() {
    return LEGACY_REDIRECTS.map((r) => ({ ...r, permanent: false }));
  },
};

export default nextConfig;
