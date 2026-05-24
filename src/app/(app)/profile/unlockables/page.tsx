export const dynamic = "force-dynamic";
import { Lock } from "lucide-react";
import { AvatarGlyph } from "@/components/profile/UserAvatar";
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

function ScribeBadge() {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
      style={{
        background: "rgba(201,168,76,0.1)",
        border: "1px solid rgba(201,168,76,0.35)",
        color: "var(--color-gold)",
      }}
    >
      Scribe
    </span>
  );
}

function UnlockableCard({
  item,
  unlockedAt,
  userTier,
}: {
  item: Unlockable;
  unlockedAt: string | null;
  userTier: string;
}) {
  const isAlwaysFree = item.requirement === null && item.tier === "free";
  const isTierGated = item.tier === "scribe" && userTier !== "scribe";
  const isMetricLocked =
    !isTierGated && unlockedAt === null && item.requirement !== null;
  const isUnlocked = unlockedAt !== null || isAlwaysFree;

  const cardBorder = isTierGated
    ? "1.5px dashed rgba(201,168,76,0.45)"
    : isUnlocked
    ? "1px solid var(--color-border-strong)"
    : "1px solid var(--color-border)";

  return (
    <div
      className="flex flex-col rounded-lg p-5 transition-opacity duration-150"
      style={{
        background: "var(--color-sepia)",
        border: cardBorder,
        opacity: isTierGated ? 0.65 : isMetricLocked ? 0.4 : 1,
        filter: isMetricLocked && !isTierGated ? "grayscale(1)" : "none",
      }}
    >
      {/* Type + tier row */}
      <div className="mb-3 flex items-center gap-2">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: isUnlocked ? "var(--color-gold)" : "var(--color-mist)" }}
        >
          {item.type}
        </p>
        {item.tier === "scribe" && <ScribeBadge />}
      </div>

      {item.type === "avatar" && (
        <div
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: "rgba(201, 168, 76, 0.12)",
            border: "1px solid rgba(201, 168, 76, 0.25)",
          }}
          aria-hidden
        >
          <AvatarGlyph id={item.id} />
        </div>
      )}

      {/* Name row */}
      <div className="flex items-start gap-2">
        {(isMetricLocked || isTierGated) && (
          <Lock
            size={14}
            aria-hidden
            className="mt-0.5 shrink-0"
            style={{ color: "var(--color-mist)" }}
          />
        )}
        <h3
          className="font-rune-serif text-lg leading-snug"
          style={{ color: "var(--text-primary)" }}
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
        ) : isTierGated ? (
          <p className="text-xs" style={{ color: "var(--color-gold)", opacity: 0.6 }}>
            Requires Scribe subscription
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
        className="!mb-4 text-xs font-semibold uppercase tracking-widest"
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

  const [reconciledUnlockables, userUnlockables, profileRow] = await Promise.all([
    checkAndGrantUnlockables(user!.id),
    getUserUnlockables(user!.id),
    supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user!.id)
      .single()
      .then(({ data }) => data),
  ]);

  const userTier = (profileRow?.subscription_tier ?? "free") as string;

  const unlockedMap = new Map(
    userUnlockables.map((u) => [u.unlockable_id, u.unlocked_at])
  );

  const themes = UNLOCKABLES.filter((u) => u.type === "theme");
  const fonts = UNLOCKABLES.filter((u) => u.type === "font");
  const avatars = UNLOCKABLES.filter((u) => u.type === "avatar");

  console.log("[UnlockablesPage] static registry IDs:", UNLOCKABLES.map((u) => u.id));
  console.log("[UnlockablesPage] reconciled grants:", reconciledUnlockables);
  console.log("[UnlockablesPage] user unlockables:", userUnlockables);

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <div className="mb-10">
        <h1
          className="font-rune-serif text-4xl"
          style={{ color: "var(--text-primary)" }}
        >
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
            userTier={userTier}
          />
        ))}
      </Section>

      <Section title="Font Packs">
        {fonts.map((item) => (
          <UnlockableCard
            key={item.id}
            item={item}
            unlockedAt={unlockedMap.get(item.id) ?? null}
            userTier={userTier}
          />
        ))}
      </Section>

      <Section title="Avatars">
        {avatars.map((item) => (
          <UnlockableCard
            key={item.id}
            item={item}
            unlockedAt={unlockedMap.get(item.id) ?? null}
            userTier={userTier}
          />
        ))}
      </Section>
    </div>
  );
}
