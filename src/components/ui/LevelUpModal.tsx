"use client";

import { useEffect, useRef } from "react";
import { useProfileStore } from "@/store/profileStore";
import { UNLOCKABLES } from "@/lib/unlockables";

export function LevelUpModal() {
  const pendingLevelUp = useProfileStore((s) => s.pendingLevelUp);
  const clearLevelUp = useProfileStore((s) => s.clearLevelUp);
  const numberRef = useRef<HTMLDivElement>(null);

  // Re-trigger animation whenever a new level-up arrives
  useEffect(() => {
    if (!pendingLevelUp || !numberRef.current) return;
    numberRef.current.classList.remove("rune-level-up-animate");
    void numberRef.current.offsetWidth; // force reflow
    numberRef.current.classList.add("rune-level-up-animate");
  }, [pendingLevelUp]);

  if (!pendingLevelUp) return null;

  const { newLevel, newUnlockables } = pendingLevelUp;
  const unlockedItems = UNLOCKABLES.filter((u) => newUnlockables.includes(u.id));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Level ${newLevel} achieved`}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(10, 8, 6, 0.88)", backdropFilter: "blur(4px)" }}
      onClick={clearLevelUp}
    >
      <div
        className="flex flex-col items-center text-center select-none px-8 py-12"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative top rule */}
        <div
          className="mb-8 h-px w-24"
          style={{ background: "var(--color-gold)", opacity: 0.5 }}
          aria-hidden
        />

        <p
          className="mb-2 text-xs font-semibold uppercase tracking-[0.3em]"
          style={{ color: "var(--color-gold)", opacity: 0.7 }}
        >
          Level Achieved
        </p>

        {/* Animated level number */}
        <div
          ref={numberRef}
          className="font-rune-serif leading-none"
          style={{
            fontSize: "clamp(6rem, 20vw, 10rem)",
            color: "var(--color-gold)",
            textShadow:
              "0 0 60px color-mix(in srgb, var(--color-gold) 40%, transparent), 0 0 120px color-mix(in srgb, var(--color-gold) 15%, transparent)",
          }}
          aria-live="polite"
        >
          {newLevel}
        </div>

        <p
          className="mt-4 font-rune-serif text-2xl"
          style={{ color: "var(--color-parchment)" }}
        >
          Level {newLevel} Achieved
        </p>

        {unlockedItems.length > 0 && (
          <div className="mt-6">
            <p
              className="mb-2 text-xs uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              {unlockedItems.length === 1 ? "You unlocked" : "You unlocked"}
            </p>
            <ul className="flex flex-col gap-1">
              {unlockedItems.map((item) => (
                <li
                  key={item.id}
                  className="font-rune-serif text-base"
                  style={{ color: "var(--color-gold)" }}
                >
                  {item.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Decorative bottom rule */}
        <div
          className="mt-8 h-px w-24"
          style={{ background: "var(--color-gold)", opacity: 0.5 }}
          aria-hidden
        />

        <p
          className="mt-6 text-xs"
          style={{ color: "var(--color-mist)", opacity: 0.5 }}
        >
          Click anywhere to continue
        </p>
      </div>
    </div>
  );
}
