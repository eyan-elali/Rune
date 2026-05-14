import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import type { ReactNode } from "react";

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
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.display_name ?? user.email?.split("@")[0] ?? "Writer";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        displayName={displayName}
        avatarUrl={profile?.avatar_url ?? null}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main
          className="flex-1 overflow-auto"
          style={{ background: "var(--color-ink)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
