import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ATTRIBUTION_COOKIE_NAME, deserializeAttributionCookie } from '@/lib/attribution'
import { recordFirstTouchAttribution } from '@/lib/actions/attribution'
import { recordAnalyticsEvent } from '@/lib/actions/analytics'
import { COMPLETE_PROFILE_PATH, needsProfileCompletion, readProfileState } from '@/lib/accountGate'
import { PURCHASE_INTENT_COOKIE, parsePurchaseIntent } from '@/lib/purchaseIntent'
import { BILLING_OPEN } from '@/lib/beta'
import { safeNextPath } from '@/lib/authRedirect'

// Best-effort: reads the first-touch cookie and persists the attribution row
// for the just-verified user. Never throws — a failure here must not block
// email verification or the onboarding redirect. Only clears the cookie once
// persistence is confirmed, so a failure leaves it in place for a later
// retry-safe attempt (the upsert is idempotent either way).
async function persistFirstTouchAttribution(
  request: NextRequest,
  redirectResponse: NextResponse,
  userId: string
) {
  try {
    const touch = deserializeAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE_NAME)?.value)
    if (!touch) return

    const { error } = await recordFirstTouchAttribution(userId, touch)
    if (error) {
      console.error('[auth/callback] recordFirstTouchAttribution failed:', error)
      return
    }

    redirectResponse.cookies.delete(ATTRIBUTION_COOKIE_NAME)
  } catch (err) {
    console.error('[auth/callback] attribution persistence threw:', err)
  }
}

// Best-effort: records email_verified for the just-verified user. Fires only
// after exchangeCodeForSession has already succeeded, so this always
// represents a real, authenticated session — never a client-asserted userId.
// Never throws — a failure here must not block the onboarding redirect.
async function recordEmailVerifiedEvent(userId: string) {
  try {
    const { error, code } = await recordAnalyticsEvent({ userId, eventName: 'email_verified' })
    if (error) {
      console.error('[auth/callback] email_verified insert failed', {
        eventName: 'email_verified',
        userIdResolved: true,
        dbErrorCode: code ?? null,
        dbErrorMessage: error,
      })
    }
  } catch (err) {
    console.error('[auth/callback] email_verified insert threw', {
      eventName: 'email_verified',
      userIdResolved: true,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

const EMAIL_OTP_TYPES: readonly string[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']
function isEmailOtpType(v: string | null): v is EmailOtpType {
  return v !== null && EMAIL_OTP_TYPES.includes(v)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // A link in the token-hash form ({{ .TokenHash }} email templates) instead
  // of the PKCE code: verified the same way, then routed exactly the same.
  const tokenHash = searchParams.get('token_hash')
  const otpType = searchParams.get('type')
  // Only a path of this app (lib/authRedirect.ts): a link can carry any `next`.
  const next = safeNextPath(searchParams.get('next') ?? '/projects')
  const intent = searchParams.get('intent')

  if (code || (tokenHash && isEmailOtpType(otpType))) {
    const isNewSignup = intent === 'signup'
    // A pending Scribe purchase intent always takes priority over the
    // ordinary destination — /auth/continue consumes it (creating the
    // Checkout session) and only then falls back to the same
    // onboarding/dashboard routing this would otherwise do directly. When
    // there's no intent, behavior is byte-for-byte the same as before.
    // Closed beta (Beta Completion E): no purchase is ever continued (lib/beta.ts).
    const hasPendingScribeIntent = BILLING_OPEN && parsePurchaseIntent(
      request.cookies.get(PURCHASE_INTENT_COOKIE)?.value
    ) !== null
    const baseDestination = hasPendingScribeIntent
      ? '/auth/continue'
      : isNewSignup
      ? '/onboarding'
      : next
    // Placeholder response used only as the cookie sink for the Supabase
    // client below (setAll writes session cookies onto it, and the
    // attribution helper deletes its cookie from it). The real destination
    // is only known after the exchange succeeds and the profile is
    // checked, so the actual redirect is issued further down, carrying
    // these same cookies over.
    const redirectResponse = NextResponse.redirect(`${origin}${baseDestination}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              redirectResponse.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType as EmailOtpType })
    if (!error && data.user) {
      // Use the user returned directly by the exchange rather than a
      // follow-up getUser() call. exchangeCodeForSession's success branch
      // guarantees a non-null user (see AuthTokenResponse), whereas a
      // separate getUser() call is an independent network round-trip that
      // can return a null user without an error — which previously caused
      // this block to be silently skipped while the redirect still fired,
      // so email_verified went unrecorded with no error logged anywhere.
      const user = data.user
      await recordEmailVerifiedEvent(user.id)
      await persistFirstTouchAttribution(request, redirectResponse, user.id)

      // Every account needs a profile with a chosen pen name before entering
      // the writing experience (lib/accountGate.ts) — an account with no
      // profile row at all included. Only a failed lookup falls through to
      // the original destination (whose layout asks again) rather than
      // risking a redirect loop.
      const profileState = await readProfileState(supabase, user.id, 'display_name')
      const destination = needsProfileCompletion(profileState) ? COMPLETE_PROFILE_PATH : baseDestination

      const finalUrl = new URL(`${origin}${destination}`)
      if (isNewSignup) {
        finalUrl.searchParams.set('registered', '1')
      }
      const finalResponse = NextResponse.redirect(finalUrl.toString())
      redirectResponse.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie))
      return finalResponse
    }
    console.error('[auth/callback] session exchange failed:', error?.message ?? 'no user')
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`)
}
