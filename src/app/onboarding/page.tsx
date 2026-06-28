import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingClient } from "./OnboardingClient";

export const metadata = {
  title: "Begin Your Story | Rune",
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ count }, { data: profile }] = await Promise.all([
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", user.id)
      .single(),
  ]);

  if ((count ?? 0) > 0) redirect("/dashboard");

  const authorName =
    profile?.display_name ||
    profile?.username ||
    user.email?.split("@")[0] ||
    null;

  return <OnboardingClient authorName={authorName} />;
}
