"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { HpBar } from "@/components/games/HpBar";
import { BattleLog, type BattleLogEntry } from "@/components/games/BattleLog";
import { awardXp } from "@/lib/actions/xp";
import { appendSprintToProject, createGameSession } from "@/lib/actions/games";
import { recordWordsWritten } from "@/lib/actions/writingStats";
import { getProjects } from "@/lib/actions/projects";
import { getChapters } from "@/lib/actions/chapters";
import { xpRewardForWords } from "@/lib/xp";
import { useGameStore } from "@/store/gameStore";
import { useProfileStore } from "@/store/profileStore";
import type { Project, Chapter } from "@/lib/types";

const GameEditor = dynamic(() => import("@/components/editor/GameEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24">
      <span style={{ color: "var(--color-mist)" }}>Preparing the page&hellip;</span>
    </div>
  ),
});

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
}

// ── Enemy Select ──────────────────────────────────────────────────────────────

function EnemySelectState({ onSelect }: { onSelect: (e: EnemyDef) => void }) {
  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <div className="mb-10 text-center">
        <p
          className="mb-3 text-xs uppercase tracking-[0.3em]"
          style={{ color: "var(--color-mist)", opacity: 0.6 }}
        >
          ✦ Battle Mode ✦
        </p>
        <h1
          className="mb-3 font-rune-serif text-4xl"
          style={{ color: "var(--color-parchment)" }}
        >
          Choose Your Adversary
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-mist)" }}>
          Every enemy is a form of resistance. Choose wisely.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {ENEMIES.map((enemy) => (
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
                className="mb-1 font-rune-serif text-xl transition-colors duration-150"
                style={{ color: "var(--color-parchment)" }}
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
                        background: "rgba(139, 46, 46, 0.18)",
                        border: "1px solid rgba(139, 46, 46, 0.35)",
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
                      background: "rgba(201, 168, 76, 0.07)",
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
        ))}
      </div>

      <div className="mt-10 text-center">
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
  wordsWritten,
  idleWarning,
  victoryAchieved,
  battleLog,
  onExit,
  onEndSession,
}: {
  enemy: EnemyDef;
  enemyHp: number;
  playerHp: number;
  wordsWritten: number;
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
        className="flex h-full flex-col gap-5 overflow-y-auto p-6"
        style={{
          background: "var(--color-sepia)",
          borderRight: "1px solid var(--color-border-strong)",
        }}
      >
        {/* Enemy */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2
              className="font-rune-serif text-lg leading-tight"
              style={{ color: "var(--color-parchment)" }}
            >
              {enemy.name}
            </h2>
            {enemy.gimmickName && (
              <span
                className="text-[9px] uppercase tracking-widest rounded px-1.5 py-0.5 flex-shrink-0 ml-2"
                style={{
                  background: "rgba(139,46,46,0.15)",
                  border: "1px solid rgba(139,46,46,0.3)",
                  color: "var(--color-crimson)",
                }}
              >
                {enemy.gimmickName}
              </span>
            )}
          </div>
          <HpBar current={enemyHp} max={enemy.hp} variant="enemy" label="Enemy HP" />
        </div>

        <div className="h-px w-full" style={{ background: "var(--color-border)" }} />

        {/* Player */}
        <div>
          <HpBar
            current={playerHp}
            max={PLAYER_MAX_HP}
            variant="player"
            label="Your HP"
          />

          {/* Victory lap badge or idle indicator */}
          {victoryAchieved ? (
            <div
              className="mt-3 flex items-center gap-2 rounded px-3 py-2"
              style={{
                background: "rgba(201, 168, 76, 0.12)",
                border: "1px solid rgba(201, 168, 76, 0.4)",
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
                ✦ Arena Secure — Flow State Active
              </span>
            </div>
          ) : (
            <div
              className="mt-3 flex items-center gap-2 rounded px-3 py-2 text-xs transition-all duration-300"
              style={{
                background: idleWarning
                  ? "rgba(139, 46, 46, 0.15)"
                  : "rgba(26, 22, 20, 0.4)",
                border: `1px solid ${
                  idleWarning
                    ? "rgba(139, 46, 46, 0.4)"
                    : "var(--color-border)"
                }`,
              }}
              aria-live="assertive"
              aria-label={idleWarning ? "Idle — taking damage" : "Writing"}
            >
              <div
                className={`h-2 w-2 flex-shrink-0 rounded-full ${idleWarning ? "idle-dot" : ""}`}
                style={{
                  background: idleWarning
                    ? "var(--color-crimson)"
                    : "var(--color-mist)",
                  opacity: idleWarning ? 1 : 0.35,
                }}
              />
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{
                  color: idleWarning
                    ? "var(--color-crimson)"
                    : "var(--color-mist)",
                  opacity: idleWarning ? 1 : 0.4,
                }}
              >
                {idleWarning ? "Idle — taking damage!" : "Keep writing…"}
              </span>
            </div>
          )}
        </div>

        {/* Word count */}
        <div
          className="flex items-baseline gap-2 rounded px-3 py-2"
          style={{
            background: "rgba(201, 168, 76, 0.06)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span
            className="font-rune-serif text-2xl tabular-nums"
            style={{ color: "var(--color-parchment)" }}
          >
            {wordsWritten}
          </span>
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            words
          </span>
        </div>

        {/* Battle log */}
        <div className="flex flex-1 flex-col">
          <p
            className="mb-2 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--color-mist)", opacity: 0.4 }}
          >
            Battle Log
          </p>
          <BattleLog entries={battleLog} />
        </div>

        {/* Surrender / End Session */}
        {victoryAchieved ? (
          <button
            type="button"
            onClick={onEndSession}
            className="w-full rounded py-2 text-[10px] uppercase tracking-wider transition-colors duration-150"
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
            className="w-full rounded py-2 text-[10px] uppercase tracking-wider transition-colors duration-150 hover:bg-[rgba(139,46,46,0.12)]"
            style={{
              color: "var(--color-crimson)",
              border: "1px solid rgba(139, 46, 46, 0.28)",
            }}
          >
            Surrender
          </button>
        )}
      </div>
    </>
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
}: {
  words: number;
  textWritten: string;
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
    setSavedChapterName(chapter.title);
    setStep("saved");
  }

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

  if (step === "saving") {
    return (
      <Button variant="ghost" loading disabled className="mt-4">
        Saving…
      </Button>
    );
  }

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

  if (step === "loading") {
    return (
      <Button variant="ghost" loading disabled className="mt-4">
        Loading…
      </Button>
    );
  }

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
            scrollbarWidth: "thin",
            scrollbarColor: "var(--color-border-strong) transparent",
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
            scrollbarWidth: "thin",
            scrollbarColor: "var(--color-border-strong) transparent",
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
  onBattleAgain,
}: {
  result: ResultData;
  isSaving: boolean;
  textWritten: string;
  onBattleAgain: () => void;
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
          background: linear-gradient(90deg, #c9a84c 0%, #f5d98a 45%, #e8c76a 55%, #c9a84c 100%);
          background-size: 200% auto;
          animation: rune-shimmer 2.4s linear infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .shimmer-crimson {
          background: linear-gradient(90deg, #8b2e2e 0%, #c44545 45%, #a33535 55%, #8b2e2e 100%);
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
          className={`font-rune-serif text-6xl mb-6 ${
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
                : "rgba(139,46,46,0.35)"
            }, transparent)`,
          }}
        />

        {/* Total word count */}
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

        {/* Split breakdown — only shown on victory when lap words exist */}
        {isVictory && result.lapWords > 0 && (
          <div
            className="mt-4 rounded px-5 py-2.5 text-xs"
            style={{
              background: "rgba(201, 168, 76, 0.06)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="Split word count breakdown"
          >
            <span style={{ color: "var(--color-mist)" }}>
              Battle Words:{" "}
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
                  ? "var(--color-parchment)"
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

        <div className="flex justify-center gap-4">
          <Button variant="primary" onClick={onBattleAgain}>
            Battle Again
          </Button>
          <Link href="/games">
            <Button variant="ghost">Return to Hub</Button>
          </Link>
        </div>

        {/* Save to Project */}
        <SaveToProject words={result.words} textWritten={textWritten} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BattlePage() {
  const router = useRouter();

  // Phase
  const [phase, setPhase] = useState<BattlePhase>("enemy-select");
  const [selectedEnemy, setSelectedEnemy] = useState<EnemyDef | null>(null);

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

  // Refs — read by game loop and callbacks without re-render
  const playerHpRef = useRef(PLAYER_MAX_HP);
  const enemyHpRef = useRef(0);
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

      setResultData({
        words: totalWords,
        xp,
        outcome,
        enemyName: enemy.name,
        enemyId: enemy.id,
        sprintWords,
        lapWords,
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
              outcome,
              enemy_name: enemy.name,
              sprint_words: sprintWords,
              lap_words: lapWords,
            }
          ),
          userId
            ? awardXp(userId, xp, "battle_mode")
            : Promise.resolve<{ data: null; error: null }>({
                data: null,
                error: null,
              }),
          recordWordsWritten(null, totalWords),
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
    if (!confirm("Are you sure you want to surrender? Your progress in this encounter will be lost.")) return;
    useGameStore.getState().resetToSetup();
    router.push("/games");
  }, [router]);

  const handleBattleAgain = useCallback(() => {
    hasSavedRef.current = false;
    victoryAchievedRef.current = false;
    wordsAtVictoryRef.current = 0;
    setVictoryAchieved(false);
    setResultData(null);
    setBattleTextWritten("");
    setPhase("enemy-select");
    setSelectedEnemy(null);
    useGameStore.getState().resetToSetup();
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === "enemy-select") {
    return <EnemySelectState onSelect={handleSelectEnemy} />;
  }

  if (phase === "results" && resultData) {
    return (
      <ResultsState
        result={resultData}
        isSaving={isSaving}
        textWritten={battleTextWritten}
        onBattleAgain={handleBattleAgain}
      />
    );
  }

  // Active battle — two-column layout
  return (
    <div className="flex h-full min-h-0">
      {/* Left: Battle HUD */}
      <div className="w-72 flex-shrink-0 overflow-hidden xl:w-80">
        {selectedEnemy && (
          <BattleHUD
            enemy={selectedEnemy}
            enemyHp={enemyHp}
            playerHp={playerHp}
            wordsWritten={wordsWritten}
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
        <div
          className="mx-auto my-8 max-w-[680px]"
          style={{
            border: "1px solid var(--color-border-strong)",
            borderRadius: "4px",
            background: "var(--color-vellum)",
            boxShadow:
              "0 0 0 4px rgba(201,168,76,0.03), 0 4px 32px rgba(0,0,0,0.18)",
          }}
        >
          <GameEditor
            key={gameKey}
            onWordCountChange={handleWordCount}
            onTextChange={(html) => {
              setBattleTextWritten(html);
              useGameStore.getState().setTextWritten(html);
            }}
          />
        </div>
      </div>
    </div>
  );
}
