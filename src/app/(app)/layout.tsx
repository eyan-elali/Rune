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
      <div className="flex h-screen w-[18%] min-w-[200px] max-w-[280px] shrink-0 flex-col overflow-hidden md:w-[15%] md:min-w-[180px] lg:w-[18%] lg:min-w-[200px]">
        <Sidebar
          displayName={displayName}
          avatarUrl={profile?.avatar_url ?? null}
        />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main
          className="min-h-0 flex-1 overflow-auto"
          style={{ background: "var(--color-ink)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
