import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ATTRIBUTION_COOKIE_NAME, deserializeAttributionCookie } from '@/lib/attribution'
import { recordFirstTouchAttribution } from '@/lib/actions/attribution'

// Best-effort: reads the first-touch cookie, resolves the just-verified user
// server-side, and persists the attribution row. Never throws — a failure
// here must not block email verification or the onboarding redirect. Only
// clears the cookie once persistence is confirmed, so a failure leaves it in
// place for a later retry-safe attempt (the upsert is idempotent either way).
async function persistFirstTouchAttribution(
  request: NextRequest,
  redirectResponse: NextResponse,
  supabase: ReturnType<typeof createServerClient>
) {
  try {
    const touch = deserializeAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE_NAME)?.value)
    if (!touch) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await recordFirstTouchAttribution(user.id, touch)
    if (error) {
      console.error('[auth/callback] recordFirstTouchAttribution failed:', error)
      return
    }

    redirectResponse.cookies.delete(ATTRIBUTION_COOKIE_NAME)
  } catch (err) {
    console.error('[auth/callback] attribution persistence threw:', err)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const intent = searchParams.get('intent')

  if (code) {
    const isNewSignup = intent === 'signup'
    const destination = isNewSignup ? '/onboarding' : next
    const redirectUrl = new URL(`${origin}${destination}`)
    if (isNewSignup) {
      redirectUrl.searchParams.set('registered', '1')
    }
    const redirectResponse = NextResponse.redirect(redirectUrl.toString())

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

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await persistFirstTouchAttribution(request, redirectResponse, supabase)
      return redirectResponse
    }
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`)
}
