"use client";
// Put at: @/store/playerPrefs.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type PlayerPrefs = {
  /** After 5s untouched, full-screen players keep only artwork / lyrics / progress. */
  autoHideDetails: boolean;
  setAutoHideDetails: (v: boolean) => void;
};

export const usePlayerPrefs = create<PlayerPrefs>()(
  persist(
    (set) => ({
      autoHideDetails: true,
      setAutoHideDetails: (v) => set({ autoHideDetails: v }),
    }),
    { name: "zenify-player-prefs" }
  )
);
