import { create } from "zustand";

const STORAGE_KEY = "zenify_sleep_timer_end";
const STORAGE_MODE_KEY = "zenify_sleep_timer_mode";

interface SleepTimerState {
  endTimestamp: number | null;
  mode: "preset" | "track_end" | "custom" | null;
  remainingSeconds: number;
  warnedOneMinute: boolean;
  isOpen: boolean;

  setOpen: (open: boolean) => void;
  setTimer: (minutes: number, mode?: "preset" | "custom") => void;
  setEndAtTrackEnd: () => void;
  addFiveMinutes: () => void;
  clearTimer: () => void;
  tick: () => void;
  setWarned: (warned: boolean) => void;
}

const getInitialTimestamp = (): number | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    if (isNaN(ts) || ts <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_MODE_KEY);
      return null;
    }
    return ts;
  } catch {
    return null;
  }
};

const getInitialMode = (): "preset" | "track_end" | "custom" | null => {
  if (typeof window === "undefined") return null;
  return (localStorage.getItem(STORAGE_MODE_KEY) as any) || null;
};

export const useSleepTimerStore = create<SleepTimerState>((set, get) => ({
  endTimestamp: getInitialTimestamp(),
  mode: getInitialMode(),
  remainingSeconds: 0,
  warnedOneMinute: false,
  isOpen: false,

  setOpen: (open) => set({ isOpen: open }),

  setTimer: (minutes, mode = "preset") => {
    const end = Date.now() + minutes * 60 * 1000;
    try {
      localStorage.setItem(STORAGE_KEY, end.toString());
      localStorage.setItem(STORAGE_MODE_KEY, mode);
    } catch {}
    set({
      endTimestamp: end,
      mode,
      remainingSeconds: minutes * 60,
      warnedOneMinute: false,
      isOpen: false,
    });
  },

  setEndAtTrackEnd: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_MODE_KEY, "track_end");
    } catch {}
    set({
      endTimestamp: null,
      mode: "track_end",
      remainingSeconds: 0,
      warnedOneMinute: false,
      isOpen: false,
    });
  },

  addFiveMinutes: () => {
    const current = get().endTimestamp || Date.now();
    const newEnd = current + 5 * 60 * 1000;
    try {
      localStorage.setItem(STORAGE_KEY, newEnd.toString());
    } catch {}
    set({
      endTimestamp: newEnd,
      warnedOneMinute: false,
      remainingSeconds: Math.max(0, Math.round((newEnd - Date.now()) / 1000)),
    });
  },

  clearTimer: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_MODE_KEY);
    } catch {}
    set({
      endTimestamp: null,
      mode: null,
      remainingSeconds: 0,
      warnedOneMinute: false,
    });
  },

  tick: () => {
    const { endTimestamp } = get();
    if (!endTimestamp) {
      set({ remainingSeconds: 0 });
      return;
    }
    const diffMs = endTimestamp - Date.now();
    if (diffMs <= 0) {
      get().clearTimer();
    } else {
      set({ remainingSeconds: Math.ceil(diffMs / 1000) });
    }
  },

  setWarned: (warned) => set({ warnedOneMinute: warned }),
}));

