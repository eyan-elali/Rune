# Sutura — Deployment Guide

Step-by-step instructions for deploying Sutura (developed as Rune 2.0) to production.

> [!IMPORTANT]
> **Database changes follow `tools/db-audit/STAGING.md`.** Take a manual backup
> (production has no managed backups or PITR on the Free plan), rehearse on a
> disposable staging project, and check the exact expected catalog diff. Never
> re-run migrations 001–012 against any database. They are history and are
> already contained in the Rune 1.x baseline
> (`src/lib/supabase/baseline/production-2026-09-24.sql`). Re-running `007`
> regresses signup.
>
> **Rune 2.0 branch:** `src/lib/supabase/schema.sql` is now the Rune 2.0 schema
> (Scenes, Manuscripts), and the application code on this branch targets it
> (`scenes`, `chapters.manuscript_id`, `save_scene_checked`). This branch does
> **not** run against the Rune 1.x production database; do not deploy it there.
> Production stays on the Rune 1.x baseline until the Rune 1.x → Rune 2.0 data
> migration.
>
> The Stripe section below still describes an obsolete Arcane tier and old
> prices. The current required environment variables are listed in
> `src/lib/env.ts`.

---

## Prerequisites

- [Supabase](https://supabase.com) account
- [Vercel](https://vercel.com) account
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`)

---

## Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New Project**.
3. Choose your organisation, enter a project name (e.g. `rune`), and set a strong database password.
4. Select the region closest to your users.
5. Wait for the project to finish provisioning (~2 minutes).

---

## Step 2 — Build the Database Schema

**A new Rune 2.0 database** is built from one file:

```bash
psql "$DB_URL" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/schema.sql
```

`schema.sql` is generated (`npm --prefix tools/sync-harness run schema`) from
the Rune 1.x baseline plus every migration from 013 onward, and records those
migrations in `public.schema_migrations`. Apply only migrations numbered above
the last one it records. To check the result, run `tools/db-audit/catalog.sql`
and compare it with the locally built catalog:

```bash
npm --prefix tools/sync-harness run schema -- --check --catalog /tmp/rune2-expected.json
node tools/db-audit/diff-catalog.mjs /tmp/rune2-expected.json <export> --expect schema-only
```

**A Rune 1.x database** (production, or a staging rehearsal of it) is the
baseline plus 013 and 014 — never 015, which refuses databases holding
manuscripts:

```bash
psql "$DB_URL" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/baseline/production-2026-09-24.sql
psql "$DB_URL" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/013_schema_migrations_ledger.sql
psql "$DB_URL" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/014_assert_production_baseline.sql
```

Compare with
`node tools/db-audit/diff-catalog.mjs src/lib/supabase/catalog/production-2026-09-24.json <export> --expect schema-only`
(before 013). The Rune 2.0 database created empty from the old baseline gets
013 onward by `tools/db-audit/STAGING.md` Part 5. To see which migrations it
actually has, read its live ledger with `npm run db:migrations` (read-only).

---

## Step 3 — Enable Email Authentication

1. In the Supabase dashboard, go to **Authentication → Providers**.
2. Ensure **Email** is enabled (it is by default).
3. Optional: Disable "Confirm email" for faster local testing, but keep it enabled for production.

---

## Step 4 — Collect Environment Variables

From the Supabase dashboard → **Project Settings → API**:

| Variable                       | Where to find it                        |
| ------------------------------ | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`     | Project URL (e.g. `https://abc.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key                    |

---

## Step 5 — Configure Environment Variables in Vercel

1. Push your code to GitHub (or another Git provider).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. In the **Environment Variables** section, add:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon key
4. Set these for **Production**, **Preview**, and **Development** environments.

---

## Step 6 — Deploy

```bash
vercel --prod
```

Or trigger a deployment by pushing to your main branch.

---

## Step 7 — Set the Site URL in Supabase

After your first Vercel deployment:

1. Use the canonical production URL: `https://writesutura.com` (the apex; `www` redirects to it).
2. In Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://writesutura.com`
   - **Redirect URLs**: add `https://writesutura.com/auth/callback` (keep the local
     development callback, e.g. `http://localhost:3000/auth/callback`, alongside it)

This is required for magic-link login and email confirmation to work in production.

---

## The Sutura domain (writesutura.com)

Rune 2.0 was the development name of the product now branded **Sutura**. Its
canonical address is `https://writesutura.com` (`src/lib/brand.ts`, `SITE_URL`):
metadata, social cards and the web manifest use it. Auth emails and Stripe
return URLs use `NEXT_PUBLIC_APP_URL` (or the browser's own origin), so set that
variable in Vercel Production to `https://writesutura.com`.

Cutover, in order — none of it is automated by this repository:

1. **Vercel → Project → Settings → Domains:** add `writesutura.com` and
   `www.writesutura.com`. Make the apex the primary domain and set `www` to
   redirect to it (308). `next.config.ts` also redirects `www` → apex as a
   fallback.
2. **GoDaddy → DNS:** add exactly the records Vercel shows for each domain
   (do not copy values from elsewhere). Remove conflicting A/CNAME records
   GoDaddy created by default (parked page, forwarding).
3. Wait for Vercel to show both domains as valid and the certificates issued;
   check `https://writesutura.com` and that `https://www.writesutura.com/x?y=1`
   lands on `https://writesutura.com/x?y=1`.
4. **Vercel env:** `NEXT_PUBLIC_APP_URL=https://writesutura.com` (Production),
   then redeploy so the client bundle picks it up.
5. **Supabase → Authentication → URL Configuration:** Site URL
   `https://writesutura.com`; add `https://writesutura.com/auth/callback` to
   Redirect URLs. Keep the old production callback until no confirmation or
   sign-in email sent before the cutover can still be opened.
6. **Supabase email templates / SMTP sender**, if customised: update any
   product name, old domain or `@rune-app.com` sender address.
7. **Mailboxes:** confirm `support@writesutura.com` and
   `privacy@writesutura.com` receive mail before the cutover — the app and the
   legal pages link to them.
8. **Third parties:** Meta (Events Manager domain verification / pixel
   allowed domains), PromoteKit (site URL), Stripe (webhook endpoint and
   branding, when billing reopens), Google Search Console if used.

---

## Local Development

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd rune

# 2. Install dependencies
npm install

# 3. Create .env.local
cp .env.local.example .env.local  # then fill in real values

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Stripe Setup

### 1. Create products and prices

In the [Stripe Dashboard](https://dashboard.stripe.com):

1. Create two products: **Scribe** and **Arcane**.
2. For each product, create four prices: Monthly USD, Annual USD, Monthly CAD, Annual CAD.
   - Scribe: $6 USD/mo · $72 USD/yr · $8 CAD/mo · $84 CAD/yr
   - Arcane: $12 USD/mo · $120 USD/yr · $16 CAD/mo · $156 CAD/yr
3. Copy each price ID (starts with `price_`) into the corresponding env variable.

### 2. Configure webhook endpoint

1. Go to **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://your-domain.com/api/webhooks/stripe`
3. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

For local webhook testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

### 3. Configure the Customer Portal

Go to **Settings → Billing → Customer portal** in the Stripe dashboard and enable it.

### 4. Database

Nothing Stripe-specific to run: the billing columns, `subscription_events` and
the entitlement tables are part of the schema built in Step 2.

### Environment variables for Stripe

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | From Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | From webhook endpoint signing secret |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Project Settings → API (service_role key) |
| `NEXT_PUBLIC_APP_URL` | Your production URL (`https://writesutura.com`) — used for auth email and Stripe redirect URLs |
| `NEXT_PUBLIC_STRIPE_SCRIBE_MONTHLY_USD` | Price ID for Scribe monthly USD |
| `NEXT_PUBLIC_STRIPE_SCRIBE_MONTHLY_CAD` | Price ID for Scribe monthly CAD |
| `NEXT_PUBLIC_STRIPE_SCRIBE_ANNUAL_USD` | Price ID for Scribe annual USD |
| `NEXT_PUBLIC_STRIPE_SCRIBE_ANNUAL_CAD` | Price ID for Scribe annual CAD |
| `NEXT_PUBLIC_STRIPE_ARCANE_MONTHLY_USD` | Price ID for Arcane monthly USD |
| `NEXT_PUBLIC_STRIPE_ARCANE_MONTHLY_CAD` | Price ID for Arcane monthly CAD |
| `NEXT_PUBLIC_STRIPE_ARCANE_ANNUAL_USD` | Price ID for Arcane annual USD |
| `NEXT_PUBLIC_STRIPE_ARCANE_ANNUAL_CAD` | Price ID for Arcane annual CAD |

---

## Verify a Successful Deployment

- [ ] Landing page loads at `/`
- [ ] Sign up creates a new user and `profiles` row in Supabase
- [ ] Login redirects to `/dashboard`
- [ ] Creating a project and editing a page auto-saves
- [ ] Game modes launch without errors
- [ ] Pricing table on landing page shows USD/CAD and monthly/annual toggles
- [ ] Billing tab in Settings shows current plan
- [ ] Stripe Checkout redirects correctly with `?upgraded=true` on success
- [ ] Webhook endpoint returns 400 for invalid signatures, 200 for valid ones
