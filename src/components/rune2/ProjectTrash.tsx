"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { restoreProject } from "@/lib/actions/projects";
import type { Account } from "@/lib/rune2/account";
import { AppBar } from "./AccountMenu";
import { ICON } from "./icons";
import { DeleteProjectDialog } from "./ProjectDialogs";
import { BackupDialog } from "./ProjectExport";
import { ProjectCover, wordsLabel } from "./ProjectsHome";
import { useRuneRootProps } from "./RunePreferences";

// Project Trash: each trashed Project with what can be done with it — Restore
// (identity and content intact), a backup (it only reads), and permanent
// deletion, which only happens here and only after the writer types the
// Project's title. Every outcome is shown after the server confirms it.

export type TrashedProjectSummary = { id: string; title: string; words: number; trashedAt: string };

type Notice = { text: string; tone?: "danger" };

export function ProjectTrash({
  account,
  projects,
  loadError,
}: {
  account: Account;
  projects: TrashedProjectSummary[];
  loadError: string | null;
}) {
  const router = useRouter();
  const rootProps = useRuneRootProps();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<{ kind: "delete" | "backup"; project: TrashedProjectSummary } | null>(null);

  async function restore(p: TrashedProjectSummary) {
    setPending(p.id);
    setNotice(null);
    try {
      const result = await restoreProject(p.id);
      if (result.error !== null) setNotice({ text: `“${p.title}” couldn’t be restored. ${result.error}`, tone: "danger" });
      else setNotice({ text: `“${p.title}” was restored to Projects.` });
      router.refresh();
    } catch {
      setNotice({ text: "You appear to be offline. Nothing was changed.", tone: "danger" });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="r2 r2-home" {...rootProps}>
      <AppBar account={account} />
      <main className="r2-home-main">
        <Link href="/projects" className="r2-home-back">
          <ArrowLeft {...ICON} aria-hidden />
          Projects
        </Link>
        <div className="r2-home-head">
          <h1>Trash</h1>
        </div>
        <p className="r2-home-intro">
          Projects in Trash keep everything in them. Restore one to open it again, or delete it permanently.
        </p>

        {notice && (
          <p role="status" className="r2-notice r2-home-notice" data-tone={notice.tone}>
            <span>{notice.text}</span>
          </p>
        )}

        {loadError ? (
          <div className="r2-home-state" role="alert">
            <p>Trash couldn’t be loaded. Nothing has been changed.</p>
            <button type="button" className="r2-button" onClick={() => router.refresh()}>
              Try again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="r2-home-empty r2-home-empty--quiet">
            <h2>Trash is empty.</h2>
            <p>A project you move to Trash waits here, whole, until you restore it or delete it permanently.</p>
          </div>
        ) : (
          <ul className="r2-home-list" aria-label="Projects in Trash">
            {projects.map((p) => (
              <li key={p.id} className="r2-home-row r2-trash-row" data-pending={pending === p.id || undefined}>
                <div className="r2-home-row-main">
                  <ProjectCover title={p.title} />
                  <span className="r2-home-row-text">
                    <span className="r2-home-title">{p.title}</span>
                    <span className="r2-home-meta">
                      <span>{wordsLabel(p.words)}</span>
                      <TrashedLabel iso={p.trashedAt} />
                    </span>
                  </span>
                </div>
                <div className="r2-trash-row-actions">
                  <button type="button" className="r2-button r2-button--sm" disabled={pending === p.id} onClick={() => void restore(p)}>
                    {pending === p.id ? "Restoring…" : "Restore"}
                  </button>
                  <button
                    type="button"
                    className="r2-button r2-button--quiet r2-button--sm"
                    disabled={pending === p.id}
                    onClick={() => setDialog({ kind: "backup", project: p })}
                  >
                    Download backup
                  </button>
                  <button
                    type="button"
                    className="r2-button r2-button--quiet r2-button--sm"
                    data-tone="danger"
                    disabled={pending === p.id}
                    onClick={() => setDialog({ kind: "delete", project: p })}
                  >
                    Delete permanently…
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {dialog?.kind === "backup" && <BackupDialog project={dialog.project} onClose={() => setDialog(null)} />}
      {dialog?.kind === "delete" && (
        <DeleteProjectDialog
          project={dialog.project}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setNotice({ text: `“${dialog.project.title}” was deleted permanently.` });
            setDialog(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TrashedLabel({ iso }: { iso: string }) {
  const d = new Date(iso);
  // A calendar date reads the same on server and device; no relative wording needed here.
  const text = Number.isNaN(d.getTime()) ? "" : `Moved to Trash ${d.toISOString().slice(0, 10)}`;
  return <time dateTime={iso}>{text}</time>;
}
