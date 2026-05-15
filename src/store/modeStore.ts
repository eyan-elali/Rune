import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Mode = "normal" | "focus" | "game";

interface ModeState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      mode: "normal",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "rune-mode-storage",
    }
  )
);
