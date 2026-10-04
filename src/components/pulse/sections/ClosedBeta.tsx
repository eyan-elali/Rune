"use client";

import { useState, useTransition } from "react";
import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import { approveBetaEmail, getBetaOverview } from "@/lib/actions/beta";
import type { BetaFeedbackRow, BetaOverviewRow } from "@/lib/actions/beta";

// The closed beta's operator view (Beta Completion E): every waitlisted and
// approved email with where it stands, one field to approve an address, and
// the latest feedback. Approving only adds an address; nothing here removes
// one, and an accepted writer can't be un-accepted (migration 052). No
// manuscript content is read or shown.

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CATEGORY: Record<string, string> = {
  confusing: "Confusing",
  broken: "Didn’t work",
  idea: "Idea",
  other: "Other",
};

/** Where a person stands, as one word. */
function standing(p: BetaOverviewRow): { label: string; tone: "waiting" | "approved" | "active" } {
  if (p.acceptedAt) return { label: "In Sutura", tone: "active" };
  if (p.approvedAt) return { label: "Approved", tone: "approved" };
  return { label: "Waiting", tone: "waiting" };
}

export function ClosedBeta({
  initial,
  loadError,
}: {
  initial: { people: BetaOverviewRow[]; feedback: BetaFeedbackRow[] } | null;
  loadError: string | null;
}) {
  const [data, setData] = useState(initial);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(loadError);
  const [isPending, startTransition] = useTransition();

  function approve(address: string) {
    const value = address.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      const result = await approveBetaEmail(value);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (value === email.trim()) setEmail("");
      const fresh = await getBetaOverview();
      if (fresh.error === null) setData(fresh.data);
    });
  }

  const people = data?.people ?? [];
  const waiting = people.filter((p) => !p.approvedAt).length;
  const approved = people.filter((p) => p.approvedAt && !p.acceptedAt).length;
  const active = people.filter((p) => p.acceptedAt).length;
  const feedback = data?.feedback ?? [];

  return (
    <PulseCard className="r2-pulse-beta">
      <PulseCardLabel emphasis>Closed Beta</PulseCardLabel>

      {/* Where the beta stands: three figures in a line, not three cards. */}
      <dl className="r2-pulse-figures" aria-label="Closed beta standing">
        <div>
          <dd>{waiting}</dd>
          <dt>waiting</dt>
        </div>
        <div>
          <dd>{approved}</dd>
          <dt>approved, not yet signed in</dt>
        </div>
        <div>
          <dd>{active}</dd>
          <dt>in Sutura</dt>
        </div>
      </dl>

      <form
        className="r2-pulse-approve"
        onSubmit={(e) => {
          e.preventDefault();
          approve(email);
        }}
      >
        <label htmlFor="pulse-approve-email" className="sr-only">
          Email to approve
        </label>
        <input
          id="pulse-approve-email"
          type="email"
          className="r2-field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="writer@example.com"
          autoComplete="off"
        />
        <button type="submit" className="r2-button r2-button--primary" disabled={!email.trim() || isPending}>
          Approve
        </button>
        <p className="r2-pulse-help">
          An approved email is let into Sutura the next time it signs in. Write to the writer yourself to tell them.
        </p>
      </form>
      {error && (
        <p role="alert" className="r2-notice" data-tone="danger">
          {error}
        </p>
      )}

      {people.length === 0 ? (
        <p className="r2-pulse-empty">No one on the waitlist or approved yet.</p>
      ) : (
        <div className="r2-pulse-scroll">
          <table className="r2-pulse-table">
            <thead>
              <tr>
                <th scope="col">Writer</th>
                <th scope="col">Standing</th>
                <th scope="col">Waitlisted</th>
                <th scope="col">Approved</th>
                <th scope="col">Signed in</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const s = standing(p);
                return (
                  <tr key={p.email}>
                    <td>
                      <div className="r2-pulse-primary">{p.email}</div>
                      {(p.name || p.writes) && (
                        <div className="r2-pulse-secondary">{[p.name, p.writes].filter(Boolean).join(" · ")}</div>
                      )}
                    </td>
                    <td>
                      <span className="r2-pulse-standing" data-tone={s.tone}>
                        {s.label}
                      </span>
                    </td>
                    <td className="r2-pulse-meta">{fmtDate(p.waitlistedAt)}</td>
                    <td className="r2-pulse-meta">{fmtDate(p.approvedAt)}</td>
                    <td className="r2-pulse-meta">{p.acceptedAt ? fmtDate(p.acceptedAt) : "Not yet"}</td>
                    <td className="r2-pulse-actions">
                      {!p.approvedAt && (
                        <button
                          type="button"
                          className="r2-button r2-button--sm"
                          onClick={() => approve(p.email)}
                          disabled={isPending}
                        >
                          Approve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="r2-pulse-subsection">
        <PulseCardLabel>Feedback</PulseCardLabel>
        {feedback.length === 0 ? (
          <p className="r2-pulse-empty">No feedback yet.</p>
        ) : (
          <ul role="list" className="r2-pulse-feedback r2-pulse-scroll">
            {feedback.map((f) => (
              <li key={f.id}>
                <p className="r2-pulse-feedback-body">{f.body}</p>
                <p className="r2-pulse-feedback-meta">
                  {[f.category ? CATEGORY[f.category] ?? f.category : null, f.writer, f.route, fmtDate(f.createdAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PulseCard>
  );
}
