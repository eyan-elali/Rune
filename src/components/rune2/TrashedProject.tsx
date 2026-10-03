"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { restoreProject } from "@/lib/actions/projects";
import { useAppearance } from "./RunePreferences";

// What opening a Project in Trash shows (an old link, a bookmark, another
// tab): the Project is not entered; the writer can restore it — exactly as it
// was — or go back to Projects.
export function TrashedProject({ project }: { project: { id: string; title: string } }) {
  const router = useRouter();
  const appearance = useAppearance();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const result = await restoreProject(project.id);
      if (result.error !== null) {
        setError(`It couldn’t be restored. ${result.error}`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("You appear to be offline. Nothing was changed.");
      setBusy(false);
    }
  }

  return (
    <div className="r2 r2-page-state" data-theme={appearance}>
      <p>
        <strong>{project.title}</strong> is in Trash.
      </p>
      <p className="r2-page-state-detail">Everything in it is kept. Restore it to open it again.</p>
      {error && (
        <p role="alert" className="r2-import-error">
          {error}
        </p>
      )}
      <div className="r2-page-state-actions">
        <button type="button" className="r2-button r2-button--primary" disabled={busy} onClick={() => void restore()}>
          {busy ? "Restoring…" : "Restore project"}
        </button>
        <Link href="/projects" className="r2-button r2-button--quiet">
          Back to Projects
        </Link>
      </div>
    </div>
  );
}
