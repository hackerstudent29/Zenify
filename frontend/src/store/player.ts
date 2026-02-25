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
    currentTime: number;
    duration: number;
    audioFx: {
        eq: number[];
        reverb: string;
        is8D: boolean;
        direction8D: 'clockwise' | 'counter-clockwise';
        speed: number;
        pitch: number;
        crossfade: number;
    };

    setTrack: (track: Track, contextTracks?: Track[]) => void;
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
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    setFx: (fx: Partial<PlayerState['audioFx']>) => void;
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
            currentTime: 0,
            duration: 0,
            audioFx: {
                eq: [0, 0, 0],
                reverb: 'none',
                is8D: false,
                direction8D: 'clockwise',
                speed: 1,
                pitch: 1,
                crossfade: 5,
            },

            setTrack: (track, contextTracks) => {
                const { isShuffled, queue } = get();
                // Determine the base queue for this playback session
                const baseQueue = contextTracks && contextTracks.length > 0 ? contextTracks :
                    (queue.length > 0 ? queue : [track]);

                let newQueue = [...baseQueue];
                if (isShuffled) {
                    const others = baseQueue.filter(t => t.id !== track.id);
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
                    originalQueue: baseQueue
                });
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
                    const audios = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];
                    const active = audios.find(a => !a.paused) ?? audios[0];
                    if (active) { active.currentTime = 0; active.play(); }
                    return;
                }

                if (currentIndex < queue.length - 1) {
                    // Next track in queue
                    set({ currentTrack: queue[currentIndex + 1], isPlaying: true });
                } else {
                    // End of queue — always wrap to start and keep playing
                    set({ currentTrack: queue[0], isPlaying: true });
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
                const { isShuffled, originalQueue, currentTrack } = get();

                if (isShuffled) {
                    // Turn Shuffle OFF
                    set({ isShuffled: false, queue: originalQueue });
                } else {
                    // Turn Shuffle ON
                    if (currentTrack && originalQueue.length > 0) {
                        const others = originalQueue.filter(t => t.id !== currentTrack.id);
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

            toggleRepeat: () => set((state) => {
                const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
                const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
                return { repeatMode: modes[nextIndex] };
            }),

            setVolume: (volume) => set({ volume }),
            setCurrentTime: (currentTime) => set({ currentTime }),
            setDuration: (duration) => set({ duration }),

            setFx: (fx) => set((state) => ({
                audioFx: { ...state.audioFx, ...fx }
            })),
        }),
        {
            name: 'player-storage',
            version: 2, // Bumping forces migration — clears any persisted audioFx (was saving speed:0.5)
            migrate: (persistedState: any) => {
                // Drop audioFx entirely — it is session-only, never persisted
                const { audioFx: _dropped, ...rest } = persistedState ?? {};
                return rest;
            },
            partialize: (state) => ({
                currentTrack: state.currentTrack,
                volume: state.volume,
                repeatMode: state.repeatMode,
                isShuffled: state.isShuffled,
                // audioFx intentionally NOT persisted — always resets to defaults on load
            }),
        }
    )
);
