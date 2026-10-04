import Script from "next/script";
import { MetaPixel } from "@/components/MetaPixel";

// Third-party marketing attribution — PromoteKit and the Meta Pixel — for the
// public front door only (see MARKETING_PATHS in lib/meta-pixel). Never render
// this from an authenticated surface.
export function MarketingTrackers() {
  return (
    <>
      <Script
        src="https://cdn.promotekit.com/pk.js"
        data-promotekit="64ee5083-c2fe-4f2a-83d5-f617165dc363"
        strategy="afterInteractive"
      />
      <MetaPixel />
    </>
  );
}
