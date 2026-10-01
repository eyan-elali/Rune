"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { FileText, Flag, Pilcrow } from "lucide-react";
import { ICON, ICON_SM } from "./icons";
import { InspectorSection } from "./InspectorSection";
import {
  createManuscriptMilestone,
  deleteManuscriptMilestone,
  getManuscriptMilestone,
  listManuscriptMilestones,
  listObjectMilestones,
} from "@/lib/actions/manuscriptMilestones";
import {
  historyTime,
  MILESTONE_NAME_MAX,
  milestoneAnchor,
  milestoneHas,
  milestoneName,
  milestoneNavigator,
  milestoneReadingOrder,
  objectMilestonePlace,
  wordsLabel,
  type MilestoneNavRow,
  type MilestoneOutlineNode,
  type MilestoneScene,
  type MilestoneSnapshot,
  type MilestoneSummary,
  type MilestoneTarget,
  type ObjectMilestone,
} from "@/lib/rune2/history";
import { sceneLabel } from "@/lib/rune2/navigatorModel";
import { ProseSnapshot } from "./ProseSnapshot";

// Named Manuscript Milestones (migration 036), from the Manuscript's
// Inspector: "Draft 1", "Sent to editor". Saving one keeps the whole
// manuscript as it is now — Groups, Chapters, placed and Unplaced Scenes and
// their prose — and changes nothing in it. Opening one shows that manuscript,
// read-only, with its own navigator (Groups, Chapters, Scenes, Unplaced
// Scenes, as they were) to go straight to a part of it; a Scene's or
// Chapter's Inspector opens it at that Scene or Chapter. A Milestone is a
// picture to return to, never a branch: nothing in it can be edited, and
// nothing in the live manuscript changes. Bringing one Scene's text back goes
// through that Scene's history.

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
    <InspectorSection
      title="Milestones"
      caption="Named pictures of the whole manuscript, kept as it was."
      aside={
        !naming ? (
          <button ref={addRef} type="button" className="r2-insp-aside-link r2-milestone-add" onClick={() => setNaming(true)}>
            Save a milestone
          </button>
        ) : undefined
      }
    >
      {failed && !milestones && <p className="r2-insp-empty">Milestones couldn’t be loaded.</p>}
      {milestones && milestones.length === 0 && !naming && <p className="r2-insp-empty">None yet.</p>}
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
                <Flag className="r2-milestone-flag" {...ICON_SM} aria-hidden />
                <span className="r2-milestone-text">
                  <span className="r2-milestone-name">{m.name}</span>
                  <span className="r2-milestone-meta">
                    {historyTime(m.created_at)} · {wordsLabel(m.manuscript_words)}
                  </span>
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
            className="r2-field r2-milestone-input"
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
      ) : null}
      {notice && (
        <p role="status" className="r2-panel-notice">
          {notice}
        </p>
      )}

      {openId && (
        <MilestoneViewer
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
    </InspectorSection>
  );
}

/**
 * The named Milestones that hold one live Scene or Chapter, in its Inspector —
 * apart from the Scene's automatic History. Choosing one opens that Milestone
 * at this Scene or Chapter, read-only. Quietly absent when the Milestones
 * can't be listed (e.g. before migration 037).
 */
export function ObjectMilestonesSection({ kind, id }: { kind: "scene" | "chapter"; id: string }) {
  const [milestones, setMilestones] = useState<ObjectMilestone[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let live = true;
    void listObjectMilestones(kind, id).then((r) => {
      if (live && r.error === null) setMilestones(r.data);
    });
    return () => {
      live = false;
    };
  }, [kind, id]);

  if (!milestones) return null;
  return (
    <InspectorSection
      title="Milestones"
      caption={milestones.length > 0 ? `Named manuscript snapshots that hold this ${kind}.` : undefined}
    >
      {milestones.length === 0 ? (
        <p className="r2-insp-empty">Not in a named milestone yet.</p>
      ) : (
        <ul className="r2-milestone-list">
          {milestones.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="r2-milestone-item"
                aria-haspopup="dialog"
                onClick={(e) => {
                  opener.current = e.currentTarget;
                  setOpenId(m.id);
                }}
              >
                <Flag className="r2-milestone-flag" {...ICON_SM} aria-hidden />
                <span className="r2-milestone-text">
                  <span className="r2-milestone-name">{m.name}</span>
                  <span className="r2-milestone-meta">
                    {historyTime(m.created_at)} · {objectMilestonePlace(kind, m)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openId && (
        <MilestoneViewer
          milestoneId={openId}
          target={{ kind, id }}
          onClose={() => {
            setOpenId(null);
            opener.current?.focus();
          }}
        />
      )}
    </InspectorSection>
  );
}

/**
 * One Milestone, read-only, in a dialog: its navigator beside the manuscript
 * as it was. `target` opens it at that Chapter or Scene. Deleting the
 * Milestone is offered only where `onDeleted` is given (the Manuscript's
 * Inspector).
 */
export function MilestoneViewer({
  milestoneId,
  target = null,
  onClose,
  onDeleted,
}: {
  milestoneId: string;
  target?: MilestoneTarget | null;
  onClose: () => void;
  onDeleted?: (name: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<MilestoneSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [current, setCurrent] = useState<MilestoneTarget | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

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

  /** Brings a Chapter or Scene of the snapshot into view and gives it focus. */
  function go(to: MilestoneTarget, smooth: boolean) {
    const body = bodyRef.current;
    const el = document.getElementById(milestoneAnchor(to));
    if (!body || !el || !body.contains(el)) return;
    const top = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8;
    // A long way through a whole manuscript is a jump, not a glide.
    const near = Math.abs(top - body.scrollTop) < body.clientHeight * 2;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    body.scrollTo({ top, behavior: smooth && near && !reduced ? "smooth" : "auto" });
    el.focus({ preventScroll: true });
    setCurrent(to);
  }

  // Opened at a Chapter or Scene: go there once the snapshot is shown.
  const missing = Boolean(snapshot && target && !milestoneHas(snapshot, target));
  useEffect(() => {
    if (!snapshot || !target || !milestoneHas(snapshot, target)) return;
    const frame = requestAnimationFrame(() => go(target, false));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  function remove() {
    if (!snapshot) return;
    startDeleting(async () => {
      const r = await deleteManuscriptMilestone(milestoneId);
      if (r.error !== null) {
        setDeleteError(true);
        return;
      }
      onDeleted?.(snapshot.milestone.name);
    });
  }

  const order = snapshot ? milestoneReadingOrder(snapshot) : null;
  const rows = order ? milestoneNavigator(order) : [];
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

        <div className="r2-milestone-layout" data-navigable={rows.length > 1 || undefined}>
          {rows.length > 1 && <MilestoneNav rows={rows} current={current} onGo={(to) => go(to, true)} />}
          <div ref={bodyRef} className="r2-milestone-body">
            {failed ? (
              <p role="alert">This milestone couldn’t be opened.</p>
            ) : !order ? (
              <p className="r2-history-hint">Opening…</p>
            ) : (
              <>
                <p className="r2-milestone-caption">
                  The manuscript as it was when this milestone was saved. Read-only: it never changes.
                </p>
                {missing && (
                  <p role="status" className="r2-milestone-caption">
                    {target?.kind === "chapter" ? "This chapter" : "This scene"} isn’t part of this milestone.
                  </p>
                )}
                {order.outline.length === 0 && order.unplaced.length === 0 && (
                  <p className="r2-history-hint">The manuscript held no chapters or scenes.</p>
                )}
                <Outline nodes={order.outline} current={current} />
                {order.unplaced.length > 0 && (
                  <section className="r2-milestone-unplaced" aria-label="Unplaced Scenes">
                    <h3 className="r2-milestone-group" data-depth={0}>
                      Unplaced Scenes
                    </h3>
                    {order.unplaced.map((s) => (
                      <div
                        key={s.scene_id}
                        id={milestoneAnchor({ kind: "scene", id: s.scene_id })}
                        tabIndex={-1}
                        className="r2-milestone-scene"
                        data-current={(current?.kind === "scene" && current.id === s.scene_id) || undefined}
                      >
                        <p className="r2-milestone-scene-title">{sceneLabel(s.title, null)}</p>
                        <ProseSnapshot content={s.content} empty="Empty scene." />
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
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
              {m && onDeleted && (
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

/**
 * The snapshot's structure, to go straight to a Chapter or Scene. Groups are
 * headings; the row showing is marked. Read-only: nothing here moves or
 * changes anything.
 */
function MilestoneNav({
  rows,
  current,
  onGo,
}: {
  rows: MilestoneNavRow[];
  current: MilestoneTarget | null;
  onGo: (to: MilestoneTarget) => void;
}) {
  return (
    <nav className="r2-milestone-nav" aria-label="Milestone contents">
      <ul role="list">
        {rows.map((row) => {
          const pad = { paddingLeft: 6 + row.depth * 14 };
          if (row.kind === "group" || row.kind === "unplacedHeading") {
            return (
              <li key={`${row.kind}:${row.id}`} className="r2-milestone-nav-heading" style={pad}>
                {row.label}
              </li>
            );
          }
          const to: MilestoneTarget = { kind: row.kind, id: row.id };
          const Icon = row.kind === "chapter" ? FileText : row.chapterId === null ? Pilcrow : null;
          return (
            <li key={`${row.kind}:${row.id}`}>
              <button
                type="button"
                className="r2-milestone-nav-item"
                data-kind={row.kind}
                aria-current={(current?.kind === row.kind && current.id === row.id) || undefined}
                style={pad}
                onClick={() => onGo(to)}
              >
                {Icon && <Icon {...ICON} aria-hidden />}
                <span className="r2-milestone-nav-label">{row.label}</span>
                <span className="r2-milestone-nav-words" aria-label={wordsLabel(row.words)}>
                  {row.words.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Outline({ nodes, current }: { nodes: MilestoneOutlineNode[]; current: MilestoneTarget | null }) {
  const isCurrent = (kind: MilestoneTarget["kind"], id: string) => (current?.kind === kind && current.id === id) || undefined;
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
            <Outline nodes={node.children} current={current} />
          </Fragment>
        ) : (
          <section
            key={node.chapter.id}
            id={milestoneAnchor({ kind: "chapter", id: node.chapter.id })}
            tabIndex={-1}
            className="r2-milestone-chapter"
            aria-label={node.chapter.title}
            data-current={isCurrent("chapter", node.chapter.id)}
          >
            <h4 className="r2-milestone-chapter-title">{node.chapter.title}</h4>
            {node.chapter.scenes.length === 0 ? (
              <p className="r2-history-hint">No scenes.</p>
            ) : (
              node.chapter.scenes.map((s: MilestoneScene, i) => (
                <div
                  key={s.scene_id}
                  id={milestoneAnchor({ kind: "scene", id: s.scene_id })}
                  tabIndex={-1}
                  className="r2-milestone-scene"
                  aria-label={node.chapter.scenes.length > 1 ? sceneLabel(s.title, i + 1) : undefined}
                  data-break={i > 0 || undefined}
                  data-current={isCurrent("scene", s.scene_id)}
                >
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
