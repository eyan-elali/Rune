import { create } from "zustand";

type Mode = "focus" | "game";

interface ModeState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: "focus",
  setMode: (mode) => set({ mode }),
}));
