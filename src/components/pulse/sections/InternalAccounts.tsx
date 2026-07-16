"use client";

import { useState, useTransition } from "react";
import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import { addExcludedUser, removeExcludedUser } from "@/lib/actions/pulse";
import type { ExcludedUser } from "@/lib/actions/pulse";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function InternalAccounts({ initialUsers }: { initialUsers: ExcludedUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    const id = userId.trim();
    if (!id) return;
    setError(null);
    startTransition(async () => {
      const result = await addExcludedUser(id, reason);
      if (result.error) {
        setError(result.error);
        return;
      }
      setUserId("");
      setReason("");
      setUsers((prev) => [
        { userId: id, displayName: null, username: null, reason: reason.trim() || null, createdAt: new Date().toISOString() },
        ...prev.filter((u) => u.userId !== id),
      ]);
    });
  }

  function handleRemove(id: string) {
    setUsers((prev) => prev.filter((u) => u.userId !== id));
    startTransition(async () => {
      await removeExcludedUser(id);
    });
  }

  return (
    <PulseCard className="flex flex-col p-6">
      <PulseCardLabel>Internal Accounts</PulseCardLabel>
      <p className="mb-4 text-xs" style={{ color: "var(--color-mist)", opacity: 0.75 }}>
        Founder and controlled test accounts excluded from Pulse&apos;s default metrics. Their
        analytics stay recorded — only what Pulse counts by default changes.
      </p>

      <div className="mb-5 space-y-2 border-b pb-5" style={{ borderColor: "var(--color-border)" }}>
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Exact user UUID"
          className="w-full rounded-md px-3 py-2 text-xs outline-none"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--color-border-strong)",
            color: "var(--text-primary)",
          }}
        />
        <div className="flex items-start gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. founder account, QA)"
            className="flex-1 rounded-md px-3 py-2 text-xs outline-none"
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--text-primary)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!userId.trim() || isPending}
            className="shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
          >
            Exclude
          </button>
        </div>
        {error && (
          <p className="text-xs" style={{ color: "var(--color-crimson)" }}>
            {error}
          </p>
        )}
      </div>

      {users.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-mist)" }}>
          No accounts excluded yet.
        </p>
      ) : (
        <ul role="list" className="max-h-[220px] space-y-2 overflow-y-auto">
          {users.map((u) => (
            <li
              key={u.userId}
              className="group flex items-start justify-between gap-3 rounded-md px-3 py-2.5"
              style={{ background: "color-mix(in srgb, var(--color-gold) 4%, transparent)" }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
                  {u.displayName?.trim() || u.username?.trim() || u.userId}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                  {u.reason ? `${u.reason} · ` : ""}
                  {fmtDate(u.createdAt)}
                </p>
              </div>
              <button
                onClick={() => handleRemove(u.userId)}
                aria-label="Remove exclusion"
                className="shrink-0 text-xs opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-60"
                style={{ color: "var(--color-crimson)" }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </PulseCard>
  );
}
