import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Artist {
    id: string;
    name: string;
    bio?: string;
    imageUrl?: string;
}

export interface Album {
    id: string;
    title: string;
    coverUrl?: string;
    artistId: string;
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
}

interface PlayerState {
    currentTrack: Track | null;
    isPlaying: boolean;
    queue: Track[];
    originalQueue: Track[]; // To restore after shuffle
    isShuffled: boolean;
    repeatMode: 'off' | 'all' | 'one';
    volume: number;

    setTrack: (track: Track) => void;
    setQueue: (tracks: Track[]) => void;
    addToQueue: (track: Track) => void;
    removeFromQueue: (trackId: string) => void;

    togglePlay: () => void;
    setIsPlaying: (isPlaying: boolean) => void;

    playNext: () => void;
    playPrev: () => void;

    toggleShuffle: () => void;
    toggleRepeat: () => void;
    setVolume: (volume: number) => void;
}

export const usePlayerStore = create<PlayerState>()(
    persist(
        (set, get) => ({
            currentTrack: null,
            isPlaying: false,
            queue: [],
            originalQueue: [],
            isShuffled: false,
            repeatMode: 'off',
            volume: 1,

            setTrack: (track) => {
                const { queue } = get();
                // If queue is empty, set this track as queue
                if (queue.length === 0) {
                    set({ currentTrack: track, queue: [track], originalQueue: [track], isPlaying: true });
                } else {
                    set({ currentTrack: track, isPlaying: true });
                }
            },

            // Set entire queue (e.g. from playlist)
            setQueue: (tracks) => set({ queue: tracks, originalQueue: tracks }),

            addToQueue: (track) => set((state) => ({
                queue: [...state.queue, track],
                originalQueue: [...state.originalQueue, track]
            })),

            removeFromQueue: (trackId) => set((state) => ({
                queue: state.queue.filter(t => t.id !== trackId),
                originalQueue: state.originalQueue.filter(t => t.id !== trackId)
            })),

            togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
            setIsPlaying: (isPlaying) => set({ isPlaying }),

            playNext: () => {
                const { currentTrack, queue, repeatMode } = get();
                if (!currentTrack || queue.length === 0) return;

                const currentIndex = queue.findIndex(t => t.id === currentTrack.id);

                if (repeatMode === 'one') {
                    // Just replay current
                    const audio = document.querySelector('audio');
                    if (audio) {
                        audio.currentTime = 0;
                        audio.play();
                    }
                    return;
                }

                if (currentIndex < queue.length - 1) {
                    set({ currentTrack: queue[currentIndex + 1] });
                } else if (repeatMode === 'all') {
                    set({ currentTrack: queue[0] });
                } else {
                    set({ isPlaying: false });
                }
            },

            playPrev: () => {
                const { currentTrack, queue, repeatMode } = get();
                if (!currentTrack || queue.length === 0) return;

                const audio = document.querySelector('audio');
                // If more than 3 sec in, restart track
                if (audio && audio.currentTime > 3) {
                    audio.currentTime = 0;
                    return;
                }

                const currentIndex = queue.findIndex(t => t.id === currentTrack.id);

                if (currentIndex > 0) {
                    set({ currentTrack: queue[currentIndex - 1] });
                } else if (repeatMode === 'all') {
                    // Go to last
                    set({ currentTrack: queue[queue.length - 1] });
                } else {
                    // Stop or restart
                    if (audio) audio.currentTime = 0;
                }
            },

            toggleShuffle: () => {
                const { isShuffled, originalQueue } = get();

                if (isShuffled) {
                    set({ isShuffled: false, queue: originalQueue });
                } else {
                    const shuffled = [...originalQueue].sort(() => Math.random() - 0.5);
                    set({ isShuffled: true, queue: shuffled });
                }
            },

            toggleRepeat: () => set((state) => {
                const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
                const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
                return { repeatMode: modes[nextIndex] };
            }),

            setVolume: (volume) => set({ volume }),
        }),
        {
            name: 'player-storage',
            partialize: (state) => ({
                volume: state.volume,
                repeatMode: state.repeatMode,
                isShuffled: state.isShuffled
            }),
        }
    )
);
