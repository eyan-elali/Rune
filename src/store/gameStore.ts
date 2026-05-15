import { create } from "zustand";

export type GameState = "idle" | "active" | "results";

interface GameStore {
  gameState: GameState;
  selectedDuration: number;
  wordsWritten: number;
  personalBests: Record<number, number>;
  startGame: (duration: number) => void;
  endGame: () => void;
  updateWordCount: (count: number) => void;
  setPersonalBest: (duration: number, count: number) => void;
  resetToSetup: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: "idle",
  selectedDuration: 600,
  wordsWritten: 0,
  personalBests: {},

  startGame: (duration) =>
    set({ gameState: "active", selectedDuration: duration, wordsWritten: 0 }),

  endGame: () => set({ gameState: "results" }),

  updateWordCount: (count) =>
    set((s) => ({ wordsWritten: Math.max(s.wordsWritten, count) })),

  setPersonalBest: (duration, count) =>
    set((s) => ({
      personalBests: { ...s.personalBests, [duration]: count },
    })),

  resetToSetup: () => set({ gameState: "idle", wordsWritten: 0 }),
}));
