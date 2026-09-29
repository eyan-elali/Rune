"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import {
  createManuscriptMilestone,
  deleteManuscriptMilestone,
  getManuscriptMilestone,
  listManuscriptMilestones,
} from "@/lib/actions/manuscriptMilestones";
import {
  historyTime,
  MILESTONE_NAME_MAX,
  milestoneName,
  milestoneReadingOrder,
  wordsLabel,
  type MilestoneOutlineNode,
  type MilestoneScene,
  type MilestoneSnapshot,
  type MilestoneSummary,
} from "@/lib/rune2/history";
import { ProseSnapshot } from "./ProseSnapshot";

// Named Manuscript Milestones (migration 036), from the Manuscript's
// Inspector: "Draft 1", "Sent to editor". Saving one keeps the whole
// manuscript as it is now — Groups, Chapters, placed and Unplaced Scenes and
// their prose — and changes nothing in it. Opening one shows that manuscript,
// read-only. A Milestone is a picture to return to, never a branch; bringing
// one Scene's text back goes through that Scene's history.

export function MilestonesSection({ projectId }: { projectId: string }) {
  const [milestones, setMilestones] = useState<MilestoneSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const openers = useRef(new Map<string, HTMLButtonElement>());
  const addRef = useRef<HTMLButtonElement>(null);

  async function refresh() {
    const r = await listManuscriptMilestones(projectId);
    if (r.error !== null) setFailed(true);
    else {
      setFailed(false);
      setMilestones(r.data);
    }
  }

  useEffect(() => {
    let live = true;
    void listManuscriptMilestones(projectId).then((r) => {
      if (!live) return;
      if (r.error !== null) setFailed(true);
      else setMilestones(r.data);
    });
    return () => {
      live = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function save() {
    const checked = milestoneName(name);
    if (checked.error !== null) {
      setError(checked.error);
      return;
    }
    startSaving(async () => {
      const r = await createManuscriptMilestone(projectId, checked.name);
      if (r.error !== null) {
        setError(r.error === "Manuscript not found" ? "The milestone couldn’t be saved." : r.error);
        return;
      }
      setNaming(false);
      setName("");
      setError(null);
      setNotice(`Saved “${checked.name}”.`);
      await refresh();
      addRef.current?.focus();
    });
  }

  return (
    <section className="r2-milestones" aria-label="Milestones">
      <h3 className="r2-links-head">Milestones</h3>
      {failed && !milestones && <p className="r2-panel-empty">Milestones couldn’t be loaded.</p>}
      {milestones && milestones.length > 0 && (
        <ul className="r2-milestone-list">
          {milestones.map((m) => (
            <li key={m.id}>
              <button
                ref={(el) => {
                  if (el) openers.current.set(m.id, el);
                  else openers.current.delete(m.id);
                }}
                type="button"
                className="r2-milestone-item"
                aria-haspopup="dialog"
                onClick={() => setOpenId(m.id)}
              >
                <span className="r2-milestone-name">{m.name}</span>
                <span className="r2-milestone-meta">
                  {historyTime(m.created_at)} · {wordsLabel(m.manuscript_words)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {naming ? (
        <form
          className="r2-milestone-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="r2-milestone-label" htmlFor="r2-milestone-name">
            Keeps the whole manuscript as it is now — every chapter and scene, placed and unplaced.
          </label>
          <input
            id="r2-milestone-name"
            className="r2-milestone-input"
            value={name}
            maxLength={MILESTONE_NAME_MAX}
            placeholder="Draft 1"
            autoFocus
            disabled={saving}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "r2-milestone-error" : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setNaming(false);
                setError(null);
                addRef.current?.focus();
              }
            }}
          />
          {error && (
            <p id="r2-milestone-error" role="alert" className="r2-panel-notice">
              {error}
            </p>
          )}
          <div className="r2-milestone-form-actions">
            <button
              type="button"
              className="r2-button"
              disabled={saving}
              onClick={() => {
                setNaming(false);
                setError(null);
              }}
            >
              Cancel
            </button>
            <button type="submit" className="r2-button r2-button--primary" disabled={saving}>
              {saving ? "Saving…" : "Save milestone"}
            </button>
          </div>
        </form>
      ) : (
        <button ref={addRef} type="button" className="r2-panel-link r2-milestone-add" onClick={() => setNaming(true)}>
          Save a milestone…
        </button>
      )}
      {notice && (
        <p role="status" className="r2-panel-notice">
          {notice}
        </p>
      )}

      {openId && (
        <MilestoneDialog
          milestoneId={openId}
          onClose={() => {
            const opener = openers.current.get(openId);
            setOpenId(null);
            (opener ?? addRef.current)?.focus();
          }}
          onDeleted={(deletedName) => {
            setOpenId(null);
            setNotice(`Deleted “${deletedName}”. The manuscript is unchanged.`);
            void refresh();
            addRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}

function MilestoneDialog({
  milestoneId,
  onClose,
  onDeleted,
}: {
  milestoneId: string;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<MilestoneSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void getManuscriptMilestone(milestoneId).then((r) => {
      if (!live) return;
      if (r.error !== null) setFailed(true);
      else setSnapshot(r.data);
    });
    return () => {
      live = false;
    };
  }, [milestoneId]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function remove() {
    if (!snapshot) return;
    startDeleting(async () => {
      const r = await deleteManuscriptMilestone(milestoneId);
      if (r.error !== null) {
        setDeleteError(true);
        return;
      }
      onDeleted(snapshot.milestone.name);
    });
  }

  const order = snapshot ? milestoneReadingOrder(snapshot) : null;
  const m = snapshot?.milestone;

  return (
    <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !deleting && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="r2-dialog r2-milestone-view"
        role="dialog"
        aria-modal="true"
        aria-labelledby="r2-milestone-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (confirmingDelete) setConfirmingDelete(false);
            else if (!deleting) onClose();
          }
        }}
      >
        <header className="r2-history-head">
          <h2 id="r2-milestone-title">{m ? m.name : "Milestone"}</h2>
          {m && (
            <p className="r2-history-scene">
              Saved {historyTime(m.created_at)} · {wordsLabel(m.manuscript_words)}
              {m.unplaced_words > 0 && <> · {wordsLabel(m.unplaced_words)} unplaced</>}
            </p>
          )}
        </header>

        <div className="r2-milestone-body">
          {failed ? (
            <p role="alert">This milestone couldn’t be opened.</p>
          ) : !order ? (
            <p className="r2-history-hint">Opening…</p>
          ) : (
            <>
              <p className="r2-milestone-caption">
                The manuscript as it was when this milestone was saved. Read-only: it never changes.
              </p>
              {order.outline.length === 0 && order.unplaced.length === 0 && (
                <p className="r2-history-hint">The manuscript held no chapters or scenes.</p>
              )}
              <Outline nodes={order.outline} />
              {order.unplaced.length > 0 && (
                <section className="r2-milestone-unplaced" aria-label="Unplaced Scenes">
                  <h3 className="r2-milestone-group" data-depth={0}>
                    Unplaced Scenes
                  </h3>
                  {order.unplaced.map((s) => (
                    <div key={s.scene_id} className="r2-milestone-scene">
                      <p className="r2-milestone-scene-title">{s.title}</p>
                      <ProseSnapshot content={s.content} empty="Empty scene." />
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>

        {deleteError && (
          <p role="alert" className="r2-history-notice" data-tone="alert">
            The milestone couldn’t be deleted.
          </p>
        )}

        <div className="r2-dialog-actions r2-history-actions">
          {confirmingDelete && m ? (
            <>
              <p className="r2-history-confirm">
                Delete “{m.name}”? Its copy of the manuscript can’t be recovered. Your manuscript is not changed.
              </p>
              <button type="button" className="r2-button" disabled={deleting} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button type="button" className="r2-button r2-button--danger" disabled={deleting} autoFocus onClick={remove}>
                {deleting ? "Deleting…" : "Delete milestone"}
              </button>
            </>
          ) : (
            <>
              {m && (
                <button type="button" className="r2-panel-link r2-milestone-delete" onClick={() => setConfirmingDelete(true)}>
                  Delete milestone
                </button>
              )}
              <button type="button" className="r2-button" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Outline({ nodes }: { nodes: MilestoneOutlineNode[] }) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === "group" ? (
          <Fragment key={node.group.id}>
            {node.group.title && (
              <h3 className="r2-milestone-group" data-depth={Math.min(node.depth, 2)}>
                {node.group.title}
              </h3>
            )}
            <Outline nodes={node.children} />
          </Fragment>
        ) : (
          <section key={node.chapter.id} className="r2-milestone-chapter" aria-label={node.chapter.title}>
            <h4 className="r2-milestone-chapter-title">{node.chapter.title}</h4>
            {node.chapter.scenes.length === 0 ? (
              <p className="r2-history-hint">No scenes.</p>
            ) : (
              node.chapter.scenes.map((s: MilestoneScene, i) => (
                <div key={s.scene_id} className="r2-milestone-scene" data-break={i > 0 || undefined}>
                  <ProseSnapshot content={s.content} empty="Empty scene." />
                </div>
              ))
            )}
          </section>
        )
      )}
    </>
  );
}
