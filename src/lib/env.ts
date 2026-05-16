const REQUIRED: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

for (const [key, value] of Object.entries(REQUIRED)) {
  if (!value) {
    throw new Error(
      `[Rune] Missing required environment variable: ${key}\n` +
        `Add it to .env.local (local dev) or Vercel environment variables (production).\n` +
        `See DEPLOYMENT.md for setup instructions.`
    );
  }
}

export const env = REQUIRED as Record<keyof typeof REQUIRED, string>;
