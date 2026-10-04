"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { restoreProject, trashProject } from "@/lib/actions/projects";
import type { Account } from "@/lib/rune2/account";
import { AppBar } from "./AccountMenu";
import { ICON } from "./icons";
import { ManuscriptImportDialog } from "./ManuscriptImport";
import { NavigatorMenu, type NavigatorMenuItem } from "./NavigatorMenu";
import { NewProjectDialog, RenameProjectDialog } from "./ProjectDialogs";
import { useRuneRootProps } from "./RunePreferences";

// Projects (Beta Completion A; refined in C): the quiet home of the application. The
// writer's Projects, most recently worked in first, and the two ways to begin
// one — a blank Project, or an existing manuscript imported. Nothing else
// competes: no statistics, streaks or suggestions. Each Project opens with a
// click; its few actions (rename, move to Trash) sit behind its "⋯". The
// list is one quiet grouped surface; a Project in it is a row reached for as
// a whole — its initial set like a small book cover, its title in the
// manuscript's serif, when it was last worked in, and its length — with no
// rule between one and the next.
//
// Every action resolves on the server before the list says so: a rename or a
// move to Trash refreshes the list from the server; a failure is said plainly
// and changes nothing. Moving to Trash is recoverable, so it asks nothing and
// offers Undo instead. Trash itself is a quiet link at the foot.

export type ProjectSummary = { id: string; title: string; words: number; updatedAt: string };

type Notice = { text: string; tone?: "danger"; undoId?: string };

export function ProjectsHome({
  account,
  projects,
  trashedCount,
  loadError,
  trashedNow,
}: {
  account: Account;
  projects: ProjectSummary[];
  trashedCount: number;
  loadError: string | null;
  /** A Project just moved to Trash from inside it (?trashed=id), offered for Undo. */
  trashedNow: { id: string; title: string } | null;
}) {
  const router = useRouter();
  const rootProps = useRuneRootProps();
  const [dialog, setDialog] = useState<"new" | "import" | { rename: ProjectSummary } | null>(null);
  const [menu, setMenu] = useState<{ project: ProjectSummary; at: { x: number; y: number } } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(
    trashedNow ? { text: `“${trashedNow.title}” was moved to Trash.`, undoId: trashedNow.id } : null
  );
  const [pending, setPending] = useState<string | null>(null);

  // The ?trashed= marker has done its work once shown.
  const cleared = useRef(false);
  useEffect(() => {
    if (!trashedNow || cleared.current) return;
    cleared.current = true;
    router.replace("/projects", { scroll: false });
  }, [trashedNow, router]);

  async function moveToTrash(project: ProjectSummary) {
    setPending(project.id);
    setNotice(null);
    try {
      const result = await trashProject(project.id);
      if (result.error !== null) setNotice({ text: `“${project.title}” couldn’t be moved to Trash. ${result.error}`, tone: "danger" });
      else setNotice({ text: `“${project.title}” was moved to Trash.`, undoId: project.id });
      router.refresh();
    } catch {
      setNotice({ text: "You appear to be offline. Nothing was changed.", tone: "danger" });
    } finally {
      setPending(null);
    }
  }

  async function undoTrash(id: string) {
    setPending(id);
    try {
      const result = await restoreProject(id);
      if (result.error !== null) setNotice({ text: `The project couldn’t be restored. ${result.error}`, tone: "danger" });
      else setNotice({ text: `“${result.data.title}” is back.` });
      router.refresh();
    } catch {
      setNotice({ text: "You appear to be offline. Nothing was changed.", tone: "danger" });
    } finally {
      setPending(null);
    }
  }

  function openMenu(project: ProjectSummary, e: MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ project, at: { x: r.right - 180, y: r.bottom + 4 } });
  }

  const menuItems = (p: ProjectSummary): NavigatorMenuItem[] => [
    { label: "Rename", icon: Pencil, onSelect: () => setDialog({ rename: p }) },
    { label: "Move to Trash", icon: Trash2, separator: true, onSelect: () => void moveToTrash(p) },
  ];

  const empty = !loadError && projects.length === 0;

  return (
    <div className="r2 r2-home" {...rootProps}>
      <AppBar account={account} />
      <main className="r2-home-main">
        <div className="r2-home-head">
          <h1>Projects</h1>
          {!empty && !loadError && (
            <div className="r2-home-actions">
              <button type="button" className="r2-button" onClick={() => setDialog("import")}>
                <FileUp {...ICON} aria-hidden />
                Import manuscript
              </button>
              <button type="button" className="r2-button r2-button--primary" onClick={() => setDialog("new")}>
                <Plus {...ICON} aria-hidden />
                New project
              </button>
            </div>
          )}
        </div>

        {notice && (
          <p role="status" className="r2-notice r2-home-notice" data-tone={notice.tone}>
            <span>{notice.text}</span>
            {notice.undoId && (
              <button type="button" disabled={pending === notice.undoId} onClick={() => void undoTrash(notice.undoId!)}>
                Undo
              </button>
            )}
          </p>
        )}

        {loadError ? (
          <div className="r2-home-state" role="alert">
            <p>Your projects couldn’t be loaded. Nothing has been changed.</p>
            <button type="button" className="r2-button" onClick={() => router.refresh()}>
              Try again
            </button>
          </div>
        ) : empty ? (
          <div className="r2-home-empty">
            <h2>Your desk is ready.</h2>
            <p>Begin a new novel, or bring in a manuscript you’ve already started.</p>
            <div className="r2-home-empty-actions">
              <button type="button" className="r2-button r2-button--primary" autoFocus onClick={() => setDialog("new")}>
                <Plus {...ICON} aria-hidden />
                New project
              </button>
              <button type="button" className="r2-button" onClick={() => setDialog("import")}>
                <FileUp {...ICON} aria-hidden />
                Import manuscript
              </button>
            </div>
            <p className="r2-home-empty-hint">Import reads Word (.docx), Markdown and plain text files.</p>
          </div>
        ) : (
          <ul className="r2-home-list" aria-label="Projects">
            {projects.map((p) => (
              <li key={p.id} className="r2-home-row" data-pending={pending === p.id || undefined}>
                <Link href={`/projects/${p.id}`} className="r2-home-row-main">
                  <ProjectCover title={p.title} />
                  <span className="r2-home-row-text">
                    <span className="r2-home-title">{p.title}</span>
                    <span className="r2-home-meta">
                      <EditedLabel iso={p.updatedAt} />
                    </span>
                  </span>
                  <span className="r2-home-words">{wordsLabel(p.words)}</span>
                </Link>
                <button
                  type="button"
                  className="r2-icon-button r2-home-row-more"
                  aria-label={`Actions for ${p.title}`}
                  aria-haspopup="menu"
                  aria-expanded={menu?.project.id === p.id}
                  disabled={pending === p.id}
                  onClick={(e) => openMenu(p, e)}
                >
                  <MoreHorizontal {...ICON} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {trashedCount > 0 && (
          <footer className="r2-home-foot">
            <Link href="/projects/trash" className="r2-home-trash">
              <Trash2 {...ICON} aria-hidden />
              Trash
              <span className="r2-home-trash-count">{trashedCount.toLocaleString()}</span>
            </Link>
          </footer>
        )}
      </main>

      {menu && (
        <NavigatorMenu label={`${menu.project.title} actions`} at={menu.at} items={menuItems(menu.project)} onClose={() => setMenu(null)} />
      )}
      {dialog === "new" && (
        <NewProjectDialog onClose={() => setDialog(null)} onCreated={(id) => router.push(`/projects/${id}`)} />
      )}
      {dialog === "import" && <ManuscriptImportDialog onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === "object" && (
        <RenameProjectDialog
          project={dialog.rename}
          onClose={() => setDialog(null)}
          onRenamed={() => {
            setDialog(null);
            setNotice(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** A Project's initial, set like a small cover: a mark to find it by, not decoration. */
export function ProjectCover({ title }: { title: string }) {
  const initial = [...title.trim()][0]?.toLocaleUpperCase() ?? "";
  return (
    <span className="r2-home-cover" aria-hidden>
      {initial}
    </span>
  );
}

/** Relative to the writer's own day, so worked out on their device (blank until then). */
const noSubscription = () => () => {};

function EditedLabel({ iso }: { iso: string }) {
  const onDevice = useSyncExternalStore(noSubscription, () => true, () => false);
  const label = onDevice ? editedLabel(iso) : null;
  return (
    <time dateTime={iso} className="r2-home-edited">
      {label ? `Edited ${label}` : ""}
    </time>
  );
}

export function wordsLabel(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "word" : "words"}`;
}

/** "today", "yesterday", "3 days ago", or the date. */
export function editedLabel(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(then)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
