import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
      return redirectResponse
    }
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`)
}
