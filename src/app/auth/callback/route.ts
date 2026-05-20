import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  
  // 1. Extract the PKCE authorization code sent by the email link
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    
    // 2. Trade the temporary code for a secure, active session cookie
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // 3. Success! Send them straight into the workspace dashboard
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Fallback if the code exchange failed or expired
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}