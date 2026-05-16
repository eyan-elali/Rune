export const dynamic = "force-dynamic";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  checkAndGrantUnlockables,
  getUserUnlockables,
} from "@/lib/actions/unlockables";
import { UNLOCKABLES, requirementLabel } from "@/lib/unlockables";
import type { Unlockable } from "@/lib/unlockables";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function UnlockableCard({
  item,
  unlockedAt,
}: {
  item: Unlockable;
  unlockedAt: string | null;
}) {
  const isUnlocked = unlockedAt !== null || item.requirement === null;

  return (
    <div
      className="flex flex-col rounded-lg p-5 transition-opacity duration-150"
      style={{
        background: "var(--color-sepia)",
        border: `1px solid ${isUnlocked ? "var(--color-border-strong)" : "var(--color-border)"}`,
        opacity: isUnlocked ? 1 : 0.4,
        filter: isUnlocked ? "none" : "grayscale(1)",
      }}
    >
      {/* Type chip */}
      <p
        className="mb-3 text-xs font-semibold uppercase tracking-widest"
        style={{ color: isUnlocked ? "var(--color-gold)" : "var(--color-mist)" }}
      >
        {item.type}
      </p>

      {/* Name row */}
      <div className="flex items-start gap-2">
        {!isUnlocked && (
          <Lock
            size={14}
            aria-hidden
            className="mt-0.5 shrink-0"
            style={{ color: "var(--color-mist)" }}
          />
        )}
        <h3
          className="font-rune-serif text-lg leading-snug"
          style={{ color: "var(--color-parchment)" }}
        >
          {item.name}
        </h3>
      </div>

      <p className="mt-1.5 text-sm" style={{ color: "var(--color-mist)" }}>
        {item.description}
      </p>

      <div className="mt-auto pt-4">
        {isUnlocked ? (
          <p className="text-xs" style={{ color: "var(--color-gold)", opacity: 0.75 }}>
            {unlockedAt ? `Earned ${formatDate(unlockedAt)}` : "Always available"}
          </p>
        ) : (
          <p className="text-xs" style={{ color: "var(--color-mist)" }}>
            {requirementLabel(item.requirement)}
          </p>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10" aria-label={title}>
      <h2
        className="mb-4 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

export default async function UnlockablesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const reconciledUnlockables = await checkAndGrantUnlockables(user!.id);
  const userUnlockables = await getUserUnlockables(user!.id);
  const unlockedMap = new Map(
    userUnlockables.map((u) => [u.unlockable_id, u.unlocked_at])
  );

  const themes = UNLOCKABLES.filter((u) => u.type === "theme");
  const avatars = UNLOCKABLES.filter((u) => u.type === "avatar");

  console.log("[UnlockablesPage] static registry IDs:", UNLOCKABLES.map((u) => u.id));
  console.log("[UnlockablesPage] reconciled grants:", reconciledUnlockables);
  console.log("[UnlockablesPage] user unlockables:", userUnlockables);

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <div className="mb-10">
        <h1 className="font-rune-serif text-4xl text-rune-parchment">
          Unlockables
        </h1>
        <p className="mt-2 font-rune-serif text-lg text-rune-mist">
          Rewards earned through dedication.
        </p>
      </div>

      <Section title="Themes">
        {themes.map((item) => (
          <UnlockableCard
            key={item.id}
            item={item}
            unlockedAt={unlockedMap.get(item.id) ?? null}
          />
        ))}
      </Section>

      <Section title="Avatars">
        {avatars.map((item) => (
          <UnlockableCard
            key={item.id}
            item={item}
            unlockedAt={unlockedMap.get(item.id) ?? null}
          />
        ))}
      </Section>
    </div>
  );
}
