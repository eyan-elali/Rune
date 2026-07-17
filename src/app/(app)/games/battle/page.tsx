"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { HpBar } from "@/components/games/HpBar";
import { BattleLog, type BattleLogEntry } from "@/components/games/BattleLog";
import { awardXp } from "@/lib/actions/xp";
import { createGameSession } from "@/lib/actions/games";
import { PageSourceSelector, type PageSource } from "@/components/games/PageSourceSelector";
import { ContextPageHeader } from "@/components/games/ContextPageHeader";
import { SaveToProject } from "@/components/games/SaveToProject";
import { ExitGameModal } from "@/components/games/ExitGameModal";
import { recordWordsWritten } from "@/lib/actions/writingStats";
import { xpRewardForWords } from "@/lib/xp";
import { unlockToastMessage } from "@/lib/unlockables";
import { useGameStore } from "@/store/gameStore";
import { useProfileStore } from "@/store/profileStore";
import { useToastStore } from "@/store/toastStore";
import { getLocalDateString } from "@/lib/utils";

const GameEditor = dynamic(() => import("@/components/editor/GameEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24">
      <span style={{ color: "var(--color-mist)" }}>Preparing the page&hellip;</span>
    </div>
  ),
});

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

// ── Enemy definitions ─────────────────────────────────────────────────────────

const PLAYER_MAX_HP = 200;

interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  description: string;
  gimmick: string | null;
  gimmickName: string | null;
  flavorLines: string[];
}

const ENEMIES: EnemyDef[] = [
  {
    id: "blank-page",
    name: "The Blank Page",
    hp: 500,
    description:
      "An endless white void — silent, patient, and utterly merciless. The most ancient of adversaries.",
    gimmick: null,
    gimmickName: null,
    flavorLines: [
      "The Blank Page looms...",
      "Silence presses against you.",
      "Nothing but white.",
      "The page waits. So do you.",
    ],
  },
  {
    id: "writers-block",
    name: "Writer's Block",
    hp: 800,
    description:
      "A stubborn phantom that feeds on hesitation. Stop moving and it heals itself.",
    gimmick: "Heals 50 HP every 60 seconds.",
    gimmickName: "Resilient",
    flavorLines: [
      "Writer's Block shifts and reassembles...",
      "It refuses to yield.",
      "Writer's Block knits itself back together.",
      "You can feel the resistance thickening.",
    ],
  },
  {
    id: "deadline",
    name: "The Deadline",
    hp: 1200,
    description:
      "Time itself, weaponised. Every idle moment costs double. The clock has no mercy.",
    gimmick: "Player takes 2× idle damage.",
    gimmickName: "Relentless",
    flavorLines: [
      "The Deadline advances without mercy...",
      "Tick. Tick. Tick.",
      "The clock has no patience.",
      "Time bleeds away.",
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type BattlePhase = "enemy-select" | "active" | "results";
type BattleOutcome = "victory" | "defeat";

interface ResultData {
  words: number;
  xp: number;
  outcome: BattleOutcome;
  enemyName: string;
  enemyId: string;
  sprintWords: number;
  lapWords: number;
  creditDate: string;
}

// ── Enemy Select ──────────────────────────────────────────────────────────────

function EnemySelectState({
  onSelect,
  onSourceSelect,
}: {
  onSelect: (e: EnemyDef) => void;
  onSourceSelect: (source: PageSource) => void;
}) {
  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <div className="mx-auto mb-10 max-w-md">
        <PageSourceSelector className="mt-0" onSelect={onSourceSelect} />
      </div>

      <div className="mb-10 text-center">
        <p
          className="mb-3 text-xs uppercase tracking-[0.3em]"
          style={{ color: "var(--color-mist)", opacity: 0.6 }}
        >
          ✦ Battle Mode ✦
        </p>
        <h1
          className="!mb-3 font-rune-serif text-4xl text-stone-900"
          style={{ color: "var(--text-primary)" }}
        >
          Choose Your Adversary
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-mist)" }}>
          Every enemy is a form of resistance. Choose wisely.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {ENEMIES.length > 0 ? (
          ENEMIES.map((enemy) => (
          <button
            key={enemy.id}
            type="button"
            onClick={() => onSelect(enemy)}
            className="group relative flex flex-col overflow-hidden rounded-lg text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2"
            style={{
              background: "var(--color-sepia)",
              border: "1px solid var(--color-border-strong)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            }}
            aria-label={`Challenge ${enemy.name}`}
          >
            {/* Top crimson accent */}
            <div
              className="h-0.5 w-full transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--color-crimson), transparent)",
                opacity: 0.35,
              }}
            />

            <div className="flex flex-1 flex-col p-7">
              <h2
                className="!mb-1 font-rune-serif text-xl text-stone-900 transition-colors duration-150"
                style={{ color: "var(--text-primary)" }}
              >
                {enemy.name}
              </h2>

              <p
                className="mb-4 text-xs tabular-nums"
                style={{ color: "var(--color-crimson)", opacity: 0.85 }}
              >
                {enemy.hp.toLocaleString()} HP
              </p>

              <div
                className="mb-4 h-px w-10"
                style={{ background: "var(--color-border-strong)" }}
                aria-hidden
              />

              <p
                className="flex-1 text-sm leading-relaxed"
                style={{ color: "var(--color-mist)" }}
              >
                {enemy.description}
              </p>

              <div className="mt-6">
                {enemy.gimmick ? (
                  <div className="inline-flex flex-col gap-1.5">
                    <span
                      className="inline-block rounded px-2 py-0.5 text-[9px] uppercase tracking-widest font-semibold"
                      style={{
                        background: "color-mix(in srgb, var(--color-crimson) 18%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--color-crimson) 35%, transparent)",
                        color: "var(--color-crimson)",
                      }}
                    >
                      {enemy.gimmickName}
                    </span>
                    <p
                      className="text-xs italic"
                      style={{ color: "var(--color-mist)", opacity: 0.65 }}
                    >
                      {enemy.gimmick}
                    </p>
                  </div>
                ) : (
                  <span
                    className="inline-block rounded px-2 py-0.5 text-[9px] uppercase tracking-widest"
                    style={{
                      background: "color-mix(in srgb, var(--color-gold) 7%, transparent)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-mist)",
                      opacity: 0.6,
                    }}
                  >
                    Standard
                  </span>
                )}
              </div>
            </div>

            <div
              className="flex items-center justify-between px-7 py-4"
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{ color: "var(--color-mist)", opacity: 0.4 }}
              >
                Challenge
              </span>
              <span
                className="text-sm transition-transform duration-200 group-hover:translate-x-1"
                style={{ color: "var(--color-crimson)" }}
                aria-hidden
              >
                →
              </span>
            </div>
          </button>
          ))
        ) : (
          <div
            className="col-span-full rounded-lg px-8 py-14 text-center"
            style={{
              background: "var(--color-sepia)",
              border: "1px dashed var(--color-border-strong)",
            }}
          >
            <p
              className="mb-2 font-rune-serif text-lg"
              style={{ color: "var(--text-primary)", opacity: 0.55 }}
            >
              No adversaries in the queue
            </p>
            <p className="text-sm" style={{ color: "var(--color-mist)", opacity: 0.65 }}>
              Check back soon — new challenges will appear here when available.
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/games"
          className="text-xs transition-opacity duration-150 hover:opacity-100"
          style={{ color: "var(--color-mist)", opacity: 0.4 }}
        >
          ← Return to The Arena
        </Link>
      </div>
    </div>
  );
}

// ── Battle HUD (left column) ──────────────────────────────────────────────────

function BattleHUD({
  enemy,
  enemyHp,
  playerHp,
  timedWords,
  lapWords,
  idleWarning,
  victoryAchieved,
  battleLog,
  onExit,
  onEndSession,
}: {
  enemy: EnemyDef;
  enemyHp: number;
  playerHp: number;
  timedWords: number;
  lapWords: number;
  idleWarning: boolean;
  victoryAchieved: boolean;
  battleLog: BattleLogEntry[];
  onExit: () => void;
  onEndSession: () => void;
}) {
  return (
    <>
      <style>{`
        @keyframes idle-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.25; }
        }
        .idle-dot { animation: idle-pulse 0.75s ease-in-out infinite; }
      `}</style>

      <div
        className="flex h-full flex-col gap-6 overflow-y-auto p-8"
        style={{
          background: "var(--color-sepia)",
          borderRight: "1px solid var(--color-border-strong)",
        }}
      >
        {/* Enemy */}
        <div>
          <p
            className="mb-2 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--color-mist)", opacity: 0.45 }}
          >
            Enemy
          </p>
          <div className="mb-3 flex items-start justify-between gap-2">
            <h2
              className="font-rune-serif text-xl leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {enemy.name}
            </h2>
            {enemy.gimmickName && (
              <span
                className="mt-0.5 text-[9px] uppercase tracking-widest rounded px-1.5 py-0.5 flex-shrink-0"
                style={{
                  background: "color-mix(in srgb, var(--color-crimson) 15%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-crimson) 30%, transparent)",
                  color: "var(--color-crimson)",
                }}
              >
                {enemy.gimmickName}
              </span>
            )}
          </div>
          <HpBar current={enemyHp} max={enemy.hp} variant="enemy" />
        </div>

        <div className="h-px w-full" style={{ background: "var(--color-border)" }} />

        {/* Player */}
        <div>
          <p
            className="mb-3 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--color-mist)", opacity: 0.45 }}
          >
            You
          </p>
          <HpBar
            current={playerHp}
            max={PLAYER_MAX_HP}
            variant="player"
          />

          {/* Status */}
          {victoryAchieved ? (
            <div
              className="mt-3 flex items-center gap-2 rounded px-3 py-2"
              style={{
                background: "color-mix(in srgb, var(--color-gold) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-gold) 40%, transparent)",
              }}
              aria-live="polite"
            >
              <div
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: "var(--color-gold)" }}
              />
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--color-gold)" }}
              >
                Flow State Active
              </span>
            </div>
          ) : (
            <div
              className={`mt-3 flex items-center gap-2 rounded px-3 py-2 text-xs transition-all duration-300 battle-status-badge ${
                idleWarning
                  ? "battle-status-badge--idle"
                  : "battle-status-badge--writing"
              }`}
              style={
                idleWarning
                  ? undefined
                  : {
                      background: "var(--surface-card)",
                      border: "1px solid var(--color-border-strong)",
                    }
              }
              aria-live="assertive"
              aria-label={idleWarning ? "Idle — taking damage" : "Writing"}
            >
              <div
                className={`battle-status-badge__dot h-2 w-2 flex-shrink-0 rounded-full ${idleWarning ? "idle-dot" : ""}`}
                style={idleWarning ? undefined : { background: "var(--color-mist)", opacity: 0.6 }}
              />
              <span
                className="battle-status-badge__text text-[10px] uppercase tracking-wider"
                style={idleWarning ? undefined : { color: "var(--text-muted)", opacity: 1 }}
              >
                {idleWarning ? "Idle — taking damage!" : "Keep writing."}
              </span>
            </div>
          )}
        </div>

        <div className="h-px w-full" style={{ background: "var(--color-border)" }} />

        {/* Word count */}
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-rune-serif text-3xl tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {timedWords.toLocaleString()}
            </span>
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              {victoryAchieved ? "battle words" : "words written"}
            </span>
          </div>
          {victoryAchieved && (
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="font-rune-serif text-lg tabular-nums"
                style={{ color: "var(--color-gold)" }}
              >
                {lapWords.toLocaleString()}
              </span>
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{ color: "var(--color-mist)", opacity: 0.7 }}
              >
                lap
              </span>
            </div>
          )}
        </div>

        {/* Battle log — compact */}
        <div className="overflow-hidden">
          <BattleLog entries={battleLog} />
        </div>

        {/* Surrender / End Session */}
        <div className="mt-auto">
          {victoryAchieved ? (
            <button
              type="button"
              onClick={onEndSession}
              className="w-full rounded py-2.5 text-[10px] uppercase tracking-wider transition-colors duration-150"
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
              className="w-full rounded py-2.5 text-[10px] uppercase tracking-wider transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-crimson)_12%,transparent)]"
              style={{
                color: "var(--color-crimson)",
                border: "1px solid color-mix(in srgb, var(--color-crimson) 28%, transparent)",
              }}
            >
              Surrender
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function ResultsState({
  result,
  isSaving,
  textWritten,
  isSessionValid,
  onBattleAgain,
  pageSource,
}: {
  result: ResultData;
  isSaving: boolean;
  textWritten: string;
  isSessionValid: boolean;
  onBattleAgain: () => void;
  pageSource?: PageSource;
}) {
  const isVictory = result.outcome === "victory";

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-16">
      <style>{`
        @keyframes rune-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .shimmer-gold {
          background: linear-gradient(90deg,
            var(--color-gold) 0%,
            color-mix(in srgb, var(--color-gold) 55%, white) 45%,
            color-mix(in srgb, var(--color-gold) 80%, white) 55%,
            var(--color-gold) 100%);
          background-size: 200% auto;
          animation: rune-shimmer 2.4s linear infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .shimmer-crimson {
          background: linear-gradient(90deg,
            var(--color-crimson) 0%,
            color-mix(in srgb, var(--color-crimson) 55%, white) 45%,
            color-mix(in srgb, var(--color-crimson) 80%, white) 55%,
            var(--color-crimson) 100%);
          background-size: 200% auto;
          animation: rune-shimmer 2.4s linear infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>

      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <p
          className="mb-3 text-xs uppercase tracking-[0.3em]"
          style={{ color: "var(--color-mist)", opacity: 0.55 }}
        >
          {isVictory ? "✦ Battle Complete ✦" : "✦ Fallen ✦"}
        </p>

        <h1
          className={`!mb-6 font-rune-serif text-6xl ${
            isVictory ? "shimmer-gold" : "shimmer-crimson"
          }`}
        >
          {isVictory ? "Victory" : "Defeated"}
        </h1>

        <div
          className="mb-8 h-px w-24"
          style={{
            background: `linear-gradient(90deg, transparent, ${
              isVictory
                ? "var(--color-border-strong)"
                : "color-mix(in srgb, var(--color-crimson) 35%, transparent)"
            }, transparent)`,
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
          {isVictory ? "battle words" : "words written"}
        </p>

        {isVictory && (
          <div
            className="mt-4 rounded px-5 py-2.5 text-xs"
            style={{
              background: "color-mix(in srgb, var(--color-gold) 6%, transparent)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="Split word count breakdown"
          >
            <span style={{ color: "var(--color-mist)" }}>
              Battle Words:{" "}
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
        )}

        {/* Stats row */}
        <div className="mx-auto mt-10 mb-8 flex max-w-xs items-center justify-center gap-6">
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
              style={{
                color: isVictory
                  ? "var(--color-gold)"
                  : "var(--color-crimson)",
              }}
            >
              {isVictory ? "1.5×" : "0.5×"}
            </p>
            <p
              className="mt-0.5 text-[10px] uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              multiplier
            </p>
          </div>

          <div className="h-8 w-px" style={{ background: "var(--color-border)" }} />

          <div>
            <p
              className="font-rune-serif text-sm leading-tight"
              style={{
                color: isVictory
                  ? "var(--text-primary)"
                  : "var(--color-crimson)",
              }}
            >
              {result.enemyName}
            </p>
            <p
              className="mt-0.5 text-[10px] uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              {isVictory ? "defeated" : "victorious"}
            </p>
          </div>
        </div>

        {!isVictory && (
          <p
            className="mb-6 text-sm italic"
            style={{ color: "var(--color-mist)", opacity: 0.65 }}
          >
            Every word still counts. The page remembers your effort.
          </p>
        )}

        <div className="flex flex-col items-center gap-4">
          <div className="flex justify-center gap-4">
            <Button variant="primary" onClick={onBattleAgain}>
              Battle Again
            </Button>
            <Link href="/games">
              <Button variant="ghost">Return to Hub</Button>
            </Link>
          </div>
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
          creditDate={result.creditDate}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BattlePage() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);

  useEffect(() => {
    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    if (prefs.hideArena === true) router.replace("/dashboard");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Phase
  const [phase, setPhase] = useState<BattlePhase>("enemy-select");
  const [selectedEnemy, setSelectedEnemy] = useState<EnemyDef | null>(null);
  const [pageSource, setPageSource] = useState<PageSource>({ type: "fresh" });

  // Battle state (rendered)
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [enemyHp, setEnemyHp] = useState(0);
  const [wordsWritten, setWordsWritten] = useState(0);
  const [battleTextWritten, setBattleTextWritten] = useState("");
  const [idleWarning, setIdleWarning] = useState(false);
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const [gameKey, setGameKey] = useState(0);
  const [victoryAchieved, setVictoryAchieved] = useState(false);

  // Results
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionValid, setSessionValid] = useState(true);
  const [showExitModal, setShowExitModal] = useState(false);

  // Refs — read by game loop and callbacks without re-render
  const playerHpRef = useRef(PLAYER_MAX_HP);
  const enemyHpRef = useRef(0);
  const battleTextWrittenRef = useRef("");
  const lastTypedAtRef = useRef(0);
  const elapsedSecondsRef = useRef(0);
  const logIdRef = useRef(0);
  const phaseRef = useRef<BattlePhase>("enemy-select");
  const wordsWrittenRef = useRef(0);
  const hasSavedRef = useRef(false);
  const victoryAchievedRef = useRef(false);
  const wordsAtVictoryRef = useRef(0);
  const gameTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep phaseRef in sync
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const addLog = useCallback((message: string) => {
    const id = logIdRef.current++;
    setBattleLog((prev) => [...prev.slice(-24), { id, message }]);
  }, []);

  const endBattle = useCallback(
    (outcome: BattleOutcome, enemy: EnemyDef) => {
      if (phaseRef.current !== "active") return;
      phaseRef.current = "results";
      setPhase("results");
      useGameStore.getState().setGameState("results");

      const totalWords = wordsWrittenRef.current;
      const isVictory = outcome === "victory";

      let xp: number;
      let sprintWords: number;
      let lapWords: number;

      if (isVictory) {
        sprintWords = wordsAtVictoryRef.current;
        lapWords = Math.max(0, totalWords - sprintWords);
        const sprintXp = Math.round(xpRewardForWords(sprintWords) * 1.5);
        const lapXp = lapWords > 0 ? xpRewardForWords(lapWords) : 0;
        xp = sprintXp + lapXp;
      } else {
        sprintWords = totalWords;
        lapWords = 0;
        xp = Math.max(5, Math.round(xpRewardForWords(totalWords) * 0.5));
      }

      // Uniqueness check — paste is blocked in GameEditor, so all words are typed
      const wordList = extractWords(battleTextWrittenRef.current);
      const sessionIsValid = isSessionValid(wordList);
      setSessionValid(sessionIsValid);

      if (!sessionIsValid) {
        xp = 0;
        useToastStore.getState().showToast(
          "Telemetry unrecognized. Session rewards suspended.",
          "error"
        );
      }

      // Captured once and reused for both the credit below and the later
      // transfer-to-project call, so a save that happens after local midnight
      // still subtracts from the bucket the words actually landed in.
      const creditDate = getLocalDateString();
      setResultData({
        words: totalWords,
        xp,
        outcome,
        enemyName: enemy.name,
        enemyId: enemy.id,
        sprintWords,
        lapWords,
        creditDate,
      });

      if (!hasSavedRef.current) {
        hasSavedRef.current = true;
        const userId = useProfileStore.getState().profile?.id;
        setIsSaving(true);
        Promise.all([
          createGameSession(
            "battle",
            totalWords,
            elapsedSecondsRef.current,
            xp,
            enemy.id,
            {
              outcome: sessionIsValid ? outcome : "invalidated",
              enemy_name: enemy.name,
              sprint_words: sprintWords,
              lap_words: lapWords,
            }
          ),
          userId && sessionIsValid
            ? awardXp(userId, xp, "battle_mode")
            : Promise.resolve<{ data: null; error: null }>({
                data: null,
                error: null,
              }),
          recordWordsWritten(null, totalWords, null, creditDate),
        ]).then(([, xpResult]) => {
          setIsSaving(false);
          if (xpResult.data) {
            useProfileStore
              .getState()
              .updateXp(xpResult.data.xp, xpResult.data.level);
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
    },
    []
  );

  // Game loop — runs every second while battle is active
  useEffect(() => {
    if (phase !== "active" || !selectedEnemy) return;
    const enemy = selectedEnemy;

    const tick = setInterval(() => {
      if (phaseRef.current !== "active") return;
      // Suspended during victory lap
      if (victoryAchievedRef.current) return;

      elapsedSecondsRef.current += 1;
      const elapsed = elapsedSecondsRef.current;
      const idleMs = Date.now() - lastTypedAtRef.current;
      const isIdle = idleMs >= 5000;

      setIdleWarning(isIdle);

      // Idle damage
      if (isIdle) {
        const dmg = enemy.id === "deadline" ? 10 : 5;
        const newHp = Math.max(0, playerHpRef.current - dmg);
        playerHpRef.current = newHp;
        setPlayerHp(newHp);

        const idleSeconds = Math.round(idleMs / 1000);
        if (idleSeconds === 5 || idleSeconds % 15 === 0) {
          addLog(`${enemy.name} strikes! -${dmg} HP`);
        }

        if (newHp <= 0) {
          addLog("You have fallen...");
          endBattle("defeat", enemy);
          return;
        }
      }

      // Writer's Block heal at 60s intervals
      if (
        enemy.id === "writers-block" &&
        elapsed > 0 &&
        elapsed % 60 === 0 &&
        phaseRef.current === "active"
      ) {
        const healed = Math.min(50, enemy.hp - enemyHpRef.current);
        if (healed > 0) {
          enemyHpRef.current = Math.min(enemy.hp, enemyHpRef.current + 50);
          setEnemyHp(enemyHpRef.current);
          addLog(`Writer's Block heals ${healed} HP!`);
        }
      }

      // Periodic flavor line every 45s
      if (elapsed % 45 === 0 && phaseRef.current === "active") {
        const lines = enemy.flavorLines;
        addLog(lines[(Math.floor(elapsed / 45) - 1) % lines.length]);
      }
    }, 1000);

    gameTickRef.current = tick;

    return () => {
      clearInterval(tick);
      gameTickRef.current = null;
    };
  }, [phase, selectedEnemy, addLog, endBattle]);

  const handleWordCount = useCallback(
    (count: number) => {
      if (phaseRef.current !== "active" || !selectedEnemy) return;

      const prev = wordsWrittenRef.current;
      if (count <= prev) return;

      wordsWrittenRef.current = count;
      setWordsWritten(count);
      lastTypedAtRef.current = Date.now();

      // During victory lap: track words but skip all combat logic
      if (victoryAchievedRef.current) return;

      setIdleWarning(false);

      // Deal damage in 5-word batches
      const extraBatches = Math.floor(count / 5) - Math.floor(prev / 5);
      if (extraBatches > 0) {
        const dmg = extraBatches * 10;
        const newEnemyHp = Math.max(0, enemyHpRef.current - dmg);
        enemyHpRef.current = newEnemyHp;
        setEnemyHp(newEnemyHp);
        addLog(`You dealt ${dmg} damage! (${count} words)`);

        if (newEnemyHp <= 0) {
          addLog(`${selectedEnemy.name} is defeated!`);
          addLog("✦ Flow State Active — keep writing!");
          // Freeze the game loop; stay in 'active' phase until End Session
          victoryAchievedRef.current = true;
          wordsAtVictoryRef.current = count;
          setVictoryAchieved(true);
          if (gameTickRef.current) {
            clearInterval(gameTickRef.current);
            gameTickRef.current = null;
          }
        }
      }
    },
    [selectedEnemy, addLog]
  );

  const handleEndSession = useCallback(() => {
    if (!selectedEnemy) return;
    endBattle("victory", selectedEnemy);
  }, [selectedEnemy, endBattle]);

  const handleSelectEnemy = useCallback(
    (enemy: EnemyDef) => {
      // Reset refs
      playerHpRef.current = PLAYER_MAX_HP;
      enemyHpRef.current = enemy.hp;
      lastTypedAtRef.current = Date.now();
      elapsedSecondsRef.current = 0;
      wordsWrittenRef.current = 0;
      hasSavedRef.current = false;
      logIdRef.current = 3;
      victoryAchievedRef.current = false;
      wordsAtVictoryRef.current = 0;
      battleTextWrittenRef.current = "";

      // Set state
      setSelectedEnemy(enemy);
      setPlayerHp(PLAYER_MAX_HP);
      setEnemyHp(enemy.hp);
      setWordsWritten(0);
      setBattleTextWritten("");
      setIdleWarning(false);
      setVictoryAchieved(false);
      setBattleLog([
        { id: 0, message: `You face ${enemy.name}.` },
        { id: 1, message: enemy.flavorLines[0] },
        { id: 2, message: "The battle begins..." },
      ]);
      setResultData(null);
      setGameKey((k) => k + 1);
      setPhase("active");
      useGameStore.getState().setGameState("active");
    },
    []
  );

  const handleExit = useCallback(() => {
    if (wordsWritten === 0) {
      useGameStore.getState().resetToSetup();
      router.push("/games");
      return;
    }
    setShowExitModal(true);
  }, [wordsWritten, router]);

  const handleLeaveArena = useCallback(() => {
    setShowExitModal(false);
    useGameStore.getState().resetToSetup();
    router.push("/games");
  }, [router]);

  const handleBattleAgain = useCallback(() => {
    hasSavedRef.current = false;
    victoryAchievedRef.current = false;
    wordsAtVictoryRef.current = 0;
    battleTextWrittenRef.current = "";
    setVictoryAchieved(false);
    setSessionValid(true);
    setResultData(null);
    setBattleTextWritten("");
    setPhase("enemy-select");
    setSelectedEnemy(null);
    useGameStore.getState().resetToSetup();
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === "enemy-select") {
    return <EnemySelectState onSelect={handleSelectEnemy} onSourceSelect={setPageSource} />;
  }

  if (phase === "results" && resultData) {
    return (
      <ResultsState
        result={resultData}
        isSaving={isSaving}
        textWritten={battleTextWritten}
        isSessionValid={sessionValid}
        onBattleAgain={handleBattleAgain}
        pageSource={pageSource}
      />
    );
  }

  const hudTimedWords = victoryAchieved
    ? wordsAtVictoryRef.current
    : wordsWritten;
  const hudLapWords = victoryAchieved
    ? Math.max(0, wordsWritten - wordsAtVictoryRef.current)
    : 0;

  // Active battle — two-column layout
  return (
    <div className="flex h-full min-h-0">
      {/* Left: Battle HUD */}
      <div className="w-80 flex-shrink-0 overflow-hidden xl:w-96">
        {selectedEnemy && (
          <BattleHUD
            enemy={selectedEnemy}
            enemyHp={enemyHp}
            playerHp={playerHp}
            timedWords={hudTimedWords}
            lapWords={hudLapWords}
            idleWarning={idleWarning}
            victoryAchieved={victoryAchieved}
            battleLog={battleLog}
            onExit={handleExit}
            onEndSession={handleEndSession}
          />
        )}
      </div>

      {/* Right: Editor */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--color-vellum)" }}
      >
        {pageSource.type === "existing" && pageSource.page.content && (
          <div className="mx-auto max-w-[720px]">
            <ContextPageHeader content={pageSource.page.content} />
          </div>
        )}
        <div className="mx-auto max-w-[720px]">
          <GameEditor
            key={gameKey}
            placeholder="Every word deals damage."
            onWordCountChange={handleWordCount}
            onTextChange={(html) => {
              battleTextWrittenRef.current = html;
              setBattleTextWritten(html);
              useGameStore.getState().setTextWritten(html);
            }}
          />
        </div>
      </div>

      {showExitModal && (
        <ExitGameModal
          title="Surrender the Battle?"
          words={wordsWritten}
          textWritten={battleTextWritten}
          pageSource={pageSource}
          onKeepGoing={() => setShowExitModal(false)}
          onLeave={handleLeaveArena}
        />
      )}
    </div>
  );
}
