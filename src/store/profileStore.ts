import { create } from "zustand";
import type { Profile } from "@/lib/types";

interface ProfileState {
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  updateXp: (xp: number, level: number) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  updateXp: (xp, level) =>
    set((s) =>
      s.profile ? { profile: { ...s.profile, xp, level } } : {}
    ),
}));
