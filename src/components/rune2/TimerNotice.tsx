"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { ICON_SM } from "./icons";
import { RuneRoot } from "./RunePreferences";
import { useWritingTimer, type TimerNoticeShown } from "./useWritingTimer";
import { durationInWords, owesNotice } from "@/lib/rune2/timer";
import { useProfileStore } from "@/store/profileStore";

// The timer's quiet tap on the shoulder (lib/rune2/timer.ts): when the
// writing timer finishes, a small note settles in at the top right of the
// window — the duration, written out, and the time it ended — and after a
// while goes again, leaving the Widgets control's warm dot behind. It is
// mounted once for every signed-in page (the (rune2) layout), so it is seen
// wherever the writer is: in the manuscript with the chrome receded, on a
// Canvas, in Settings, on the Projects home.
//
// It never interrupts. It takes no focus (a press on it never moves the
// caret out of the editor, nor does dismissing it), opens nothing, makes no
// sound, asks for no permission and uses no browser notification. It is
// shown once per finish, on this device: a finish the writer was away for
// (the tab in the background, the laptop closed, the app not open) is shown
// when they are back, once. If Widgets is open with the Timer on the board
// when it finishes, the card itself is the notice and this stays away.

/** How long the note stays, while the window is in front and the pointer is not over it. */
export const NOTICE_MS = 16_000;

const subscribeVisibility = (fn: () => void) => {
  document.addEventListener("visibilitychange", fn);
  return () => document.removeEventListener("visibilitychange", fn);
};
const pageVisible = () => document.visibilityState === "visible";
const serverVisible = () => false;

export function TimerNotice() {
  const userId = useProfileStore((s) => s.profile?.id);
  const timer = useWritingTimer(userId ?? null);
  const { state, markNotified, showNotice, dismissNotice, notice: shown } = timer;
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, serverVisible);
  const owed = owesNotice(state);

  // A finish that owes its notice, with the window in front: shown, and
  // marked as shown at once (so no other window, and no reload, shows it
  // again). Decided a frame later, so an open Widgets board has acknowledged
  // it first; a frame never runs in a background tab, so a finish there
  // waits for the writer to come back.
  useEffect(() => {
    if (!owed || !visible) return;
    const frame = requestAnimationFrame(() => {
      if (document.querySelector('.r2-widgets [data-widget="timer"]')) markNotified();
      else showNotice();
    });
    return () => cancelAnimationFrame(frame);
  }, [owed, visible, markNotified, showNotice]);

  // The note belongs to its finish: Widgets opened (acknowledged), a new
  // run or a reset, and it is gone.
  const live =
    shown !== null && state.status === "complete" && state.completedAt === shown.completedAt && !state.acknowledged ? shown : null;

  return (
    <RuneRoot className="r2-timer-notice-layer">
      {/* The one polite announcement, made when the note appears and never again for that finish. */}
      <span role="status" className="sr-only">
        {live ? `Timer finished. ${durationInWords(live.durationMs)}.` : ""}
      </span>
      {live && <NoticeCard key={live.completedAt} shown={live} visible={visible} onDone={dismissNotice} />}
    </RuneRoot>
  );
}

function NoticeCard({ shown, visible, onDone }: { shown: TimerNoticeShown; visible: boolean; onDone: () => void }) {
  const [held, setHeld] = useState(false);
  const left = useRef(NOTICE_MS);
  const since = useRef(0);

  // It stays NOTICE_MS of time the writer could have seen it: the clock runs
  // only while the window is in front and the pointer or focus is not on it.
  useEffect(() => {
    if (!visible || held) return;
    since.current = Date.now();
    const timeout = setTimeout(onDone, left.current);
    return () => {
      clearTimeout(timeout);
      left.current = Math.max(2_000, left.current - (Date.now() - since.current));
    };
  }, [visible, held, onDone]);

  const ended = new Date(shown.completedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <aside
      className="r2-timer-notice"
      aria-label="Timer finished"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      // A press here never takes the caret out of the manuscript.
      onMouseDown={(e) => e.preventDefault()}
    >
      <span className="r2-timer-notice-mark" aria-hidden />
      <span className="r2-timer-notice-text">
        <span className="r2-timer-notice-title">{durationInWords(shown.durationMs)}</span>
        <span className="r2-timer-notice-meta">The timer ended at {ended}</span>
      </span>
      <button
        type="button"
        className="r2-timer-notice-dismiss"
        aria-label="Dismiss"
        onClick={onDone}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onDone();
          }
        }}
      >
        <X {...ICON_SM} aria-hidden />
      </button>
    </aside>
  );
}
