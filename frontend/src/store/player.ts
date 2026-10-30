import { create } from "zustand";
import { persist } from "zustand/middleware";
import { audioEngine, DEFAULT_AUDIO_FX, type AudioFxSettings } from "@/lib/audio-engine";

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
  artistName?: string;
  album?: Album;
  coverUrl?: string;
  audioUrl: string;
  duration: number;
  genre?: string;
  lyrics?: string;
  synced_lyrics?: any;
  raw_lrc?: string;
  lyricsOffset?: number;
  romanizedLyrics?: string;
  romanizedSyncedLyrics?: any;
  romanizedLang?: string;
  isFeatured?: boolean;
  isTrending?: boolean;
  price?: number;
  isPurchased?: boolean;
  streams?: number;
  featuredArtists?: string;
  composers?: string;
  music?: string;
  musicDirector?: string;
  singers?: string;
  lyricist?: string;
  lyricists?: string;
  bgmComposer?: string;
  aura_color?: string;
  aura_vibe?: string;
  analysisData?: any;
  palette?: Array<{r: number; g: number; b: number}>;
  isVirtual?: boolean;
  isYoutube?: boolean;
  youtubeId?: string;
  isRapid?: boolean;
}

export interface UserQueueItem {
  queueId: string;
  track: Track;
}

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;

  // 3-Part Queue Model:
  userQueue: UserQueueItem[];    // Items added manually by user (FIFO)
  contextQueue: Track[];         // Remaining tracks from playing album / playlist
  contextOriginalQueue: Track[]; // For restoring context after shuffle
  contextName?: string;          // Name of the context source (e.g. album or playlist name)
  playHistory: Track[];          // History for "Previous" navigation
  queue: Track[];                // Total computed queue for backward compatibility
  originalQueue: Track[];

  isShuffled: boolean;
  repeatMode: "off" | "one" | "two" | "all";
  repeatCounter: number;
  volume: number;
  currentTime: number;
  duration: number;
  audioFx: AudioFxSettings;

  // Modern 3-tier queue actions
  setTrack: (track: Track, contextTracks?: Track[], contextName?: string) => void;
  addToUserQueue: (trackOrTracks: Track | Track[], options?: { feedback?: boolean; contextName?: string }) => void;
  removeFromUserQueue: (queueId: string) => void;
  playUserQueueItem: (queueId: string) => void;
  reorderUserQueue: (startIndex: number, endIndex: number) => void;
  reorderContextQueue: (startIndex: number, endIndex: number) => void;
  moveUserQueueItem: (index: number, direction: "up" | "down") => void;
  moveContextQueueItem: (index: number, direction: "up" | "down") => void;
  moveUserQueueToTop: (index: number) => void;
  moveUserQueueToBottom: (index: number) => void;
  moveContextQueueToTop: (index: number) => void;
  moveContextQueueToBottom: (index: number) => void;
  promoteContextTrackToNext: (trackId: string) => void;
  clearUserQueue: () => void;
  removeFromContextQueue: (trackId: string) => void;

  // Backward compatibility actions
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;
  playNextTrack: (track: Track) => void;
  removeFromQueue: (trackIdOrQueueId: string) => void;
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
  setLyricsOffset: (offset: number) => void;
  updateCurrentTrackData: (partial: Partial<Track>) => void;
}

function computeTotalQueue(currentTrack: Track | null, userQueue: UserQueueItem[], contextQueue: Track[]): Track[] {
  const result: Track[] = [];
  if (currentTrack) result.push(currentTrack);
  if (Array.isArray(userQueue)) {
    for (const u of userQueue) {
      if (u && u.track) result.push(u.track);
    }
  }
  if (Array.isArray(contextQueue)) {
    for (const c of contextQueue) {
      if (c) result.push(c);
    }
  }
  return result;
}

export function detectTrackLanguage(track: Track): string {
  // 1. Explicit track language
  const explicit = (track as any).language || (track as any).vibeProfile?.language;
  if (explicit && typeof explicit === 'string' && explicit.trim() && explicit.toLowerCase() !== 'unknown') {
    return explicit.trim().toLowerCase();
  }

  // 2. Romanized language tag (e.g. from lyrics romanization)
  const romLang = (track as any).romanizedLang;
  if (romLang && typeof romLang === 'string' && romLang.trim()) {
    const l = romLang.toLowerCase();
    if (l.includes('ta') || l.includes('tamil')) return 'tamil';
    if (l.includes('hi') || l.includes('hindi')) return 'hindi';
    if (l.includes('te') || l.includes('telugu')) return 'telugu';
    if (l.includes('ml') || l.includes('malayalam')) return 'malayalam';
    if (l.includes('kn') || l.includes('kannada')) return 'kannada';
    if (l.includes('pa') || l.includes('punjabi')) return 'punjabi';
    if (l.includes('bn') || l.includes('bengali')) return 'bengali';
    if (l.includes('gu') || l.includes('gujarati')) return 'gujarati';
    if (l.includes('en') || l.includes('english')) return 'english';
  }

  // 3. Script character range detection on title, lyrics, and artist
  const sample = `${track.title || ''} ${track.lyrics || ''} ${(track as any).artistName || ''} ${track.artist?.name || ''}`;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code >= 0x0B80 && code <= 0x0BFF) return 'tamil';
    if (code >= 0x0900 && code <= 0x097F) return 'hindi';
    if (code >= 0x0C00 && code <= 0x0C7F) return 'telugu';
    if (code >= 0x0D00 && code <= 0x0D7F) return 'malayalam';
    if (code >= 0x0C80 && code <= 0x0CFF) return 'kannada';
    if (code >= 0x0A00 && code <= 0x0A7F) return 'punjabi';
    if (code >= 0x0980 && code <= 0x09FF) return 'bengali';
    if (code >= 0x0A80 && code <= 0x0AFF) return 'gujarati';
  }

  // 4. Check user preferences from localStorage
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('zenify_preferred_language') || localStorage.getItem('zenify_language');
      if (stored) return stored.toLowerCase();
    }
  } catch {}

  return 'english';
}

export function extractTrackVibeParams(track: Track, limit = 25) {
  const trackMood = track.aura_vibe || (track as any).mood || (track as any).vibeProfile?.aura_vibe || (track as any).analysisData?.mood || '';
  const trackMovie = (typeof track.album === 'string' ? track.album : track.album?.title) || (track as any).albumTitle || (track as any).movie || '';
  const trackArtist = track.artist?.name || (track as any).artistName || '';
  const trackLang = detectTrackLanguage(track);
  const trackGenre = track.genre || (track as any).vibeProfile?.genre || '';

  return {
    seedType: 'track',
    seedId: track.id,
    title: track.title,
    artist: trackArtist,
    language: trackLang,
    genre: trackGenre,
    album: trackMovie,
    movie: trackMovie,
    mood: trackMood,
    aura_vibe: trackMood,
    limit
  };
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      isPlaying: false,
      userQueue: [],
      contextQueue: [],
      contextOriginalQueue: [],
      contextName: undefined,
      playHistory: [],
      queue: [],
      originalQueue: [],
      isShuffled: false,
      repeatMode: "off",
      repeatCounter: 0,
      volume: 1,
      currentTime: 0,
      duration: 0,
      audioFx: { ...DEFAULT_AUDIO_FX, eq: [0, 0, 0] },

      setTrack: (track, contextTracks, contextName) => {
        try { audioEngine.resume(); } catch (e) {}
        const { userQueue, playHistory, currentTrack: prevTrack, isShuffled } = get();

        let newContextQueue: Track[] = [];
        const fullContext = contextTracks && contextTracks.length > 0 ? contextTracks : [track];

        const clickedIndex = fullContext.findIndex(t => t.id === track.id);
        if (clickedIndex !== -1) {
          newContextQueue = fullContext.slice(clickedIndex + 1);
        } else {
          newContextQueue = fullContext.filter(t => t.id !== track.id);
        }

        const finalContext = [...newContextQueue];
        if (isShuffled) {
          // Shuffle Context only; User Queue order is NEVER changed
          for (let i = finalContext.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [finalContext[i], finalContext[j]] = [finalContext[j], finalContext[i]];
          }
        }

        const resolvedContextName = contextName || track.album?.title || (typeof track.album === 'string' ? track.album : undefined) || "Album";
        const updatedHistory = prevTrack ? [...playHistory, prevTrack].slice(-50) : playHistory;

        set({
          currentTrack: track,
          isPlaying: true,
          contextQueue: finalContext,
          contextOriginalQueue: newContextQueue,
          contextName: resolvedContextName,
          playHistory: updatedHistory,
          repeatCounter: 0,
          currentTime: 0,
          duration: track.duration || 0,
          queue: computeTotalQueue(track, userQueue, finalContext),
          originalQueue: computeTotalQueue(track, userQueue, newContextQueue),
        });

        // Track play persistence: record to local recent plays
        try {
          if (typeof window !== 'undefined' && track && track.id) {
            const RAW = localStorage.getItem('zenify_recently_played_tracks');
            const list = RAW ? JSON.parse(RAW) : [];
            const filtered = Array.isArray(list) ? list.filter((t: any) => t && t.id !== track.id) : [];
            const updated = [track, ...filtered].slice(0, 10);
            localStorage.setItem('zenify_recently_played_tracks', JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent('zenify:track-played', { detail: { track } }));
          }
        } catch (e) {}
      },

      addToUserQueue: (trackOrTracks, options) => {
        const rawList = Array.isArray(trackOrTracks) ? trackOrTracks : (trackOrTracks ? [trackOrTracks] : []);
        const validTracks = rawList.filter(t => t && t.id);
        if (validTracks.length === 0) return;

        // Feedback toast notification
        if (options?.feedback !== false) {
          try {
            // Lazy import UI store for toast
            import("@/store/ui").then(({ useUIStore }) => {
              if (validTracks.length === 1) {
                useUIStore.getState().showToast("Added to queue", "success");
              } else {
                useUIStore.getState().showToast(`${validTracks.length} songs added to queue`, "success");
              }
            }).catch(() => {});
          } catch (e) {}
        }

        const { currentTrack, userQueue, contextQueue } = get();

        // Edge case: Empty player / nothing playing -> first added item plays immediately, rest are queued
        if (!currentTrack) {
          const first = validTracks[0];
          const remaining = validTracks.slice(1);
          const newItems: UserQueueItem[] = remaining.map((t, idx) => ({
            queueId: `${t.id}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            track: t
          }));

          try { audioEngine.resume(); } catch (e) {}
          set({
            currentTrack: first,
            isPlaying: true,
            userQueue: newItems,
            currentTime: 0,
            duration: first.duration || 0,
            queue: computeTotalQueue(first, newItems, contextQueue),
            originalQueue: computeTotalQueue(first, newItems, contextQueue),
          });
          return;
        }

        // Duplicates allowed: each addition receives an independent unique queueId
        const newItems: UserQueueItem[] = validTracks.map((t, idx) => ({
          queueId: `${t.id}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          track: t
        }));

        const updatedUserQueue = [...(userQueue || []), ...newItems];
        set({
          userQueue: updatedUserQueue,
          queue: computeTotalQueue(currentTrack, updatedUserQueue, contextQueue),
          originalQueue: computeTotalQueue(currentTrack, updatedUserQueue, contextQueue),
        });
      },

      removeFromUserQueue: (queueId) => {
        const { userQueue, currentTrack, contextQueue } = get();
        const updated = (userQueue || []).filter(item => item.queueId !== queueId);
        set({
          userQueue: updated,
          queue: computeTotalQueue(currentTrack, updated, contextQueue),
          originalQueue: computeTotalQueue(currentTrack, updated, contextQueue),
        });
      },

      playUserQueueItem: (queueId) => {
        try { audioEngine.resume(); } catch (e) {}
        const { userQueue, contextQueue, playHistory, currentTrack } = get();
        const target = (userQueue || []).find(u => u.queueId === queueId);
        if (!target) return;
        const remaining = (userQueue || []).filter(u => u.queueId !== queueId);
        const updatedHistory = currentTrack ? [...playHistory, currentTrack].slice(-50) : playHistory;
        set({
          currentTrack: target.track,
          isPlaying: true,
          userQueue: remaining,
          playHistory: updatedHistory,
          repeatCounter: 0,
          currentTime: 0,
          duration: target.track.duration || 0,
          queue: computeTotalQueue(target.track, remaining, contextQueue),
          originalQueue: computeTotalQueue(target.track, remaining, contextQueue),
        });
      },

      reorderUserQueue: (startIndex, endIndex) => {
        const { userQueue, currentTrack, contextQueue } = get();
        const newQueue = [...(userQueue || [])];
        const [removed] = newQueue.splice(startIndex, 1);
        if (removed) {
          newQueue.splice(endIndex, 0, removed);
        }
        set({
          userQueue: newQueue,
          queue: computeTotalQueue(currentTrack, newQueue, contextQueue),
          originalQueue: computeTotalQueue(currentTrack, newQueue, contextQueue),
        });
      },

      reorderContextQueue: (startIndex, endIndex) => {
        const { contextQueue, currentTrack, userQueue } = get();
        const newQueue = [...(contextQueue || [])];
        const [removed] = newQueue.splice(startIndex, 1);
        if (removed) {
          newQueue.splice(endIndex, 0, removed);
        }
        set({
          contextQueue: newQueue,
          queue: computeTotalQueue(currentTrack, userQueue, newQueue),
          originalQueue: computeTotalQueue(currentTrack, userQueue, newQueue),
        });
      },

      moveUserQueueItem: (index, direction) => {
        const { userQueue } = get();
        if (!userQueue || userQueue.length <= 1) return;
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= userQueue.length) return;
        get().reorderUserQueue(index, targetIndex);
      },

      moveContextQueueItem: (index, direction) => {
        const { contextQueue } = get();
        if (!contextQueue || contextQueue.length <= 1) return;
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= contextQueue.length) return;
        get().reorderContextQueue(index, targetIndex);
      },

      moveUserQueueToTop: (index) => {
        const { userQueue } = get();
        if (!userQueue || userQueue.length <= 1 || index === 0) return;
        get().reorderUserQueue(index, 0);
      },

      moveUserQueueToBottom: (index) => {
        const { userQueue } = get();
        if (!userQueue || userQueue.length <= 1 || index === userQueue.length - 1) return;
        get().reorderUserQueue(index, userQueue.length - 1);
      },

      moveContextQueueToTop: (index) => {
        const { contextQueue } = get();
        if (!contextQueue || contextQueue.length <= 1 || index === 0) return;
        get().reorderContextQueue(index, 0);
      },

      moveContextQueueToBottom: (index) => {
        const { contextQueue } = get();
        if (!contextQueue || contextQueue.length <= 1 || index === contextQueue.length - 1) return;
        get().reorderContextQueue(index, contextQueue.length - 1);
      },

      promoteContextTrackToNext: (trackId) => {
        const { contextQueue, userQueue, currentTrack } = get();
        const target = (contextQueue || []).find(t => t.id === trackId);
        if (!target) return;
        const remainingContext = (contextQueue || []).filter(t => t.id !== trackId);
        const newItem: UserQueueItem = {
          queueId: `${target.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          track: target
        };
        const updatedUserQueue = [newItem, ...(userQueue || [])];
        set({
          userQueue: updatedUserQueue,
          contextQueue: remainingContext,
          queue: computeTotalQueue(currentTrack, updatedUserQueue, remainingContext),
          originalQueue: computeTotalQueue(currentTrack, updatedUserQueue, remainingContext),
        });
      },

      clearUserQueue: () => {
        const { currentTrack, contextQueue } = get();
        set({
          userQueue: [],
          queue: computeTotalQueue(currentTrack, [], contextQueue),
          originalQueue: computeTotalQueue(currentTrack, [], contextQueue),
        });
      },

      removeFromContextQueue: (trackId) => {
        const { contextQueue, currentTrack, userQueue } = get();
        const updated = (contextQueue || []).filter(t => t.id !== trackId);
        set({
          contextQueue: updated,
          queue: computeTotalQueue(currentTrack, userQueue, updated),
          originalQueue: computeTotalQueue(currentTrack, userQueue, updated),
        });
      },

      // Backwards-compatible queue methods
      addToQueue: (track) => {
        get().addToUserQueue(track);
      },

      setQueue: (tracks) => {
        if (!tracks || tracks.length === 0) return;
        get().setTrack(tracks[0], tracks);
      },

      playNextTrack: (track) => {
        const { userQueue, currentTrack, contextQueue } = get();
        const newItem: UserQueueItem = {
          queueId: `${track.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          track
        };
        const updated = [newItem, ...(userQueue || [])];
        set({
          userQueue: updated,
          queue: computeTotalQueue(currentTrack, updated, contextQueue),
          originalQueue: computeTotalQueue(currentTrack, updated, contextQueue),
        });
      },

      removeFromQueue: (trackIdOrQueueId) => {
        const { userQueue, contextQueue, currentTrack } = get();
        const inUser = (userQueue || []).some(u => u.queueId === trackIdOrQueueId || u.track.id === trackIdOrQueueId);
        if (inUser) {
          const updatedUser = userQueue.filter(u => u.queueId !== trackIdOrQueueId && u.track.id !== trackIdOrQueueId);
          set({
            userQueue: updatedUser,
            queue: computeTotalQueue(currentTrack, updatedUser, contextQueue)
          });
          return;
        }

        const inContext = (contextQueue || []).some(t => t.id === trackIdOrQueueId);
        if (inContext) {
          const updatedContext = contextQueue.filter(t => t.id !== trackIdOrQueueId);
          set({
            contextQueue: updatedContext,
            queue: computeTotalQueue(currentTrack, userQueue, updatedContext)
          });
          return;
        }

        // If removing the currently playing item
        if (currentTrack?.id === trackIdOrQueueId) {
          get().playNext(true);
        }
      },

      reorderQueue: (startIndex, endIndex) => {
        get().reorderUserQueue(startIndex, endIndex);
      },

      clearQueue: () => {
        get().clearUserQueue();
      },

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
        const { currentTrack, userQueue, contextQueue, contextOriginalQueue, repeatMode, repeatCounter, playHistory } = get();
        if (!currentTrack) return;

        // 1. Repeat mode "one": repeats the current song (unless user has manually queued songs in userQueue)
        if (!force && (!userQueue || userQueue.length === 0)) {
          if (repeatMode === "one") {
            const audio = audioEngine.getActiveAudioElement();
            if (audio) {
              audio.currentTime = 0;
              audio.play().catch(err => {
                if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
              });
              set({ currentTime: 0 });
            }
            return;
          }

          if (repeatMode === "two") {
            if (repeatCounter < 1) {
              const audio = audioEngine.getActiveAudioElement();
              if (audio) {
                audio.currentTime = 0;
                audio.play().catch(err => {
                  if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
                });
                set({ currentTime: 0, repeatCounter: repeatCounter + 1 });
              }
              return;
            }
          }
        }

        const updatedHistory = [...playHistory, currentTrack].slice(-50);

        // 2. User Queue order: User Queue plays first! Played User Queue items are removed.
        if (userQueue && userQueue.length > 0) {
          const [nextItem, ...remainingUserQueue] = userQueue;
          const nextTrack = nextItem?.track || (nextItem as any);
          if (!nextTrack || !nextTrack.id) {
            set({ userQueue: remainingUserQueue });
            get().playNext(force);
            return;
          }
          set({
            currentTrack: nextTrack,
            isPlaying: true,
            userQueue: remainingUserQueue,
            playHistory: updatedHistory,
            repeatCounter: 0,
            currentTime: 0,
            duration: nextTrack.duration || 0,
            queue: computeTotalQueue(nextTrack, remainingUserQueue, contextQueue),
            originalQueue: computeTotalQueue(nextTrack, remainingUserQueue, contextQueue),
          });
          return;
        }

        // 3. User Queue empty: Next takes from Context
        if (contextQueue && contextQueue.length > 0) {
          const [nextContextTrack, ...remainingContext] = contextQueue;
          set({
            currentTrack: nextContextTrack,
            isPlaying: true,
            contextQueue: remainingContext,
            playHistory: updatedHistory,
            repeatCounter: 0,
            currentTime: 0,
            duration: nextContextTrack.duration || 0,
            queue: computeTotalQueue(nextContextTrack, [], remainingContext),
            originalQueue: computeTotalQueue(nextContextTrack, [], remainingContext),
          });
          return;
        }

        // 4. Repeat mode "all": loops the Context. User Queue items are played once and removed.
        if (repeatMode === "all" && contextOriginalQueue && contextOriginalQueue.length > 0) {
          const [firstTrack, ...remainingContext] = contextOriginalQueue;
          set({
            currentTrack: firstTrack,
            isPlaying: true,
            contextQueue: remainingContext,
            playHistory: updatedHistory,
            repeatCounter: 0,
            currentTime: 0,
            duration: firstTrack.duration || 0,
            queue: computeTotalQueue(firstTrack, [], remainingContext),
            originalQueue: computeTotalQueue(firstTrack, [], remainingContext),
          });
          return;
        }

        // 5. End of queue: Autoplay fallback or stop playback
        let isAutoplay = true;
        try {
          if (typeof window !== "undefined") {
            const localPref = localStorage.getItem("zenify_autoplay");
            if (localPref !== null) isAutoplay = localPref === "true";
          }
        } catch {}

        if (isAutoplay && currentTrack) {
          (async () => {
            try {
              const api = (await import("@/lib/api")).default;
              const vibeParams = extractTrackVibeParams(currentTrack, 30);
              const playedIds = new Set([currentTrack.id, ...(updatedHistory || []).map(t => t.id)]);
              const excludeIdsStr = Array.from(playedIds).slice(-40).join(',');

              const radioRes = await api.get('/queue/radio', {
                params: {
                  ...vibeParams,
                  excludeIds: excludeIdsStr
                }
              });
              const fetchedTracks: Track[] = radioRes.data?.tracks || [];
              if (fetchedTracks.length > 0) {
                // Strictly exclude any song that was already played!
                const fresh = fetchedTracks.filter((t: Track) => !playedIds.has(t.id));
                const candidates = fresh.length > 0 ? fresh : fetchedTracks.filter((t: Track) => t.id !== currentTrack.id);
                if (candidates.length > 0) {
                  const [nextTrack, ...restFresh] = candidates;
                  const langTitle = vibeParams.language ? (vibeParams.language.charAt(0).toUpperCase() + vibeParams.language.slice(1)) : 'Recommended';
                  set({
                    currentTrack: nextTrack,
                    isPlaying: true,
                    contextQueue: restFresh,
                    contextOriginalQueue: restFresh,
                    contextName: `${langTitle} Radio`,
                    repeatCounter: 0,
                    currentTime: 0,
                    duration: nextTrack.duration || 0,
                    queue: computeTotalQueue(nextTrack, [], restFresh),
                    originalQueue: computeTotalQueue(nextTrack, [], restFresh),
                  });
                  return;
                }
              }
            } catch (err) {
              console.warn("[Autoplay] Failed to fetch autoplay queue:", err);
            }
            set({ isPlaying: false, currentTime: 0 });
            const audio = audioEngine.getActiveAudioElement();
            if (audio) audio.pause();
          })();
          return;
        }

        set({ isPlaying: false, currentTime: 0 });
        const audio = audioEngine.getActiveAudioElement();
        if (audio) audio.pause();
      },

      playPrev: () => {
        try { audioEngine.resume(); } catch (e) {}
        const { currentTrack, playHistory, currentTime, userQueue, contextQueue } = get();
        if (!currentTrack) return;

        const audio = audioEngine.getActiveAudioElement();
        // Previous rule: restarts current song if it has played for more than a few seconds (3s threshold)
        if (currentTime > 3 || (audio && audio.currentTime > 3)) {
          if (audio) audio.currentTime = 0;
          set({ currentTime: 0 });
          return;
        }

        // Previous rule: goes back through play history
        if (playHistory && playHistory.length > 0) {
          const newHistory = [...playHistory];
          const prevTrack = newHistory.pop()!;
          const updatedContext = [currentTrack, ...(contextQueue || [])];
          set({
            currentTrack: prevTrack,
            isPlaying: true,
            playHistory: newHistory,
            contextQueue: updatedContext,
            repeatCounter: 0,
            currentTime: 0,
            duration: prevTrack.duration || 0,
            queue: computeTotalQueue(prevTrack, userQueue, updatedContext),
            originalQueue: computeTotalQueue(prevTrack, userQueue, updatedContext),
          });
          return;
        }

        // Fallback: restart current song
        if (audio) audio.currentTime = 0;
        set({ currentTime: 0 });
      },

      toggleShuffle: () => {
        const { isShuffled, contextQueue, contextOriginalQueue, userQueue, currentTrack } = get();
        if (isShuffled) {
          // Turn Shuffle OFF: restore context to original sequence
          const remainingSet = new Set((contextQueue || []).map(t => t.id));
          const unShuffledContext = (contextOriginalQueue || []).filter(t => remainingSet.has(t.id));
          set({
            isShuffled: false,
            contextQueue: unShuffledContext,
            queue: computeTotalQueue(currentTrack, userQueue, unShuffledContext),
          });
        } else {
          // Turn Shuffle ON: Shuffles the Context only. User Queue order is NEVER changed.
          const shuffledContext = [...(contextQueue || [])];
          for (let i = shuffledContext.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledContext[i], shuffledContext[j]] = [shuffledContext[j], shuffledContext[i]];
          }
          set({
            isShuffled: true,
            contextQueue: shuffledContext,
            queue: computeTotalQueue(currentTrack, userQueue, shuffledContext),
          });
        }
      },

      toggleRepeat: () =>
        set((state) => {
          const modes: ("off" | "all" | "one")[] = ["off", "all", "one"];
          const nextIndex = (modes.indexOf(state.repeatMode as any) + 1) % modes.length;
          return { repeatMode: modes[nextIndex], repeatCounter: 0 };
        }),

      setVolume: (volume) => set({ volume }),
      setCurrentTime: (currentTime) => set({ currentTime }),
      setDuration: (duration) => set({ duration }),

      setFx: (fx) =>
        set((state) => ({
          audioFx: { ...state.audioFx, ...fx },
        })),

      setLyricsOffset: (offset) =>
        set((state) => {
          if (state.currentTrack) {
            return {
              currentTrack: { ...state.currentTrack, lyricsOffset: offset }
            };
          }
          return state;
        }),

      updateCurrentTrackData: (partial) =>
        set((state) => {
          if (!state.currentTrack) return state;
          if (partial.id && state.currentTrack.id !== partial.id) return state;
          const updated = { ...state.currentTrack, ...partial };
          const updateInList = (list: Track[]) =>
            list.map((t) => (t.id === updated.id ? { ...t, ...partial } : t));
          const updatedUserQueue = (state.userQueue || []).map(item =>
            item.track.id === updated.id ? { ...item, track: { ...item.track, ...partial } } : item
          );
          const updatedContextQueue = updateInList(state.contextQueue || []);

          return {
            currentTrack: updated,
            userQueue: updatedUserQueue,
            contextQueue: updatedContextQueue,
            queue: computeTotalQueue(updated, updatedUserQueue, updatedContextQueue),
            originalQueue: updateInList(state.originalQueue || []),
          };
        }),
    }),
    {
      name: "player-storage",
      version: 7,
      merge: (persisted, current) => {
        const p = (persisted as Partial<PlayerState>) || {};
        return {
          ...current,
          ...p,
          audioFx: { ...DEFAULT_AUDIO_FX, ...(p.audioFx || {}) },
        };
      },
      partialize: (state) => ({
        volume: state.volume,
        repeatMode: state.repeatMode,
        isShuffled: state.isShuffled,
        currentTrack: state.currentTrack,
        userQueue: state.userQueue,
        contextQueue: state.contextQueue,
        contextOriginalQueue: state.contextOriginalQueue,
        contextName: state.contextName,
        playHistory: state.playHistory,
        audioFx: state.audioFx,
      }),
    }
  )
);
