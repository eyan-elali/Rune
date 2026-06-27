import { create } from "zustand";

// 'writing'  — first-time editor is fullscreen, all chrome hidden
// 'revealing' — chrome animates in after first successful save (~600ms)
// 'done'     — normal editor; onboarding complete for this user
export type OnboardingPhase = "writing" | "revealing" | "done";

interface OnboardingState {
  phase: OnboardingPhase;
  setPhase: (phase: OnboardingPhase) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  phase: "done",
  setPhase: (phase) => set({ phase }),
}));
