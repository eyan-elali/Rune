// The signed-out front door's first-party events: a landing view and a click
// on the one action, "Start writing free" (components/front/FrontAnalytics).
// Anonymous rows (no account exists yet, no visitor id, no cookie set here):
// what is kept is the event, the visit's own campaign fields, the referring
// site's host, a coarse device class and, for a click, its placement — the
// allowlisted metadata of lib/launchMetrics.ts. A Meta click id is reduced to
// "present" (click_id: true); the id itself is never stored here.
//
// Listed in proxy.ts's PUBLIC_ROUTES. Never blocks anything: every failure is
// a 204. A small per-address limit blunts a loop (lib/rateLimit.ts caveats).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordAnonymousEvent } from "@/lib/actions/analytics";
import { parseAttributionFromSearchParams } from "@/lib/attribution";
import { normalizeReferrerHost, parseCtaPlacement, parseDeviceCategory } from "@/lib/launchMetrics";
import { clientIpFromHeaders, consumeRateLimit } from "@/lib/rateLimit";

const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|vercel-screenshot/i;
const MAX_BODY = 2_000;

function done() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    if (BOT_UA.test(request.headers.get("user-agent") ?? "")) return done();
    const ip = clientIpFromHeaders(request.headers);
    if (!consumeRateLimit(ip ? `front-event:${ip}` : null, 60, 10 * 60_000).allowed) return done();

    const raw = await request.text();
    if (raw.length > MAX_BODY) return done();
    const body = JSON.parse(raw) as { event?: unknown; placement?: unknown; search?: unknown; referrer?: unknown; device?: unknown };

    const kind = body.event === "view" ? "landing_viewed" : body.event === "cta" ? "landing_cta_clicked" : null;
    if (!kind) return done();
    const placement = kind === "landing_cta_clicked" ? parseCtaPlacement(body.placement) : null;
    if (kind === "landing_cta_clicked" && !placement) return done();

    const search = typeof body.search === "string" ? body.search.slice(0, 1_000) : "";
    const utm = parseAttributionFromSearchParams(new URLSearchParams(search));

    const { error } = await recordAnonymousEvent(kind, {
      placement,
      source: utm.source,
      medium: utm.medium,
      campaign: utm.campaign,
      content: utm.content,
      term: utm.term,
      click_id: utm.fbclid ? true : null,
      referrer_host: normalizeReferrerHost(body.referrer, request.nextUrl.hostname),
      device: parseDeviceCategory(body.device),
    });
    if (error) console.error("[front-event] insert failed:", { kind, message: error });
  } catch {
    // Malformed or failed: nothing is recorded, nothing is blocked.
  }
  return done();
}
