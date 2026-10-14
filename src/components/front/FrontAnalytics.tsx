"use client";

import { useEffect } from "react";
import { currentDeviceCategory } from "@/lib/device";

// First-party measurement for the signed-out front door (api/front-event): one
// landing view per page load (when `view`), and every click on an element
// marked data-cta="header|hero|final|feature" — the one action, "Start writing
// free". Mounted only for signed-out visitors. Sends the visit's query string
// (the server keeps only the campaign fields), document.referrer (the server
// keeps only its host) and a coarse device class. No identifier, no cookie,
// no third party; a failure is silent and never delays the navigation.

const ENDPOINT = "/api/front-event";
let viewedPath: string | null = null;

function send(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify({ ...payload, search: window.location.search, referrer: document.referrer, device: currentDeviceCategory() });
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // Measurement never interrupts the page.
  }
}

export function FrontAnalytics({ view = false }: { view?: boolean }) {
  useEffect(() => {
    // Once per page load, even under React's development double effect.
    if (view && viewedPath !== window.location.pathname) {
      viewedPath = window.location.pathname;
      send({ event: "view" });
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-cta]") : null;
      if (target) send({ event: "cta", placement: target.dataset.cta });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [view]);
  return null;
}
