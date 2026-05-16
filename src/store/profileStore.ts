import { create } from "zustand";
import type { Profile, UserPreferences } from "@/lib/types";

export type PendingLevelUp = {
  newLevel: number;
  newUnlockables: string[];
};

interface ProfileState {
  profile: Profile | null;
  pendingLevelUp: PendingLevelUp | null;
  setProfile: (profile: Profile) => void;
  updateXp: (xp: number, level: number) => void;
  setPreferences: (preferences: Partial<UserPreferences>) => void;
  setPendingLevelUp: (data: PendingLevelUp) => void;
  clearLevelUp: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  pendingLevelUp: null,
  setProfile: (profile) => set({ profile }),
  updateXp: (xp, level) =>
    set((s) =>
      s.profile ? { profile: { ...s.profile, xp, level } } : {}
    ),
  setPreferences: (preferences) =>
    set((s) =>
      s.profile
        ? {
            profile: {
              ...s.profile,
              preferences: { ...(s.profile.preferences ?? {}), ...preferences },
            },
          }
        : {}
    ),
  setPendingLevelUp: (data) => set({ pendingLevelUp: data }),
  clearLevelUp: () => set({ pendingLevelUp: null }),
}));
