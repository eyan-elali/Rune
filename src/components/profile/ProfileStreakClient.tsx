"use client";

import { useEffect, useState } from "react";
import { getWritingStreak } from "@/lib/actions/writingStats";
import { getLocalDateString } from "@/lib/utils";
import { useProfileStore } from "@/store/profileStore";

interface ProfileStreakClientProps {
  initialCurrentStreak: number;
  initialMaxStreak: number;
}

// Renders streak stats and corrects for local timezone on mount.
// The server-rendered initial values anchor on UTC; this component
// re-fetches with the browser's local date when they diverge.
export function ProfileStreakClient({
  initialCurrentStreak,
  initialMaxStreak,
}: ProfileStreakClientProps) {
  const [currentStreak, setCurrentStreak] = useState(initialCurrentStreak);
  const [maxStreak, setMaxStreak] = useState(initialMaxStreak);
  const userId = useProfileStore((s) => s.profile?.id);

  useEffect(() => {
    if (!userId) return;
    const localDate = getLocalDateString();
    const utcDate = new Date().toISOString().slice(0, 10);
    if (localDate === utcDate) return;
    void getWritingStreak(userId, localDate).then(({ currentStreak: cs, maxStreak: ms }) => {
      setCurrentStreak(cs);
      setMaxStreak(ms);
    });
  }, [userId]);

  return (
    <>
      <div className="flex min-w-0 flex-col">
        <p className="font-rune-serif text-2xl leading-tight" style={{ color: "var(--text-primary)" }}>
          {currentStreak > 0
            ? `${currentStreak} ${currentStreak === 1 ? "day" : "days"}`
            : "—"}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
          Current Streak
        </p>
      </div>
      <div className="flex min-w-0 flex-col">
        <p className="font-rune-serif text-2xl leading-tight" style={{ color: "var(--text-primary)" }}>
          {maxStreak > 0 ? `${maxStreak} ${maxStreak === 1 ? "day" : "days"}` : "—"}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
          Best Streak
        </p>
      </div>
    </>
  );
}
