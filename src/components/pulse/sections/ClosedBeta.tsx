"use client";

import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import type { BetaFeedbackRow, BetaOverviewRow } from "@/lib/actions/beta";

// Feedback, and the closed beta's history (Beta Completion E): every email
// that joined the waitlist or was approved, with where it stood, and the
// latest feedback. Since Early Access (migration 056) anyone may create an
// account, so nothing here grants access any longer; the list is kept as
// read-only history and nothing here changes it. No manuscript content is
// read or shown.

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
  const people = initial?.people ?? [];
  const waiting = people.filter((p) => !p.approvedAt).length;
  const approved = people.filter((p) => p.approvedAt && !p.acceptedAt).length;
  const active = people.filter((p) => p.acceptedAt).length;
  const feedback = initial?.feedback ?? [];

  return (
    <PulseCard className="r2-pulse-beta">
      <PulseCardLabel emphasis>Feedback and closed-beta history</PulseCardLabel>
      <p className="r2-pulse-help r2-pulse-help--lead">
        Sutura is in open Early Access: anyone can create an account. The closed beta’s waitlist and approvals are kept
        here as history.
      </p>

      {/* Where the closed beta ended: three figures in a line, not three cards. */}
      <dl className="r2-pulse-figures" aria-label="Closed beta history">
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

      {loadError && (
        <p role="alert" className="r2-notice" data-tone="danger">
          {loadError}
        </p>
      )}

      {people.length === 0 ? (
        <p className="r2-pulse-empty">No one joined the waitlist or was approved.</p>
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
