import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ATTRIBUTION_COOKIE_NAME,
  ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  parseAttributionFromSearchParams,
  hasMeaningfulAttribution,
  serializeAttributionCookie,
  deserializeAttributionCookie,
  normalizeLandingPath,
} from "@/lib/attribution";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/auth/callback",
  "/terms",
  "/privacy",
  // Entry point for the landing page's "Continue with Scribe" CTA — must be
  // reachable signed-out (it records purchase intent and sends the visitor
  // to signup), and it fully handles the authenticated case itself.
  "/api/intent/scribe",
  // Entry point for the landing page's free-start CTAs — clears any
  // stale purchase intent before continuing to signup.
  "/api/intent/clear",
];

// First-touch capture: only runs on public entry routes, only when no
// first-touch cookie already exists, and only when this visit actually
// carries recognized attribution params — an untagged visit never
// overwrites (or races to set) a cookie.
function captureFirstTouchAttribution(request: NextRequest, response: NextResponse) {
  const existing = deserializeAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE_NAME)?.value);
  if (existing) return;

  const fields = parseAttributionFromSearchParams(request.nextUrl.searchParams);
  if (!hasMeaningfulAttribution(fields)) return;

  const touch = {
    ...fields,
    landing_path: normalizeLandingPath(request.nextUrl.pathname),
    captured_at: new Date().toISOString(),
  };

  response.cookies.set(ATTRIBUTION_COOKIE_NAME, serializeAttributionCookie(touch), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  });
}

function isNetworkError(err: { message?: string; status?: number } | null): boolean {
  if (!err) return false;
  if ("status" in err && err.status === 0) return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed")
  );
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/webhooks/stripe")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must not run any logic between createServerClient and getUser
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // When offline the server cannot reach Supabase to validate the JWT.
  // getSession() reads the JWT from cookies locally (no network call) and
  // tells us whether the user had an active session before going offline.
  let effectiveUser = user;
  if (!effectiveUser && isNetworkError(authError)) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    effectiveUser = session?.user ?? null;
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith("/auth/")
  );

  if (!effectiveUser && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (isPublic) {
    captureFirstTouchAttribution(request, supabaseResponse);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all paths except: static files, _next internals, favicon.
     */
    "/((?!api/webhooks/stripe|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
