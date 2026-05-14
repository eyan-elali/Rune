import { create } from "zustand";
import { persist } from "zustand/middleware";

type Mode = "focus" | "game";

interface ModeState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      mode: "focus",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "rune-mode-storage",
    }
  )
);