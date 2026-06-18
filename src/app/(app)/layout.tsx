import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import NetworkProvider from "@/components/providers/NetworkProvider";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/types";

function isNetworkError(err: { message?: string; status?: number } | null): boolean {
  if (!err) return false;
  if ("status" in err && err.status === 0) return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed")
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // When offline, getUser() cannot reach Supabase to validate the JWT.
  // Fall back to getSession() which reads from cookies locally (no network call).
  let effectiveUser = user;
  if (!effectiveUser && isNetworkError(authError)) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    effectiveUser = session?.user ?? null;
  }

  if (!effectiveUser) {
    redirect("/login");
  }

  // Skip profile fetch when offline — it will fail anyway and AppShell handles null.
  const { data: profile } = effectiveUser
    ? await supabase
        .from("profiles")
        .select("*")
        .eq("id", effectiveUser.id)
        .single()
    : { data: null };

  return (
    <>
      <NetworkProvider />
      <AppShell profile={profile as Profile | null}>
        {children}
      </AppShell>
    </>
  );
}
