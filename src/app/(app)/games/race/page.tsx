"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/store/gameStore";
import { useProfileStore } from "@/store/profileStore";
import { useToastStore } from "@/store/toastStore";
import { awardXp } from "@/lib/actions/xp";
import {
  appendSprintToProject,
  createGameSession,
  getPersonalBests,
} from "@/lib/actions/games";
import { recordWordsWritten, transferGameWordsToProject } from "@/lib/actions/writingStats";
import { getProjects } from "@/lib/actions/projects";
import { getChapters } from "@/lib/actions/chapters";
import { xpRewardForWords } from "@/lib/xp";
import type { Project, Chapter } from "@/lib/types";

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

// ── Save-to-Project flow ──────────────────────────────────────────────────────

type SaveStep =
  | "idle"
  | "loading"
  | "pick-project"
  | "pick-chapter"
  | "saving"
  | "saved"
  | "error";

function SaveToProject({
  words,
  textWritten,
  sessionInvalidated = false,
}: {
  words: number;
  textWritten: string;
  sessionInvalidated?: boolean;
}) {
  const [step, setStep] = useState<SaveStep>("idle");
  const [projects, setProjects] = useState<Project[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [savedChapterName, setSavedChapterName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  if (words === 0) return null;

  async function handleOpenProjects() {
    setStep("loading");
    const result = await getProjects();
    if (result.error || !result.data) {
      setErrorMsg(result.error ?? "Failed to load projects");
      setStep("error");
      return;
    }
    setProjects(result.data);
    setStep("pick-project");
  }

  async function handleSelectProject(project: Project) {
    setSelectedProject(project);
    setStep("loading");
    const result = await getChapters(project.id);
    if (result.error || !result.data) {
      setErrorMsg(result.error ?? "Failed to load chapters");
      setStep("error");
      return;
    }
    setChapters(result.data);
    setStep("pick-chapter");
  }

  async function handleSelectChapter(chapter: Chapter) {
    if (!selectedProject) return;
    setStep("saving");
    const result = await appendSprintToProject(
      selectedProject.id,
      chapter.id,
      words,
      textWritten
    );
    if (result.error) {
      setErrorMsg(result.error);
      setStep("error");
      return;
    }
    // Transfer words to project stats unless session was invalidated by anti-cheat
    if (!sessionInvalidated) {
      await transferGameWordsToProject(selectedProject.id, words);
    }
    setSavedChapterName(chapter.title);
    setStep("saved");
  }

  // Saved confirmation
  if (step === "saved") {
    return (
      <div
        className="mt-4 rounded-lg px-5 py-3 text-center text-sm"
        style={{
          background: "rgba(74, 103, 65, 0.15)",
          border: "1px solid rgba(74, 103, 65, 0.3)",
          color: "var(--color-sage)",
        }}
      >
        ✓ &nbsp;Saved to &ldquo;{savedChapterName}&rdquo;
      </div>
    );
  }

  // Saving spinner
  if (step === "saving") {
    return (
      <Button variant="ghost" loading disabled className="mt-4">
        Saving…
      </Button>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <div className="mt-4 text-center">
        <p className="mb-2 text-xs" style={{ color: "var(--color-crimson)" }}>
          {errorMsg}
        </p>
        <button
          type="button"
          className="text-xs underline"
          style={{ color: "var(--color-mist)" }}
          onClick={() => { setStep("idle"); setErrorMsg(""); }}
        >
          Try again
        </button>
      </div>
    );
  }

  // Loading
  if (step === "loading") {
    return (
      <Button variant="ghost" loading disabled className="mt-4">
        Loading…
      </Button>
    );
  }

  // Project picker
  if (step === "pick-project") {
    return (
      <div className="mt-4 w-full max-w-xs">
        <p
          className="mb-2 text-center text-[10px] uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Pick a project
        </p>
        <div
          className="max-h-48 overflow-y-auto rounded-lg"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
          }}
        >
          {projects.length === 0 ? (
            <p
              className="px-4 py-3 text-center text-sm"
              style={{ color: "var(--color-mist)" }}
            >
              No projects yet
            </p>
          ) : (
            <ul role="list">
              {projects.map((project, i) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectProject(project)}
                    className="w-full px-4 py-3 text-left text-sm transition-colors duration-100 hover:bg-rune-gold/10"
                    style={{
                      color: "var(--color-parchment)",
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    <span className="font-rune-serif">{project.title}</span>
                    <span
                      className="ml-2 text-xs"
                      style={{ color: "var(--color-mist)" }}
                    >
                      {project.word_count.toLocaleString()} words
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="mt-2 w-full text-center text-xs"
          style={{ color: "var(--color-mist)", opacity: 0.6 }}
          onClick={() => setStep("idle")}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Chapter picker
  if (step === "pick-chapter") {
    return (
      <div className="mt-4 w-full max-w-xs">
        <p
          className="mb-1 text-center text-[10px] uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Pick a chapter
        </p>
        <p
          className="mb-2 text-center text-xs font-rune-serif"
          style={{ color: "var(--color-gold)" }}
        >
          {selectedProject?.title}
        </p>
        <div
          className="max-h-48 overflow-y-auto rounded-lg"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
          }}
        >
          {chapters.length === 0 ? (
            <p
              className="px-4 py-3 text-center text-sm"
              style={{ color: "var(--color-mist)" }}
            >
              No chapters in this project
            </p>
          ) : (
            <ul role="list">
              {chapters.map((chapter, i) => (
                <li key={chapter.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectChapter(chapter)}
                    className="w-full px-4 py-3 text-left text-sm transition-colors duration-100 hover:bg-rune-gold/10"
                    style={{
                      color: "var(--color-parchment)",
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    <span className="font-rune-serif">{chapter.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="mt-2 w-full text-center text-xs"
          style={{ color: "var(--color-mist)", opacity: 0.6 }}
          onClick={() => { setStep("pick-project"); setChapters([]); }}
        >
          ← Back to projects
        </button>
      </div>
    );
  }

  // Idle — show button
  return (
    <Button variant="ghost" className="mt-4" onClick={handleOpenProjects}>
      Save to Project
    </Button>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function ResultsState({
  result,
  isSaving,
  textWritten,
  isSessionValid,
  onRaceAgain,
}: {
  result: ResultData;
  isSaving: boolean;
  textWritten: string;
  isSessionValid: boolean;
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

      <div className="flex w-full max-w-lg flex-col items-center text-center">
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

        <div
          className="mx-auto mb-8 h-px w-24"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-border-strong), transparent)",
          }}
        />

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

        {/* Split breakdown — only shown when lap words exist */}
        {result.lapWords > 0 && (
          <div
            className="mt-4 rounded px-5 py-2.5 text-xs"
            style={{
              background: "rgba(201, 168, 76, 0.06)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="Split word count breakdown"
          >
            <span style={{ color: "var(--color-mist)" }}>
              Sprint Words:{" "}
              <span style={{ color: "var(--color-parchment)" }}>
                {result.sprintWords.toLocaleString()}
              </span>
              {" · "}
              Victory Lap Words:{" "}
              <span style={{ color: "var(--color-gold)" }}>
                {result.lapWords.toLocaleString()}
              </span>
            </span>
          </div>
        )}

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

        {/* Primary actions */}
        <div className="flex justify-center gap-4">
          <Button variant="primary" onClick={onRaceAgain}>
            Race Again
          </Button>
          <Link href="/games">
            <Button variant="ghost">Return to Hub</Button>
          </Link>
        </div>

        {/* Save to Project */}
        <SaveToProject words={result.words} textWritten={textWritten} sessionInvalidated={!isSessionValid} />
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
  raceFinished,
  onExit,
  onEndSession,
}: {
  timeLeft: number;
  selectedDuration: number;
  wordsWritten: number;
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
        <div className="hud-stats-tick flex items-center justify-between px-8 py-3">
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

          {/* Timer */}
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

  const [localDuration, setLocalDuration] = useState(600);
  const [timeLeft, setTimeLeft] = useState(600);
  const [gameKey, setGameKey] = useState(0);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [raceFinished, setRaceFinished] = useState(false);
  const [sessionValid, setSessionValid] = useState(true);

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
    const isNewBest = sessionIsValid && finalWords > prevBest;

    if (isNewBest && finalWords > 0) {
      useGameStore.getState().setPersonalBest(dur, finalWords);
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
        recordWordsWritten(null, finalWords),
      ]).then(([xpResult]) => {
        setIsSaving(false);
        if (xpResult.data) {
          useProfileStore.getState().updateXp(xpResult.data.xp, xpResult.data.level);
          if (xpResult.data.leveledUp) {
            useProfileStore.getState().setPendingLevelUp({
              newLevel: xpResult.data.newLevel,
              newUnlockables: xpResult.data.newUnlockables,
            });
          }
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
    raceFinishedRef.current = false;
    wordsAtFinishRef.current = 0;
    setRaceFinished(false);
    setSessionValid(true);
    resetToSetup();
    setResultData(null);
  }, [resetToSetup]);

  const handleExit = useCallback(() => {
    if (!confirm("Exit the race? Your current progress will not be saved.")) return;
    resetToSetup();
    router.push("/games");
  }, [resetToSetup, router]);

  const handleEndSession = useCallback(() => {
    endGame();
  }, [endGame]);

  // ── Render ──────────────────────────────────────────────────────────────────

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
        textWritten={textWritten}
        isSessionValid={sessionValid}
        onRaceAgain={handleRaceAgain}
      />
    );
  }

  // Active game
  return (
    <div className="flex min-h-0 h-full flex-col">
      <HUD
        timeLeft={timeLeft}
        selectedDuration={selectedDuration}
        wordsWritten={wordsWritten}
        personalBest={personalBests[selectedDuration] ?? 0}
        raceFinished={raceFinished}
        onExit={handleExit}
        onEndSession={handleEndSession}
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ background: "var(--color-vellum)" }}
      >
        <div
          className="mx-auto my-8 max-w-[720px]"
          style={{
            border: "1px solid var(--color-border-strong)",
            borderRadius: "4px",
            background: "var(--color-vellum)",
            boxShadow: "0 0 0 4px rgba(201,168,76,0.03), 0 4px 32px rgba(0,0,0,0.18)",
          }}
        >
          <GameEditor
            key={gameKey}
            onWordCountChange={updateWordCount}
            onTextChange={setTextWritten}
          />
        </div>
      </div>
    </div>
  );
}
