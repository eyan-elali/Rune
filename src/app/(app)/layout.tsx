import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import NetworkProvider from "@/components/providers/NetworkProvider";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/types";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <>
      <NetworkProvider />
      <AppShell profile={profile as Profile | null}>
        {children}
      </AppShell>
    </>
  );
}
