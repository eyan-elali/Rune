import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMostRecentProjectId } from "@/lib/rune2/projectManuscript";

// Temporary entry: open the writer's current Project (most recently updated,
// as on the Dashboard). The real Projects experience comes later.
export default async function Rune2EntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const projectId = user ? await getMostRecentProjectId(user.id) : null;
  if (projectId) redirect(`/rune2/${projectId}`);

  return (
    <div className="r2 flex h-dvh flex-col items-center justify-center gap-3 text-sm">
      <p style={{ color: "var(--r2-muted)" }}>You don’t have a project yet.</p>
      <Link href="/dashboard" style={{ color: "var(--r2-accent)" }}>
        Back to Rune
      </Link>
    </div>
  );
}
