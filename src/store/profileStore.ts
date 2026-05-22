import { create } from "zustand";
import type { Profile, UserPreferences } from "@/lib/types";
import type { SubscriptionTier } from "@/lib/subscription";

export type PendingLevelUp = {
  newLevel: number;
  newUnlockables: string[];
};

interface ProfileState {
  profile: Profile | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: string;
  pendingLevelUp: PendingLevelUp | null;
  setProfile: (profile: Profile) => void;
  updateXp: (xp: number, level: number) => void;
  setPreferences: (preferences: Partial<UserPreferences>) => void;
  setPendingLevelUp: (data: PendingLevelUp) => void;
  clearLevelUp: () => void;
}

function tierFromProfile(profile: Profile): SubscriptionTier {
  const t = profile.subscription_tier
  if (t === 'scribe' || t === 'arcane') return t
  return 'free'
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  subscriptionTier: 'free',
  subscriptionStatus: 'inactive',
  pendingLevelUp: null,
  setProfile: (profile) =>
    set({
      profile,
      subscriptionTier: tierFromProfile(profile),
      subscriptionStatus: profile.subscription_status ?? 'inactive',
    }),
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
