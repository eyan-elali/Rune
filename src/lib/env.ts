const REQUIRED: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_STRIPE_SCRIBE_MONTHLY_USD:
    process.env.NEXT_PUBLIC_STRIPE_SCRIBE_MONTHLY_USD,
  NEXT_PUBLIC_STRIPE_SCRIBE_ANNUAL_USD:
    process.env.NEXT_PUBLIC_STRIPE_SCRIBE_ANNUAL_USD,
  NEXT_PUBLIC_STRIPE_ARCANE_MONTHLY_USD:
    process.env.NEXT_PUBLIC_STRIPE_ARCANE_MONTHLY_USD,
  NEXT_PUBLIC_STRIPE_ARCANE_ANNUAL_USD:
    process.env.NEXT_PUBLIC_STRIPE_ARCANE_ANNUAL_USD,
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
