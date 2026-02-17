import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Track {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    audioUrl: string;
    duration: number;
}

interface PlayerState {
    currentTrack: Track | null;
    queue: Track[];
    isPlaying: boolean;
    volume: number;

    playTrack: (track: Track) => void;
    setTrack: (track: Track) => void;
    setQueue: (tracks: Track[]) => void;
    addToQueue: (track: Track) => void;
    removeFromQueue: (trackId: string) => void;
    togglePlay: () => void;
    setVolume: (volume: number) => void;
    playNext: () => void;
    playPrev: () => void;
}

export const usePlayerStore = create<PlayerState>()(
    persist(
        (set, get) => ({
            currentTrack: null,
            queue: [],
            isPlaying: false,
            volume: 1,

            playTrack: (track) => set({ currentTrack: track, isPlaying: true }),
            setTrack: (track) => set({ currentTrack: track, isPlaying: true }),
            setQueue: (tracks) => set({ queue: tracks }),

            addToQueue: (track) => set((state) => ({ queue: [...state.queue, track] })),

            removeFromQueue: (id) => set((state) => ({ queue: state.queue.filter(t => t.id !== id) })),

            togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

            setVolume: (vol) => set({ volume: vol }),

            playNext: () => {
                const { queue, currentTrack } = get();
                if (queue.length === 0) return;

                const currentIndex = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1;
                const nextTrack = queue[currentIndex + 1];

                if (nextTrack) {
                    set({ currentTrack: nextTrack, isPlaying: true });
                }
            },

            playPrev: () => {
                const { queue, currentTrack } = get();
                if (!currentTrack) return;

                const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
                const prevTrack = queue[currentIndex - 1];

                if (prevTrack) {
                    set({ currentTrack: prevTrack, isPlaying: true });
                }
            }
        }),
        {
            name: 'zenify-player-storage',
        }
    )
);
