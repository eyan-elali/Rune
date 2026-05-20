import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  
  // 1. Supabase email templates send a token_hash, not a code
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") ?? "signup"; 
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash) {
    const supabase = await createClient();
    
    // 2. Verify the email OTP token hash behind the scenes
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any,
    });

    if (!error) {
      // 3. Email is verified, session cookies are set, slide to the dashboard!
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Fallback if the token expired or failed
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}