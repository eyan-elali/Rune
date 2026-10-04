import type { MetadataRoute } from "next";
import { POSITIONING, PRODUCT_NAME } from "@/lib/brand";

// The web app manifest: Sutura's name and icons for browsers that install or
// pin the site. Not a PWA — no service worker, no offline shell here (offline
// writing lives in IndexedDB, lib/offline).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: POSITIONING,
    start_url: "/projects",
    display: "browser",
    background_color: "#f5f5f3",
    theme_color: "#f5f5f3",
    icons: [
      { src: "/brand/sutura/web/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/sutura/web/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
