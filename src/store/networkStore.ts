import { create } from 'zustand'

interface NetworkStore {
  isOnline: boolean
  setOnline: (value: boolean) => void
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  isOnline: true, // optimistic default
  setOnline: (value) => set({ isOnline: value }),
}))
