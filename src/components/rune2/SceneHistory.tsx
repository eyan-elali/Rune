"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSceneRevision, listSceneHistory, restoreSceneRevision } from "@/lib/actions/sceneHistory";
import { cacheScene, getPendingWrite } from "@/lib/offline/db";
import {
  historyTime,
  revisionNote,
  wordsLabel,
  type SceneHistory,
  type SceneRevision,
} from "@/lib/rune2/history";
import { SCENE_RESTORED_EVENT } from "@/lib/sceneRestoredEvent";
import { useNetworkStore } from "@/store/networkStore";
import { ProseSnapshot } from "./ProseSnapshot";

// Scene History (migration 036): a quiet way into a Scene's earlier texts,
// from the Inspector — never inside the manuscript editor. The dialog lists
// them by when they were saved, previews one read-only, and restores it: a
// new save of that text (the text it replaces stays in History). Nothing here
// is version control; there is nothing to manage.

export function SceneHistorySection({ sceneId, projectId }: { sceneId: string; projectId: string }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <section className="r2-history-entry" aria-label="Scene history">
      <button ref={opener} type="button" className="r2-panel-link" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Scene history
      </button>
      {open && (
        <SceneHistoryDialog
          sceneId={sceneId}
          projectId={projectId}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      )}
    </section>
  );
}

type Notice = { tone: "info" | "alert"; text: string };

function SceneHistoryDialog({
  sceneId,
  projectId,
  onClose,
}: {
  sceneId: string;
  projectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [history, setHistory] = useState<SceneHistory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, SceneRevision | "failed">>({});
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [restoring, startRestoring] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await listSceneHistory(sceneId);
    if (r.error !== null) {
      setLoadError(r.error);
      return null;
    }
    setLoadError(null);
    setHistory(r.data);
    return r.data;
  }, [sceneId]);

  useEffect(() => {
    let live = true;
    void listSceneHistory(sceneId).then((r) => {
      if (!live) return;
      if (r.error !== null) setLoadError(r.error);
      else setHistory(r.data);
    });
    return () => {
      live = false;
    };
  }, [sceneId]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const selected = history?.revisions.find((r) => r.id === selectedId) ?? null;
  const preview = selectedId ? previews[selectedId] : undefined;

  function select(id: string) {
    setSelectedId(id);
    setConfirming(false);
    setNotice(null);
    if (previews[id]) return;
    void getSceneRevision(id).then((r) =>
      setPreviews((prev) => ({ ...prev, [id]: r.error !== null ? "failed" : r.data }))
    );
  }

  function restore() {
    if (!selected || !history) return;
    startRestoring(async () => {
      if (!isOnline) {
        setNotice({ tone: "alert", text: "Restoring needs a connection. Nothing was changed." });
        return;
      }
      // Text still waiting to save on this device must land first; the
      // restore never races it.
      if (await getPendingWrite(sceneId)) {
        setNotice({ tone: "alert", text: "This scene has changes that are still saving. Try again in a moment." });
        return;
      }
      const r = await restoreSceneRevision(selected.id, history.scene.version);
      setConfirming(false);
      switch (r.status) {
        case "ok":
          await cacheScene(r.scene, projectId);
          window.dispatchEvent(new CustomEvent(SCENE_RESTORED_EVENT, { detail: r.scene }));
          router.refresh();
          await load();
          setSelectedId(null);
          setNotice({ tone: "info", text: "Restored. The text it replaced is kept in this history." });
          return;
        case "unchanged":
          setNotice({ tone: "info", text: "The scene already holds this text." });
          return;
        case "version_mismatch":
          await load();
          setNotice({ tone: "alert", text: "The scene changed since this history was opened. Nothing was restored; the list is up to date now." });
          return;
        case "word_limit_blocked":
          setNotice({ tone: "alert", text: "Restoring this version would go past your free words. The scene is unchanged." });
          return;
        case "error":
          setNotice({ tone: "alert", text: "The version couldn’t be restored. The scene is unchanged." });
          return;
      }
    });
  }

  return (
    <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !restoring && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="r2-dialog r2-history"
        role="dialog"
        aria-modal="true"
        aria-labelledby="r2-history-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (confirming) setConfirming(false);
            else if (!restoring) onClose();
          }
        }}
      >
        <header className="r2-history-head">
          <h2 id="r2-history-title">Scene history</h2>
          {history && <p className="r2-history-scene">{history.scene.title}</p>}
        </header>

        {loadError ? (
          <p role="alert">{loadError === "Restore this scene from Trash first" ? loadError + "." : "The history couldn’t be opened."}</p>
        ) : !history ? (
          <p className="r2-history-loading">Opening…</p>
        ) : (
          <div className="r2-history-body">
            <div className="r2-history-list">
              <p className="r2-history-now">
                <span>Current text</span>
                <span>
                  {wordsLabel(history.scene.word_count)} · {historyTime(history.scene.updated_at)}
                </span>
              </p>
              {history.revisions.length === 0 ? (
                <p className="r2-history-none">
                  No earlier versions yet. Rune keeps a scene’s text when you come back to it after a pause, and
                  about once an hour while you write.
                </p>
              ) : (
                <ul aria-label="Earlier versions">
                  {history.revisions.map((r) => {
                    const note = revisionNote(r);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="r2-history-item"
                          aria-pressed={r.id === selectedId}
                          onClick={() => select(r.id)}
                        >
                          <span className="r2-history-when">{historyTime(r.saved_at)}</span>
                          <span className="r2-history-meta">
                            {wordsLabel(r.word_count)}
                            {r.current && " · same as now"}
                          </span>
                          {note && <span className="r2-history-note">{note}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="r2-history-preview" aria-live="polite">
              {!selected ? (
                <p className="r2-history-hint">Choose a version to read it.</p>
              ) : preview === undefined ? (
                <p className="r2-history-hint">Opening…</p>
              ) : preview === "failed" ? (
                <p role="alert">This version couldn’t be opened.</p>
              ) : (
                <>
                  <p className="r2-history-preview-head">
                    {historyTime(preview.saved_at)} · {wordsLabel(preview.word_count)}
                    {preview.title !== history.scene.title && <> · titled “{preview.title}”</>}
                  </p>
                  <ProseSnapshot content={preview.content} empty="This version is empty." />
                </>
              )}
            </div>
          </div>
        )}

        {notice && (
          <p role={notice.tone === "alert" ? "alert" : "status"} className="r2-history-notice" data-tone={notice.tone}>
            {notice.text}
          </p>
        )}

        <div className="r2-dialog-actions r2-history-actions">
          {confirming && selected ? (
            <>
              <p className="r2-history-confirm">
                Replace the scene’s current text with the version from {historyTime(selected.saved_at)}? The current
                text stays in this history.
              </p>
              <button type="button" className="r2-button" disabled={restoring} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="r2-button r2-button--primary" disabled={restoring} autoFocus onClick={restore}>
                {restoring ? "Restoring…" : "Restore"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="r2-button" disabled={restoring} onClick={onClose}>
                Close
              </button>
              {selected && !selected.current && preview && preview !== "failed" && (
                <button type="button" className="r2-button r2-button--primary" onClick={() => setConfirming(true)}>
                  Restore this version
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
