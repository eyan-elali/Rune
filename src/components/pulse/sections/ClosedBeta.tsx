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

const input = {
  background: "var(--surface-card)",
  border: "1px solid var(--color-border-strong)",
  color: "var(--text-primary)",
};

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

  return (
    <PulseCard className="flex flex-col p-6">
      <PulseCardLabel>Closed Beta</PulseCardLabel>
      <p className="mb-4 text-xs" style={{ color: "var(--color-mist)", opacity: 0.75 }}>
        {waiting} waiting · {approved} approved, not yet signed in · {active} in Rune. Approving an email lets its account
        into Rune the next time it signs in; write to the writer yourself to tell them.
      </p>

      <div className="mb-5 flex items-start gap-2 border-b pb-5" style={{ borderColor: "var(--color-border)" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="writer@example.com"
          className="flex-1 rounded-md px-3 py-2 text-xs outline-none"
          style={input}
          onKeyDown={(e) => {
            if (e.key === "Enter") approve(email);
          }}
        />
        <button
          onClick={() => approve(email)}
          disabled={!email.trim() || isPending}
          className="shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
        >
          Approve
        </button>
      </div>
      {error && (
        <p className="mb-4 text-xs" style={{ color: "var(--color-crimson)" }}>
          {error}
        </p>
      )}

      {people.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-mist)" }}>
          No one on the waitlist or approved yet.
        </p>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead style={{ color: "var(--color-mist)" }}>
              <tr>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Waitlist</th>
                <th className="py-2 pr-3 font-medium">Approved</th>
                <th className="py-2 pr-3 font-medium">In Rune</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody style={{ color: "var(--text-primary)" }}>
              {people.map((p) => (
                <tr key={p.email} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-2 pr-3 align-top">
                    <div>{p.email}</div>
                    {(p.name || p.writes) && (
                      <div className="mt-0.5" style={{ color: "var(--color-mist)" }}>
                        {[p.name, p.writes].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 align-top">{fmtDate(p.waitlistedAt)}</td>
                  <td className="py-2 pr-3 align-top">{fmtDate(p.approvedAt)}</td>
                  <td className="py-2 pr-3 align-top">{p.acceptedAt ? fmtDate(p.acceptedAt) : "Not yet"}</td>
                  <td className="py-2 text-right align-top">
                    {!p.approvedAt && (
                      <button
                        onClick={() => approve(p.email)}
                        disabled={isPending}
                        className="rounded-md px-2 py-1 text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ border: "1px solid var(--color-border-strong)" }}
                      >
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <PulseCardLabel>Feedback</PulseCardLabel>
      </div>
      {(data?.feedback ?? []).length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-mist)" }}>
          No feedback yet.
        </p>
      ) : (
        <ul role="list" className="max-h-[360px] space-y-2 overflow-y-auto">
          {(data?.feedback ?? []).map((f) => (
            <li
              key={f.id}
              className="rounded-md px-3 py-2.5"
              style={{ background: "color-mix(in srgb, var(--color-gold) 4%, transparent)" }}
            >
              <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--text-primary)" }}>
                {f.body}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                {[f.category ? CATEGORY[f.category] ?? f.category : null, f.writer, f.route, fmtDate(f.createdAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PulseCard>
  );
}
