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

  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) > 0) redirect("/dashboard");

  return <OnboardingClient />;
}
