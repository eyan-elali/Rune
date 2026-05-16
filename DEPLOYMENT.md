# Rune — Deployment Guide

Step-by-step instructions for deploying Rune to production.

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

## Step 2 — Run the Database Schema

1. In the Supabase dashboard, go to **SQL Editor**.
2. Click **New query**.
3. Paste the entire contents of `src/lib/supabase/schema.sql`.
4. Click **Run**.

This creates all tables, enables Row Level Security, and installs the trigger that auto-creates a `profiles` row on sign-up.

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

1. Copy your production URL (e.g. `https://rune.vercel.app`).
2. In Supabase → **Authentication → URL Configuration**:
   - **Site URL**: set to your production URL
   - **Redirect URLs**: add `https://your-domain.vercel.app/auth/callback`

This is required for magic-link login and email confirmation to work in production.

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

## Verify a Successful Deployment

- [ ] Landing page loads at `/`
- [ ] Sign up creates a new user and `profiles` row in Supabase
- [ ] Login redirects to `/dashboard`
- [ ] Creating a project and editing a page auto-saves
- [ ] Game modes launch without errors
