import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SupportedDeviceGate } from "@/components/layout/SupportedDeviceGate";
import { isPenNameMissing } from "@/lib/penName";
import "./rune2.css";

// Rune 2.0 — a separate shell, deliberately outside the (app) route group so
// nothing of the legacy AppShell, Sidebar or theme chrome renders here. It
// keeps the same entry rules as (app): signed in (the proxy also enforces
// this), a pen name chosen, and a supported (non-phone) device.

export const metadata: Metadata = {
  title: "Rune 2.0",
};

export default async function Rune2Layout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, preferences")
    .eq("id", user.id)
    .single();
  if (!error && profile && isPenNameMissing(profile.display_name)) {
    redirect("/complete-profile");
  }

  return (
    <SupportedDeviceGate
      variant="returning"
      preferences={profile?.preferences as Record<string, unknown> | null}
    >
      {children}
    </SupportedDeviceGate>
  );
}
