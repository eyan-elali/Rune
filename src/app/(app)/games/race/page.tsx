"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/store/gameStore";
import { useProfileStore } from "@/store/profileStore";
import { awardXp } from "@/lib/actions/xp";
import { createGameSession, getPersonalBests } from "@/lib/actions/games";
import { xpRewardForWords } from "@/lib/xp";

const GameEditor = dynamic(() => import("@/components/editor/GameEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24">
      <span style={{ color: "var(--color-mist)" }}>Preparing the page&hellip;</span>
    </div>
  ),
});

const DURATIONS = [
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

interface ResultData {
  words: number;
  duration: number;
  xp: number;
  isNewBest: boolean;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function SetupState({
  localDuration,
  setLocalDuration,
  personalBests,
  onBegin,
}: {
  localDuration: number;
  setLocalDuration: (d: number) => void;
  personalBests: Record<number, number>;
  onBegin: () => void;
}) {
  const best = personalBests[localDuration] ?? 0;
  const label = DURATIONS.find((d) => d.seconds === localDuration)?.label ?? "";

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-16">
      <div className="w-full max-w-md">
        {/* Ornament */}
        <p
          className="mb-4 text-center text-xs uppercase tracking-[0.3em]"
          style={{ color: "var(--color-mist)", opacity: 0.6 }}
        >
          ✦ &nbsp; Race Yourself &nbsp; ✦
        </p>

        <h1
          className="mb-2 text-center font-rune-serif text-4xl"
          style={{ color: "var(--color-parchment)" }}
        >
          Set the Clock
        </h1>
        <p
          className="mb-10 text-center text-sm leading-relaxed"
          style={{ color: "var(--color-mist)" }}
        >
          Write as many words as you can within the time limit.
          <br />
          Only additions count &mdash; deletions don&rsquo;t subtract.
        </p>

        {/* Duration selector */}
        <div className="mb-8">
          <p
            className="mb-3 text-center text-[10px] uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Time limit
          </p>
          <div
            className="flex justify-center gap-2"
            role="group"
            aria-label="Select time limit"
          >
            {DURATIONS.map(({ label, seconds }) => (
              <button
                key={seconds}
                type="button"
                onClick={() => setLocalDuration(seconds)}
                aria-pressed={localDuration === seconds}
                className={cn(
                  "rounded px-4 py-2.5 text-sm font-medium transition-all duration-150",
                  localDuration === seconds
                    ? "bg-rune-gold text-rune-ink shadow-lg"
                    : "border text-rune-gold hover:border-rune-gold hover:bg-rune-gold/5"
                )}
                style={
                  localDuration !== seconds
                    ? { borderColor: "var(--color-border-strong)" }
                    : undefined
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Personal best */}
        <div className="mb-10 text-center" style={{ minHeight: "2.5rem" }}>
          {best > 0 ? (
            <p className="text-sm" style={{ color: "var(--color-mist)" }}>
              Your best at {label}:{" "}
              <span
                className="font-rune-serif text-base"
                style={{ color: "var(--color-gold)" }}
              >
                {best.toLocaleString()} words
              </span>
            </p>
          ) : (
            <p
              className="text-sm"
              style={{ color: "var(--color-mist)", opacity: 0.4 }}
            >
              No record yet for {label}
            </p>
          )}
        </div>

        {/* Begin */}
        <div className="flex justify-center">
          <Button
            variant="primary"
            className="px-12 py-3 text-base"
            onClick={onBegin}
          >
            Begin Race
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function ResultsState({
  result,
  isSaving,
  onRaceAgain,
}: {
  result: ResultData;
  isSaving: boolean;
  onRaceAgain: () => void;
}) {
  const wpm =
    result.duration > 0
      ? ((result.words / result.duration) * 60).toFixed(1)
      : "0.0";
  const durationLabel =
    DURATIONS.find((d) => d.seconds === result.duration)?.label ??
    `${result.duration / 60}m`;

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-16">
      <style>{`
        @keyframes rune-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .shimmer-text {
          background: linear-gradient(90deg, #c9a84c 0%, #f5d98a 45%, #e8c76a 55%, #c9a84c 100%);
          background-size: 200% auto;
          animation: rune-shimmer 2.4s linear infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>

      <div className="w-full max-w-lg text-center">
        {/* New record badge */}
        {result.isNewBest && result.words > 0 && (
          <div className="mb-6">
            <span
              className="shimmer-text font-rune-serif text-xl font-semibold tracking-wide"
              aria-label="New personal record"
            >
              ✦ &nbsp;New Record!&nbsp; ✦
            </span>
          </div>
        )}

        {/* Divider */}
        <div
          className="mx-auto mb-8 h-px w-24"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-border-strong), transparent)",
          }}
        />

        {/* Word count (hero) */}
        <p
          className="font-rune-serif leading-none"
          style={{ fontSize: "5.5rem", color: "var(--color-parchment)" }}
        >
          {result.words.toLocaleString()}
        </p>
        <p
          className="mt-2 text-xs uppercase tracking-[0.3em]"
          style={{ color: "var(--color-mist)" }}
        >
          words written
        </p>

        {/* Stats row */}
        <div className="mx-auto mt-10 mb-10 flex max-w-xs items-center justify-center gap-6">
          <div>
            <p
              className="font-rune-serif text-2xl"
              style={{ color: "var(--color-parchment)" }}
            >
              {wpm}
            </p>
            <p
              className="mt-0.5 text-[10px] uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              WPM
            </p>
          </div>

          <div
            className="h-8 w-px"
            style={{ background: "var(--color-border)" }}
          />

          <div>
            <p
              className="font-rune-serif text-2xl"
              style={{ color: "var(--color-gold)" }}
            >
              +{result.xp}
            </p>
            <p
              className="mt-0.5 text-[10px] uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              {isSaving ? "saving…" : "XP earned"}
            </p>
          </div>

          <div
            className="h-8 w-px"
            style={{ background: "var(--color-border)" }}
          />

          <div>
            <p
              className="font-rune-serif text-2xl"
              style={{ color: "var(--color-parchment)" }}
            >
              {durationLabel}
            </p>
            <p
              className="mt-0.5 text-[10px] uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              time limit
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-center gap-4">
          <Button variant="primary" onClick={onRaceAgain}>
            Race Again
          </Button>
          <Link href="/games">
            <Button variant="ghost">Return to Hub</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Active HUD ────────────────────────────────────────────────────────────────

function HUD({
  timeLeft,
  selectedDuration,
  wordsWritten,
  personalBest,
}: {
  timeLeft: number;
  selectedDuration: number;
  wordsWritten: number;
  personalBest: number;
}) {
  const isLowTime = timeLeft <= 60;
  const pct = Math.max(0, (timeLeft / selectedDuration) * 100);

  return (
    <div
      className="hud-tick sticky top-0 z-10 shrink-0"
      style={{
        background: "var(--color-sepia)",
        borderBottom: "1px solid var(--color-border-strong)",
      }}
    >
      <style>{`
        @keyframes hud-tick {
          0%,  83% { opacity: 1; }
          87%       { opacity: 0.68; }
          91%       { opacity: 1; }
          95%       { opacity: 0.82; }
          100%      { opacity: 1; }
        }
        .hud-tick { animation: hud-tick 10s ease-in-out infinite; }
      `}</style>

      <div className="flex items-center justify-between px-8 py-3">
        {/* Words written */}
        <div className="min-w-[7rem]">
          <p
            className="font-rune-serif text-2xl tabular-nums"
            style={{ color: "var(--color-parchment)" }}
          >
            {wordsWritten.toLocaleString()}
          </p>
          <p
            className="text-[10px] uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            words
          </p>
        </div>

        {/* Timer (centre) */}
        <div className="text-center">
          <p
            className="font-rune-serif tabular-nums transition-colors duration-500"
            style={{
              fontSize: "2.5rem",
              lineHeight: 1,
              color: isLowTime ? "var(--color-crimson)" : "var(--color-gold)",
              fontVariantNumeric: "tabular-nums",
            }}
            aria-live="off"
          >
            {formatTime(timeLeft)}
          </p>
        </div>

        {/* Personal best */}
        <div className="min-w-[7rem] text-right">
          <p
            className="font-rune-serif text-2xl tabular-nums"
            style={{ color: "var(--color-mist)" }}
          >
            {personalBest > 0 ? personalBest.toLocaleString() : "—"}
          </p>
          <p
            className="text-[10px] uppercase tracking-widest"
            style={{ color: "var(--color-mist)", opacity: 0.5 }}
          >
            your best
          </p>
        </div>
      </div>

      {/* Time-remaining progress bar */}
      <div className="h-[3px]" style={{ background: "rgba(201,168,76,0.08)" }}>
        <div
          className="h-full transition-all duration-1000 ease-linear"
          style={{
            width: `${pct}%`,
            background: isLowTime
              ? "var(--color-crimson)"
              : "linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))",
          }}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RaceYourselfPage() {
  // 1. At the very top of your RacePage component (not inside ResultsState)
  const hasSaved = useRef(false);
  const profile = useProfileStore((s) => s.profile);
  const updateXp = useProfileStore((s) => s.updateXp);

  const {
    gameState,
    selectedDuration,
    wordsWritten,
    personalBests,
    startGame,
    endGame,
    updateWordCount,
    setPersonalBest,
    resetToSetup,
  } = useGameStore();

  const [localDuration, setLocalDuration] = useState(600);
  const [timeLeft, setTimeLeft] = useState(600);
  const [gameKey, setGameKey] = useState(0);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load personal bests from DB on mount
  useEffect(() => {
    if (!profile?.id) return;
    getPersonalBests(profile.id).then((bests) => {
      Object.entries(bests).forEach(([dur, count]) => {
        setPersonalBest(Number(dur), count);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Reset component state when returning to hub / unmounting mid-game
  useEffect(() => {
    return () => {
      if (useGameStore.getState().gameState === "active") {
        useGameStore.getState().resetToSetup();
      }
    };
  }, []);

  // Timer: reset and start countdown when game becomes active
  useEffect(() => {
    if (gameState !== "active") return;

    setTimeLeft(selectedDuration);

    const id = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(id);
  }, [gameState, selectedDuration]);

  // Detect timer expiry during active game
  useEffect(() => {
    if (gameState === "active" && timeLeft === 0) {
      endGame();
    }
  }, [gameState, timeLeft, endGame]);

  // Process results when game transitions to 'results'
  useEffect(() => {
    if (gameState !== "results" || hasSaved.current) return;
    hasSaved.current = true;
    const store = useGameStore.getState();
    const finalWords = store.wordsWritten;
    const dur = store.selectedDuration;
    const xp = xpRewardForWords(finalWords);
    const prevBest = store.personalBests[dur] ?? 0;
    const isNewBest = finalWords > prevBest;

    if (isNewBest && finalWords > 0) {
      useGameStore.getState().setPersonalBest(dur, finalWords);
    }

    setResultData({ words: finalWords, duration: dur, xp, isNewBest });

    const userId = useProfileStore.getState().profile?.id;
    if (userId && finalWords > 0) {
      setIsSaving(true);
      Promise.all([
        awardXp(userId, xp, "race_yourself"),
        createGameSession("race", finalWords, dur, xp),
      ]).then(([xpResult]) => {
        setIsSaving(false);
        if (xpResult.data) {
          useProfileStore.getState().updateXp(xpResult.data.xp, xpResult.data.level);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  const handleBeginRace = useCallback(() => {
    setGameKey((k) => k + 1);
    startGame(localDuration);
  }, [localDuration, startGame]);

  const handleRaceAgain = useCallback(() => {
    hasSaved.current = false;
    resetToSetup();
    setResultData(null);
  }, [resetToSetup]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (gameState === "idle") {
    return (
      <SetupState
        localDuration={localDuration}
        setLocalDuration={setLocalDuration}
        personalBests={personalBests}
        onBegin={handleBeginRace}
      />
    );
  }

  if (gameState === "results" && resultData) {
    return (
      <ResultsState
        result={resultData}
        isSaving={isSaving}
        onRaceAgain={handleRaceAgain}
      />
    );
  }

  // Active game
  return (
    <div className="flex flex-col" style={{ minHeight: "100%" }}>
      <HUD
        timeLeft={timeLeft}
        selectedDuration={selectedDuration}
        wordsWritten={wordsWritten}
        personalBest={personalBests[selectedDuration] ?? 0}
      />

      {/* Writing area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--color-vellum)" }}
      >
        <div
          className="mx-auto my-8 max-w-[720px]"
          style={{
            border: "1px solid var(--color-border-strong)",
            borderRadius: "4px",
            background: "var(--color-vellum)",
            boxShadow:
              "0 0 0 4px rgba(201,168,76,0.03), 0 4px 32px rgba(0,0,0,0.18)",
          }}
        >
          <GameEditor key={gameKey} onWordCountChange={updateWordCount} />
        </div>
      </div>
    </div>
  );
}
