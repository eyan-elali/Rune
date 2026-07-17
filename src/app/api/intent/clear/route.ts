// Entry point for the landing page's free-start CTAs ("Start Writing Free" /
// "Start Your Manuscript — Free"). A visitor who earlier clicked "Continue
// with Scribe" (setting the intent cookie — see src/app/api/intent/scribe/route.ts)
// and then changes their mind must not have that stale intent silently
// resurface later and redirect them into Checkout: an explicit free-start
// click always wins and wipes it.
//
// Listed in proxy.ts's PUBLIC_ROUTES so signed-out visitors can reach it.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PURCHASE_INTENT_COOKIE } from "@/lib/purchaseIntent";

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const response = NextResponse.redirect(`${origin}/signup`);
  response.cookies.delete(PURCHASE_INTENT_COOKIE);
  return response;
}
