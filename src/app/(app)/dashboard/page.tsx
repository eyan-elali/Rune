import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user!.id)
    .single();

  const name =
    profile?.display_name ?? user?.email?.split("@")[0] ?? "Writer";

  return (
    <div className="px-10 py-14">
      <h1 className="font-rune-serif text-4xl text-rune-parchment">
        Welcome back, {name}.
      </h1>
      <p className="mt-3 font-rune-serif text-lg text-rune-mist">
        Your projects await.
      </p>
    </div>
  );
}
