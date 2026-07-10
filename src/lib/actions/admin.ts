"use server";

// Small, reusable admin-access helper. There is exactly one admin flag in
// Rune — profiles.is_admin — and it can only ever be changed by hand in the
// Supabase SQL editor (see the protect_is_admin trigger in schema.sql, which
// blocks any authenticated-client write to the column). Nothing in this file
// grants admin access; it only checks it.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AdminUser {
  id: string;
  email: string | null;
}

// Checks the current session against profiles.is_admin using the normal,
// RLS-scoped client — a user can only ever read their own row, so this can
// never leak another user's admin status. Returns null for both "not signed
// in" and "signed in but not an admin" so callers can't distinguish the two,
// which matches the "appropriate redirect" requirement for non-admins.
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;

  return { id: user.id, email: user.email ?? null };
}

// Call at the top of any admin-only server component/route. Throws Next's
// redirect (which must not be caught) for anyone who isn't a signed-in admin.
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/dashboard");
  return admin;
}
