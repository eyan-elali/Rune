import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { SupportedDeviceGate } from "@/components/layout/SupportedDeviceGate";
import NetworkProvider from "@/components/providers/NetworkProvider";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import { isPenNameMissing } from "@/lib/penName";
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

  // Skip these fetches when offline — they will fail anyway and AppShell handles null.
  // Project count is fetched (not manuscript content, just a head count) once here
  // and reused both for the update notice and to distinguish a new/onboarding
  // account from a returning one for the phone waiting-room copy.
  const [{ data: profile, error: profileError }, { count: projectCount }] = effectiveUser
    ? await Promise.all([
        supabase.from("profiles").select("*").eq("id", effectiveUser.id).single(),
        supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("user_id", effectiveUser.id),
      ])
    : [{ data: null, error: null }, { count: null }];

  // Every account needs a chosen pen name before entering the writing
  // experience. Only redirect on a confirmed, successful lookup — a failed
  // fetch (e.g. offline) falls through rather than risking a redirect loop
  // or blocking offline access to a profile we simply couldn't read.
  if (!profileError && profile && isPenNameMissing(profile.display_name)) {
    redirect("/complete-profile");
  }

  let showUpdateNotice = false;
  if (profile) {
    const prefs = (profile.preferences as Record<string, unknown>) ?? {};
    const hasSeenNotice = prefs.has_seen_guides_update_notice === true;
    showUpdateNotice = !hasSeenNotice && (projectCount ?? 0) > 0;
  }

  const gateVariant = (projectCount ?? 0) > 0 ? "returning" : "new";

  return (
    <>
      <NetworkProvider />
      <RegistrationTracker />
      <SupportedDeviceGate
        variant={gateVariant}
        preferences={profile?.preferences as Record<string, unknown> | null}
      >
        <AppShell profile={profile as Profile | null} showUpdateNotice={showUpdateNotice}>
          {children}
        </AppShell>
      </SupportedDeviceGate>
    </>
  );
}
