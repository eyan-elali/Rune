import { create } from "zustand";

export type GameState = "idle" | "active" | "results";

interface GameStore {
  gameState: GameState;
  selectedDuration: number;
  wordsWritten: number;
  textWritten: string;
  personalBests: Record<number, number>;
  startGame: (duration: number) => void;
  endGame: () => void;
  updateWordCount: (count: number) => void;
  setTextWritten: (text: string) => void;
  setPersonalBest: (duration: number, count: number) => void;
  resetToSetup: () => void;
  setGameState: (s: GameState) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: "idle",
  selectedDuration: 600,
  wordsWritten: 0,
  textWritten: "",
  personalBests: {},

  startGame: (duration) =>
    set({ gameState: "active", selectedDuration: duration, wordsWritten: 0, textWritten: "" }),

  endGame: () => set({ gameState: "results" }),

  updateWordCount: (count) =>
    set((s) => ({ wordsWritten: Math.max(s.wordsWritten, count) })),

  setTextWritten: (text) => set({ textWritten: text }),

  setPersonalBest: (duration, count) =>
    set((s) => ({
      personalBests: { ...s.personalBests, [duration]: count },
    })),

  resetToSetup: () => set({ gameState: "idle", wordsWritten: 0, textWritten: "" }),

  setGameState: (s) => set({ gameState: s }),
}));
