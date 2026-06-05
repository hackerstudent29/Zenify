import { create } from "zustand";
import { persist } from "zustand/middleware";
import { audioEngine } from "@/lib/audio-engine";

export interface Artist {
  id: string;
  name: string;
  bio?: string;
  imageUrl?: string;
  totalStreams?: number;
}

export interface Album {
  id: string;
  title: string;
  coverUrl?: string;
  artistId: string;
  palette?: Array<{r: number; g: number; b: number}>;
}

export interface Track {
  id: string;
  title: string;
  artistId: string;
  albumId?: string;
  artist: Artist;
  album?: Album;
  coverUrl?: string;
  audioUrl: string;
  duration: number;
  genre?: string;
  lyrics?: string;
  isFeatured?: boolean;
  isTrending?: boolean;
  price?: number;
  isPurchased?: boolean;
  streams?: number;
  aura_color?: string;
  aura_vibe?: string;
  analysisData?: any;
  palette?: Array<{r: number; g: number; b: number}>;
}

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  originalQueue: Track[]; // To restore after shuffle
  isShuffled: boolean;
  repeatMode: "off" | "one" | "two" | "all";
  repeatCounter: number;
  volume: number;
  currentTime: number;
  duration: number;
  audioFx: {
    eq: number[];
    reverb: string;
    is8D: boolean;
    direction8D: "clockwise" | "counter-clockwise";
    speed: number;
    pitch: number;
    crossfade: number;
  };

  setTrack: (track: Track, contextTracks?: Track[]) => void;
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;
  playNextTrack: (track: Track) => void;
  removeFromQueue: (trackId: string) => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
  clearQueue: () => void;

  togglePlay: () => void;
  setIsPlaying: (isPlaying: boolean) => void;

  playNext: (force?: boolean) => void;
  playPrev: () => void;

  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setVolume: (volume: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setFx: (fx: Partial<PlayerState["audioFx"]>) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      isPlaying: false,
      queue: [],
      originalQueue: [],
      isShuffled: false,
      repeatMode: "off",
      repeatCounter: 0,
      volume: 1,
      currentTime: 0,
      duration: 0,
      audioFx: {
        eq: [0, 0, 0],
        reverb: "none",
        is8D: false,
        direction8D: "clockwise",
        speed: 1,
        pitch: 1,
        crossfade: 5,
      },

      setTrack: (track, contextTracks) => {
        try { audioEngine.resume(); } catch (e) {}
        const { isShuffled, queue } = get();
        const baseQueue =
          contextTracks && contextTracks.length > 0
            ? contextTracks
            : queue.length > 0
              ? queue
              : [track];

        let newQueue = [...baseQueue];
        if (isShuffled) {
          const others = baseQueue.filter((t) => t.id !== track.id);
          // Fisher-Yates shuffle
          for (let i = others.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [others[i], others[j]] = [others[j], others[i]];
          }
          newQueue = [track, ...others];
        }

        set({
          currentTrack: track,
          isPlaying: true,
          queue: newQueue,
          originalQueue: baseQueue,
          repeatCounter: 0,
          currentTime: 0,
        });
      },

      // Set entire queue (e.g. from playlist)
      setQueue: (tracks) => set({ queue: tracks, originalQueue: tracks, repeatCounter: 0 }),

      addToQueue: (track) =>
        set((state) => ({
          queue: [...state.queue, track],
          originalQueue: [...state.originalQueue, track],
        })),

      playNextTrack: (track) =>
        set((state) => {
          const { currentTrack, queue } = state;
          if (!currentTrack) {
            return {
              currentTrack: track,
              queue: [track],
              originalQueue: [track],
              isPlaying: true
            };
          }
          const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
          const newQueue = [...queue];
          // Check if track already in queue later, maybe remove it first to "move" it?
          // For now, just insert.
          newQueue.splice(currentIndex + 1, 0, track);
          return {
            queue: newQueue,
            originalQueue: newQueue // Keep in sync for now
          };
        }),

      removeFromQueue: (trackId) =>
        set((state) => {
          const newQueue = state.queue.filter((t) => t.id !== trackId);
          const isRemovingCurrent = state.currentTrack?.id === trackId;

          if (isRemovingCurrent && newQueue.length > 0) {
            // If current is removed, play next
            const currentIndex = state.queue.findIndex(t => t.id === trackId);
            const nextTrack = newQueue[currentIndex] || newQueue[0];
            return {
              queue: newQueue,
              originalQueue: state.originalQueue.filter((t) => t.id !== trackId),
              currentTrack: nextTrack
            };
          }

          return {
            queue: newQueue,
            originalQueue: state.originalQueue.filter((t) => t.id !== trackId),
          };
        }),

      reorderQueue: (startIndex, endIndex) =>
        set((state) => {
          const newQueue = [...state.queue];
          const [removed] = newQueue.splice(startIndex, 1);
          newQueue.splice(endIndex, 0, removed);
          return { queue: newQueue };
        }),

      clearQueue: () =>
        set((state) => ({
          queue: state.currentTrack ? [state.currentTrack] : [],
          originalQueue: state.currentTrack ? [state.currentTrack] : [],
        })),

      togglePlay: () => {
        try { audioEngine.resume(); } catch (e) {}
        set((state) => ({ isPlaying: !state.isPlaying }));
      },
      setIsPlaying: (isPlaying) => {
        if (isPlaying) try { audioEngine.resume(); } catch (e) {}
        set({ isPlaying });
      },

      playNext: (force = false) => {
        try { audioEngine.resume(); } catch (e) {}
        const { currentTrack, queue, repeatMode, repeatCounter } = get();
        if (!currentTrack || queue.length === 0) return;

        // Handle Repeat modes
        if (!force) {
          if (repeatMode === "one") {
            const audio = document.querySelector("audio");
            if (audio) {
              audio.currentTime = 0;
              audio.play();
              set({ currentTime: 0 });
            }
            return;
          }

          if (repeatMode === "two") {
            if (repeatCounter < 1) { // Current play is #1 (counter 0), so replay once more for total 2
              const audio = document.querySelector("audio");
              if (audio) {
                audio.currentTime = 0;
                audio.play();
                set({
                  currentTime: 0,
                  repeatCounter: repeatCounter + 1
                });
              }
              return;
            }
          }
        }

        const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
        const isLastTrack = currentIndex === queue.length - 1;

        if (isLastTrack && repeatMode === "off" && !force) {
          set({ isPlaying: false, currentTime: 0 });
          const audio = document.querySelector("audio");
          if (audio) audio.pause();
          return;
        }

        const nextIndex = (currentIndex + 1) % queue.length;
        set({ currentTrack: queue[nextIndex], isPlaying: true, repeatCounter: 0, currentTime: 0 });
      },

      playPrev: () => {
        try { audioEngine.resume(); } catch (e) {}
        const { currentTrack, queue } = get();
        if (!currentTrack || queue.length === 0) return;

        const audio = document.querySelector("audio");
        if (audio && audio.currentTime > 3) {
          audio.currentTime = 0;
          set({ currentTime: 0 });
          return;
        }

        const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
        const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
        set({ currentTrack: queue[prevIndex], isPlaying: true, repeatCounter: 0, currentTime: 0 });
      },

      toggleShuffle: () => {
        const { isShuffled, originalQueue, currentTrack } = get();

        if (isShuffled) {
          // Turn Shuffle OFF
          set({ isShuffled: false, queue: originalQueue });
        } else {
          // Turn Shuffle ON
          if (currentTrack && originalQueue.length > 0) {
            const others = originalQueue.filter(
              (t) => t.id !== currentTrack.id,
            );
            for (let i = others.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [others[i], others[j]] = [others[j], others[i]];
            }
            const shuffled = [currentTrack, ...others];
            set({ isShuffled: true, queue: shuffled });
          } else {
            const copy = [...originalQueue];
            for (let i = copy.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            set({ isShuffled: true, queue: copy });
          }
        }
      },

      toggleRepeat: () =>
        set((state) => {
          const modes: ("off" | "one" | "two" | "all")[] = ["off", "one", "two", "all"];
          const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
          return { repeatMode: modes[nextIndex], repeatCounter: 0 };
        }),

      setVolume: (volume) => set({ volume }),
      setCurrentTime: (currentTime) => set({ currentTime }),
      setDuration: (duration) => set({ duration }),

      setFx: (fx) =>
        set((state) => ({
          audioFx: { ...state.audioFx, ...fx },
        })),
    }),
    {
      name: "player-storage",
      version: 6, // Bumping to clear transient states like currentTrack/isPlaying on refresh
      migrate: (persistedState: any) => {
        // Drop transient session state to ensure fresh state on refresh
        const { audioFx: _dropped, currentTrack: _t, isPlaying: _p, ...rest } = persistedState ?? {};
        return rest;
      },
      partialize: (state) => ({
        volume: state.volume,
        repeatMode: state.repeatMode,
        isShuffled: state.isShuffled,
        audioFx: state.audioFx,
      }),
    },
  ),
);
