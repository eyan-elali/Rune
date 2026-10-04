"use client";

import { useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { submitFeedback } from "@/lib/actions/beta";
import { FEEDBACK_CATEGORIES, FEEDBACK_MAX, browserFamily, deviceClass, type FeedbackCategory } from "@/lib/beta";
import { useModalFocus } from "./useModalFocus";

// "Send feedback" (Beta Completion E), from the account menu: what the writer
// chooses to tell us, an optional category, and safe context gathered here —
// the path (no query string), the surface and Project they were in, the
// device class, the browser's family and the window size. Nothing is read
// from the manuscript, a Page, an Entry, a note, a Canvas or a search; the
// server keeps only those fields (sanitizeFeedbackContext) and adds the build.

export type FeedbackWhere = { surface: string | null; projectId: string | null };

export function FeedbackDialog({ where, onClose }: { where: FeedbackWhere; onClose: () => void }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [state, setState] = useState<"editing" | "sending" | "sent">("editing");
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const r = await submitFeedback({
        body,
        category,
        context: {
          route: pathname,
          surface: where.surface,
          projectId: where.projectId,
          device: deviceClass(window.innerWidth),
          browser: browserFamily(navigator.userAgent),
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        },
      });
      if (r.error !== null) {
        setError(r.error);
        setState("editing");
        return;
      }
      setState("sent");
    } catch {
      setError("You appear to be offline. Your message is still here — try again when you’re connected.");
      setState("editing");
    }
  }

  return (
    <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && state !== "sending" && onClose()}>
      <div
        ref={dialog}
        className="r2-dialog r2-feedback"
        role="dialog"
        aria-modal="true"
        aria-labelledby="r2-feedback-title"
        onKeyDown={(e) => {
          if (e.key === "Escape" && state !== "sending") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {state === "sent" ? (
          <>
            <h2 id="r2-feedback-title">Thank you.</h2>
            <p>Your feedback reached us. Every message is read — it’s how the beta gets better.</p>
            <div className="r2-dialog-actions">
              <button type="button" className="r2-button r2-button--primary" onClick={onClose} autoFocus>
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={send}>
            <h2 id="r2-feedback-title">Send feedback</h2>
            <p className="r2-feedback-intro">Something confusing, something broken, an idea — tell us what happened.</p>
            <div className="r2-feedback-categories" role="radiogroup" aria-label="What is it about? (optional)">
              {FEEDBACK_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={category === c.id}
                  className="r2-chip r2-feedback-category"
                  onClick={() => setCategory((prev) => (prev === c.id ? null : c.id))}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <label htmlFor="r2-feedback-body" className="sr-only">
              Your feedback
            </label>
            <textarea
              id="r2-feedback-body"
              className="r2-field r2-feedback-body"
              rows={6}
              value={body}
              maxLength={FEEDBACK_MAX}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What were you trying to do, and what happened?"
              autoFocus
            />
            <p className="r2-feedback-privacy">
              Sent with your message: where you were in Sutura and your browser and device type. Never your manuscript, pages
              or notes.
            </p>
            {error && (
              <p role="alert" className="r2-notice" data-tone="danger">
                {error}
              </p>
            )}
            <div className="r2-dialog-actions">
              <button type="button" className="r2-button" onClick={onClose} disabled={state === "sending"}>
                Cancel
              </button>
              <button type="submit" className="r2-button r2-button--primary" disabled={!body.trim() || state === "sending"}>
                {state === "sending" ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
