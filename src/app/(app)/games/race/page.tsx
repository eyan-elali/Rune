"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn, getLocalDateString } from "@/lib/utils";
import { TicketGate } from "@/components/games/TicketGate";
import { useGameStore } from "@/store/gameStore";
import { useProfileStore } from "@/store/profileStore";
import { useToastStore } from "@/store/toastStore";
import { awardXp } from "@/lib/actions/xp";
import { createGameSession, getPersonalBests } from "@/lib/actions/games";
import { PageSourceSelector, type PageSource } from "@/components/games/PageSourceSelector";
import { ContextPageHeader } from "@/components/games/ContextPageHeader";
import { SaveToProject } from "@/components/games/SaveToProject";
import { ExitGameModal } from "@/components/games/ExitGameModal";
import { recordWordsWritten } from "@/lib/actions/writingStats";
import { getWeeklyTicketUsage } from "@/lib/actions/billing";
import { xpRewardForWords } from "@/lib/xp";
import { unlockToastMessage } from "@/lib/unlockables";
import { getGameTicketsAllowed } from "@/lib/subscription";

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
  sprintWords: number;
  lapWords: number;
}

function extractWords(html: string): string[] {
  return html.replace(/<[^>]+>/g, " ").split(/\s+/).filter((w) => w.length > 0);
}

function isSessionValid(sessionWords: string[]): boolean {
  if (sessionWords.length < 50) return true;

  const WINDOW_SIZE = 50;
  const THRESHOLD = 0.12;

  for (let i = 0; i <= sessionWords.length - WINDOW_SIZE; i++) {
    const window = sessionWords.slice(i, i + WINDOW_SIZE);
    const unique = new Set(window.map((w) => w.toLowerCase()));
    const ratio = unique.size / window.length;
    if (ratio < THRESHOLD) return false;
  }

  return true;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function SetupState({
  localDuration,
  setLocalDuration,
  personalBests,
  onBegin,
  onSourceSelect,
}: {
  localDuration: number;
  setLocalDuration: (d: number) => void;
  personalBests: Record<number, number>;
  onBegin: () => void;
  onSourceSelect: (source: PageSource) => void;
}) {
  const best = personalBests[localDuration] ?? 0;
  const label = DURATIONS.find((d) => d.seconds === localDuration)?.label ?? "";

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <PageSourceSelector className="mt-0" onSelect={onSourceSelect} />
        </div>

        <div className="mb-10 text-center">
          <p
            className="mb-3 text-xs uppercase tracking-[0.3em]"
            style={{ color: "var(--color-mist)", opacity: 0.6 }}
          >
            ✦ &nbsp; Race Yourself &nbsp; ✦
          </p>

          <h1
            className="!mb-3 font-rune-serif text-4xl text-stone-900"
            style={{ color: "var(--text-primary)" }}
          >
            Set the Clock
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-mist)" }}>
            Write as many words as you can within the time limit.
            <br />
            Only additions count &mdash; deletions don&rsquo;t subtract.
          </p>
        </div>

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
            {DURATIONS.length > 0 ? (
              DURATIONS.map(({ label, seconds }) => (
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
              ))
            ) : (
              <div
                className="w-full rounded-lg px-6 py-8 text-center"
                style={{
                  background: "var(--color-sepia)",
                  border: "1px dashed var(--color-border-strong)",
                }}
              >
                <p
                  className="mb-1 font-rune-serif text-base"
                  style={{ color: "var(--text-primary)", opacity: 0.55 }}
                >
                  No race durations available
                </p>
                <p className="text-sm" style={{ color: "var(--color-mist)", opacity: 0.65 }}>
                  Sessions will open here once the queue is active.
                </p>
              </div>
            )}
          </div>
        </div>

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

        <div className="mt-8 flex justify-center">
          <Button
            variant="primary"
            className="px-12 py-3 text-base"
            onClick={onBegin}
            disabled={DURATIONS.length === 0}
            aria-disabled={DURATIONS.length === 0}
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
  textWritten,
  isSessionValid,
  onRaceAgain,
  canRaceAgain,
  pageSource,
}: {
  result: ResultData;
  isSaving: boolean;
  textWritten: string;
  isSessionValid: boolean;
  onRaceAgain: () => void;
  canRaceAgain: boolean;
  pageSource?: PageSource;
}) {
  const wpm =
    result.duration > 0
      ? ((result.sprintWords / result.duration) * 60).toFixed(1)
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

      <div className="flex w-full max-w-lg flex-col items-center text-center">
        {result.isNewBest && result.sprintWords > 0 && (
          <div className="mb-6">
            <span
              className="shimmer-text font-rune-serif text-xl font-semibold tracking-wide"
              aria-label="New personal record"
            >
              ✦ &nbsp;New Record!&nbsp; ✦
            </span>
          </div>
        )}

        <div
          className="mx-auto mb-8 h-px w-24"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-border-strong), transparent)",
          }}
        />

        <p
          className="font-rune-serif leading-none"
          style={{ fontSize: "5.5rem", color: "var(--text-primary)" }}
        >
          {result.sprintWords.toLocaleString()}
        </p>
        <p
          className="mt-2 text-xs uppercase tracking-[0.3em]"
          style={{ color: "var(--color-mist)" }}
        >
          timed words
        </p>

        <div
            className="mt-4 rounded px-5 py-2.5 text-xs"
            style={{
              background: "rgba(201, 168, 76, 0.06)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="Split word count breakdown"
          >
            <span style={{ color: "var(--color-mist)" }}>
              Timed Words:{" "}
              <span style={{ color: "var(--text-primary)" }}>
                {result.sprintWords.toLocaleString()}
              </span>
              {" · "}
              Victory Lap Words:{" "}
              <span style={{ color: "var(--color-gold)" }}>
                {result.lapWords.toLocaleString()}
              </span>
            </span>
          </div>

        <div className="mx-auto mt-10 mb-10 flex max-w-xs items-center justify-center gap-6">
          <div>
            <p
              className="font-rune-serif text-2xl"
              style={{ color: "var(--text-primary)" }}
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

          <div className="h-8 w-px" style={{ background: "var(--color-border)" }} />

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

          <div className="h-8 w-px" style={{ background: "var(--color-border)" }} />

          <div>
            <p
              className="font-rune-serif text-2xl"
              style={{ color: "var(--text-primary)" }}
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

        {!canRaceAgain && (
          <p
            className="mb-6 max-w-sm text-sm leading-relaxed"
            style={{ color: "var(--color-mist)" }}
          >
            No Arena entries left this week. Upgrade to Scribe for unlimited battles and races!
          </p>
        )}

        {/* Primary actions */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex justify-center gap-4">
            <Button
              variant="primary"
              onClick={onRaceAgain}
              disabled={!canRaceAgain}
              aria-disabled={!canRaceAgain}
            >
              Race Again
            </Button>
            <Link href="/games">
              <Button variant="ghost">Return to Hub</Button>
            </Link>
          </div>
          {!canRaceAgain && (
            <Link
              href="/settings"
              className="text-xs uppercase tracking-widest transition-opacity duration-150 hover:opacity-100"
              style={{ color: "var(--color-gold)", opacity: 0.75 }}
            >
              View plans in Settings
            </Link>
          )}
        </div>

        {/* Written-in context */}
        {pageSource?.type === "existing" && (
          <p className="mt-6 text-xs" style={{ color: "var(--color-mist)" }}>
            Written in:{" "}
            <span className="font-rune-serif" style={{ color: "var(--text-primary)" }}>
              {pageSource.page.title}
            </span>
            {" — "}
            <span style={{ opacity: 0.6 }}>{pageSource.project.title}</span>
          </p>
        )}

        {/* Save to Project */}
        <SaveToProject
          words={result.words}
          textWritten={textWritten}
          sessionInvalidated={!isSessionValid}
          pageSource={pageSource}
        />
      </div>
    </div>
  );
}

// ── Active HUD ────────────────────────────────────────────────────────────────

function HUD({
  timeLeft,
  selectedDuration,
  timedWords,
  lapWords,
  personalBest,
  raceFinished,
  onExit,
  onEndSession,
}: {
  timeLeft: number;
  selectedDuration: number;
  timedWords: number;
  lapWords: number;
  personalBest: number;
  raceFinished: boolean;
  onExit: () => void;
  onEndSession: () => void;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const isLowTime = timeLeft <= 60 && !raceFinished;
  const pct = Math.max(0, (timeLeft / selectedDuration) * 100);

  return (
    <div
      className="relative sticky top-0 z-10 shrink-0"
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
        .hud-stats-tick { animation: hud-tick 10s ease-in-out infinite; }
      `}</style>

      {/* Stats row */}
      {isVisible && (
        <div className="hud-stats-tick flex items-center justify-between px-8 py-5">
          {/* Word counts — timed vs victory lap after sprint ends */}
          <div className={raceFinished ? undefined : "min-w-[7rem]"}>
            {raceFinished ? (
              <div className="flex flex-row items-center gap-4">
                <div>
                  <p
                    className="font-rune-serif text-2xl tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {timedWords.toLocaleString()}
                  </p>
                  <p
                    className="text-[10px] uppercase tracking-widest"
                    style={{ color: "var(--color-mist)" }}
                  >
                    timed
                  </p>
                </div>
                <div>
                  <p
                    className="font-rune-serif text-lg tabular-nums"
                    style={{ color: "var(--color-gold)" }}
                  >
                    {lapWords.toLocaleString()}
                  </p>
                  <p
                    className="text-[10px] uppercase tracking-widest"
                    style={{ color: "var(--color-mist)", opacity: 0.7 }}
                  >
                    lap
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p
                  className="font-rune-serif text-2xl tabular-nums"
                  style={{ color: "var(--text-primary)" }}
                >
                  {timedWords.toLocaleString()}
                </p>
                <p
                  className="text-[10px] uppercase tracking-widest"
                  style={{ color: "var(--color-mist)" }}
                >
                  timed words
                </p>
              </>
            )}
          </div>

          {/* Timer */}
          <div className="text-center">
            <p
              className="font-rune-serif tabular-nums transition-colors duration-500"
              style={{
                fontSize: "3rem",
                lineHeight: 1,
                color: isLowTime ? "var(--color-crimson)" : "var(--color-gold)",
                fontVariantNumeric: "tabular-nums",
              }}
              aria-live="off"
            >
              {formatTime(timeLeft)}
            </p>
          </div>

          {/* Personal best + Exit / End Session */}
          <div className="flex min-w-[7rem] items-start justify-end gap-4">
            <div className="text-right">
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
            {raceFinished ? (
              <button
                type="button"
                onClick={onEndSession}
                className="rounded px-2.5 py-1 font-rune-sans text-[10px] uppercase tracking-wider transition-colors duration-150"
                style={{
                  color: "var(--color-ink)",
                  background: "var(--color-gold)",
                  border: "1px solid var(--color-gold)",
                }}
              >
                End Session
              </button>
            ) : (
              <button
                type="button"
                onClick={onExit}
                className="rounded px-2.5 py-1 font-rune-sans text-[10px] uppercase tracking-wider transition-colors duration-150 hover:bg-rune-crimson/15"
                style={{
                  color: "var(--color-crimson)",
                  border: "1px solid rgba(139, 46, 46, 0.35)",
                }}
              >
                Exit
              </button>
            )}
          </div>
        </div>
      )}

      {/* Flow state banner — always visible when race is finished */}
      {raceFinished && (
        <div
          className="px-8 py-2 text-center text-[10px] uppercase tracking-widest"
          style={{
            background: "rgba(201, 168, 76, 0.08)",
            borderTop: "1px solid rgba(201, 168, 76, 0.15)",
            color: "var(--color-gold)",
          }}
          aria-live="polite"
        >
          ✦ Sprint Target Achieved — Flow State Extension Active
        </div>
      )}

      {/* Progress bar */}
      <div className="h-[3px]" style={{ background: "rgba(201, 168, 76, 0.08)" }} aria-hidden>
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

      {/* Toggle — floats below the HUD */}
      <button
        type="button"
        onClick={() => setIsVisible((v) => !v)}
        className="absolute right-4 top-full mt-2 rounded-full px-2.5 py-0.5 font-rune-sans text-[10px] uppercase tracking-wider opacity-25 transition-opacity duration-200 hover:opacity-100"
        style={{
          background: "rgba(44, 36, 32, 0.9)",
          color: "var(--color-gold)",
          border: "1px solid var(--color-border-strong)",
        }}
        aria-label={isVisible ? "Hide stats" : "Show stats"}
      >
        {isVisible ? "Hide Stats" : "Show Stats"}
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RaceYourselfPage() {
  const router = useRouter();
  const hasSaved = useRef(false);
  const profile = useProfileStore((s) => s.profile);
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);

  useEffect(() => {
    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    if (prefs.hideArena === true) router.replace("/dashboard");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const {
    gameState,
    selectedDuration,
    wordsWritten,
    textWritten,
    personalBests,
    startGame,
    endGame,
    updateWordCount,
    setTextWritten,
    setPersonalBest,
    resetToSetup,
  } = useGameStore();

  const [pageSource, setPageSource] = useState<PageSource>({ type: "fresh" });
  const [localDuration, setLocalDuration] = useState(600);
  const [timeLeft, setTimeLeft] = useState(600);
  const [gameKey, setGameKey] = useState(0);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [raceFinished, setRaceFinished] = useState(false);
  const [sessionValid, setSessionValid] = useState(true);
  const [ticketConsumed, setTicketConsumed] = useState(false);
  const [canRaceAgain, setCanRaceAgain] = useState(true);
  const [showExitModal, setShowExitModal] = useState(false);

  // Refs for split-XP tracking across effect boundaries
  const wordsAtFinishRef = useRef(0);
  const raceFinishedRef = useRef(false);
  const raceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load personal bests on mount
  useEffect(() => {
    if (!profile?.id) return;
    getPersonalBests(profile.id).then((bests) => {
      Object.entries(bests).forEach(([dur, count]) => {
        setPersonalBest(Number(dur), count);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Reset store if unmounted mid-game
  useEffect(() => {
    return () => {
      if (useGameStore.getState().gameState === "active") {
        useGameStore.getState().resetToSetup();
      }
    };
  }, []);

  // Timer: start/reset when game becomes active
  useEffect(() => {
    if (gameState !== "active") return;

    setTimeLeft(selectedDuration);
    setRaceFinished(false);
    raceFinishedRef.current = false;
    wordsAtFinishRef.current = 0;

    const id = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    raceTimerRef.current = id;

    return () => {
      clearInterval(id);
      raceTimerRef.current = null;
    };
  }, [gameState, selectedDuration]);

  // Detect timer expiry — enter flow state instead of auto-advancing
  useEffect(() => {
    if (gameState === "active" && timeLeft === 0 && !raceFinished) {
      // Freeze the interval
      if (raceTimerRef.current) {
        clearInterval(raceTimerRef.current);
        raceTimerRef.current = null;
      }
      // Snapshot sprint word count and enter flow state
      wordsAtFinishRef.current = useGameStore.getState().wordsWritten;
      raceFinishedRef.current = true;
      setRaceFinished(true);
    }
  }, [gameState, timeLeft, raceFinished]);

  // Process results once when game transitions to 'results'
  useEffect(() => {
    if (gameState !== "results" || hasSaved.current) return;
    hasSaved.current = true;

    const store = useGameStore.getState();
    const finalWords = store.wordsWritten;
    const dur = store.selectedDuration;

    const sprintWords = raceFinishedRef.current ? wordsAtFinishRef.current : finalWords;
    const lapWords = Math.max(0, finalWords - sprintWords);

    // Uniqueness check — typed words only (paste is not blocked in race editor)
    const wordList = extractWords(store.textWritten);
    const sessionIsValid = isSessionValid(wordList);
    setSessionValid(sessionIsValid);

    if (!sessionIsValid) {
      useToastStore.getState().showToast(
        "Telemetry unrecognized. Session rewards suspended.",
        "error"
      );
    }

    // Race Yourself is 1× base for all words; split is for display only
    const sprintXp = xpRewardForWords(sprintWords);
    const lapXp = lapWords > 0 ? xpRewardForWords(lapWords) : 0;
    const xp = sessionIsValid ? sprintXp + lapXp : 0;

    const prevBest = store.personalBests[dur] ?? 0;
    const isNewBest = sessionIsValid && sprintWords > prevBest;

    if (isNewBest && sprintWords > 0) {
      useGameStore.getState().setPersonalBest(dur, sprintWords);
    }

    setResultData({ words: finalWords, duration: dur, xp, isNewBest, sprintWords, lapWords });

    const userId = useProfileStore.getState().profile?.id;
    if (userId && finalWords > 0) {
      setIsSaving(true);
      Promise.all([
        sessionIsValid
          ? awardXp(userId, xp, "race_yourself")
          : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
        createGameSession(
          "race",
          finalWords,
          dur,
          xp,
          undefined,
          {
            is_pb: isNewBest,
            sprint_words: sprintWords,
            lap_words: lapWords,
            ...(sessionIsValid ? {} : { invalidated: true }),
          }
        ),
        recordWordsWritten(null, finalWords, null, getLocalDateString()),
      ]).then(([xpResult]) => {
        setIsSaving(false);
        if (xpResult.data) {
          useProfileStore.getState().updateXp(xpResult.data.xp, xpResult.data.level);
          if (xpResult.data.leveledUp) {
            useProfileStore.getState().setPendingLevelUp({
              newLevel: xpResult.data.newLevel,
              newUnlockables: xpResult.data.newUnlockables,
            });
          } else if (xpResult.data.newUnlockables.length > 0) {
            useToastStore.getState().showToast(
              unlockToastMessage(xpResult.data.newUnlockables),
              "success"
            );
          }
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  useEffect(() => {
    if (gameState !== "results" || !profile?.id) return;

    const allowed = getGameTicketsAllowed(subscriptionTier);
    if (allowed === Infinity) {
      setCanRaceAgain(true);
      return;
    }

    let cancelled = false;
    getWeeklyTicketUsage(profile.id).then((used) => {
      if (!cancelled) setCanRaceAgain(used < allowed);
    });
    return () => {
      cancelled = true;
    };
  }, [gameState, profile?.id, subscriptionTier]);

  const handleBeginRace = useCallback(() => {
    setGameKey((k) => k + 1);
    startGame(localDuration);
  }, [localDuration, startGame]);

  const handleRaceAgain = useCallback(() => {
    if (!canRaceAgain) return;
    hasSaved.current = false;
    raceFinishedRef.current = false;
    wordsAtFinishRef.current = 0;
    setRaceFinished(false);
    setSessionValid(true);
    setTicketConsumed(false);
    resetToSetup();
    setResultData(null);
  }, [canRaceAgain, resetToSetup]);

  const handleExit = useCallback(() => {
    if (wordsWritten === 0) {
      resetToSetup();
      router.push("/games");
      return;
    }
    setShowExitModal(true);
  }, [wordsWritten, resetToSetup, router]);

  const handleLeaveArena = useCallback(() => {
    setShowExitModal(false);
    resetToSetup();
    router.push("/games");
  }, [resetToSetup, router]);

  const handleEndSession = useCallback(() => {
    endGame();
  }, [endGame]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (gameState === "idle" && !ticketConsumed) {
    return (
      <TicketGate onTicketConsumed={() => setTicketConsumed(true)}>
        <SetupState
          localDuration={localDuration}
          setLocalDuration={setLocalDuration}
          personalBests={personalBests}
          onBegin={handleBeginRace}
          onSourceSelect={setPageSource}
        />
      </TicketGate>
    );
  }

  if (gameState === "idle" && ticketConsumed) {
    return (
      <SetupState
        localDuration={localDuration}
        setLocalDuration={setLocalDuration}
        personalBests={personalBests}
        onBegin={handleBeginRace}
        onSourceSelect={setPageSource}
      />
    );
  }

  if (gameState === "results" && resultData) {
    return (
      <ResultsState
        result={resultData}
        isSaving={isSaving}
        textWritten={textWritten}
        isSessionValid={sessionValid}
        onRaceAgain={handleRaceAgain}
        canRaceAgain={canRaceAgain}
        pageSource={pageSource}
      />
    );
  }

  const hudTimedWords = raceFinished
    ? wordsAtFinishRef.current
    : wordsWritten;
  const hudLapWords = raceFinished
    ? Math.max(0, wordsWritten - wordsAtFinishRef.current)
    : 0;

  // Active game
  return (
    <div className="flex min-h-0 h-full flex-col">
      <HUD
        timeLeft={timeLeft}
        selectedDuration={selectedDuration}
        timedWords={hudTimedWords}
        lapWords={hudLapWords}
        personalBest={personalBests[selectedDuration] ?? 0}
        raceFinished={raceFinished}
        onExit={handleExit}
        onEndSession={handleEndSession}
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ background: "var(--color-vellum)" }}
      >
        {pageSource.type === "existing" && pageSource.page.content && (
          <div className="mx-auto max-w-[760px]">
            <ContextPageHeader content={pageSource.page.content} />
          </div>
        )}
        <div className="mx-auto max-w-[760px]">
          <GameEditor
            key={gameKey}
            placeholder="The clock has already started."
            onWordCountChange={updateWordCount}
            onTextChange={setTextWritten}
          />
        </div>
      </div>

      {showExitModal && (
        <ExitGameModal
          title="Leave the Race?"
          words={wordsWritten}
          textWritten={textWritten}
          pageSource={pageSource}
          onKeepGoing={() => setShowExitModal(false)}
          onLeave={handleLeaveArena}
        />
      )}
    </div>
  );
}
