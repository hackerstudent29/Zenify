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
 aura_color?: string;
 aura_vibe?: string;
 analysisData?: any;
 palette?: Array<{r: number; g: number; b: number}>;
 isVirtual?: boolean;
 isYoutube?: boolean;
 youtubeId?: string;
 isRapid?: boolean;
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
 speed8D: number;
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
 setLyricsOffset: (offset: number) => void;
  updateCurrentTrackData: (partial: Partial<Track>) => void;
}

function extractTrackVibeParams(track: Track, limit = 25) {
  const trackMood = track.aura_vibe || (track as any).mood || (track as any).vibeProfile?.aura_vibe || (track as any).analysisData?.mood || '';
  const trackMovie = (typeof track.album === 'string' ? track.album : track.album?.title) || (track as any).albumTitle || (track as any).movie || '';
  const trackArtist = track.artist?.name || (track as any).artistName || '';
  const trackLang = (track as any).language || (track as any).vibeProfile?.language || '';
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
 speed8D: 0.15,
 speed: 1,
 pitch: 1,
 crossfade: 5,
 },

 setTrack: (track, contextTracks) => {
  try { audioEngine.resume(); } catch (e) {}
  const { isShuffled, queue, originalQueue } = get();
  
  let baseQueue = contextTracks && contextTracks.length > 0
  ? contextTracks
  : queue.length > 0
  ? (isShuffled ? originalQueue : queue)
  : [track];

  // If we're falling back to existing queue but the track isn't in it, we must reset the queue to just this track
  if (!baseQueue.find((t) => t.id === track.id)) {
    baseQueue = [track];
  }

  let newQueue = [...baseQueue];
  if (isShuffled) {
  const others = baseQueue.filter((t) => t.id !== track.id);
  // Fisher-Yates shuffle
  for (let i = others.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [others[i], others[j]] = [others[j], others[i]];
  }
  newQueue = [track, ...others];
  } else {
  // If shuffle is off, rotate the queue so the clicked track is at index 0
  const index = baseQueue.findIndex(t => t.id === track.id);
  if (index !== -1) {
    newQueue = [...baseQueue.slice(index), ...baseQueue.slice(0, index)];
  }
  }

 set({
 currentTrack: track,
 isPlaying: true,
 queue: newQueue,
 originalQueue: baseQueue,
 repeatCounter: 0,
 currentTime: 0,
 duration: track.duration || 0,
 });

 // Track play persistence: record to local recent plays (max 10) and notify real-time listeners
 try {
  if (typeof window !== 'undefined' && track && track.id) {
   const RAW = localStorage.getItem('zenify_recently_played_tracks');
   const list = RAW ? JSON.parse(RAW) : [];
   const filtered = Array.isArray(list) ? list.filter((t: any) => t && t.id !== track.id) : [];
   const updated = [track, ...filtered].slice(0, 10);
   localStorage.setItem('zenify_recently_played_tracks', JSON.stringify(updated));
   window.dispatchEvent(new CustomEvent('zenify:track-played', { detail: { track } }));
   window.dispatchEvent(new CustomEvent('zenify:track-updated'));
  }
 } catch (e) {}

 // Autoplay enrichment: proactively fetch contextual radio queue by language, genre, country, and artist
 if (!contextTracks || contextTracks.length <= 3) {
   (async () => {
     try {
       const api = (await import("@/lib/api")).default;
       const radioRes = await api.get('/queue/radio', {
          params: extractTrackVibeParams(track, 25)
        });
       if (radioRes.data?.tracks?.length) {
         const fresh = radioRes.data.tracks.filter((t: Track) => t.id !== track.id);
         const state = usePlayerStore.getState();
         if (state.currentTrack?.id === track.id) {
           const curQ = state.queue;
           const toAdd = fresh.filter((t: Track) => !curQ.some(q => q.id === t.id));
           if (toAdd.length > 0) {
             set(s => ({
               queue: [...s.queue, ...toAdd],
               originalQueue: [...s.originalQueue, ...toAdd]
             }));
           }
         }
       }
     } catch (err) {
       console.warn("[Autoplay] Proactive queue population failed:", err);
     }
   })();
 }
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
  const { currentTrack, queue, originalQueue } = state;
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
  newQueue.splice(currentIndex + 1, 0, track);
  
  const origIndex = originalQueue.findIndex(t => t.id === currentTrack.id);
  const newOrigQueue = [...originalQueue];
  if (origIndex !== -1) {
    newOrigQueue.splice(origIndex + 1, 0, track);
  } else {
    newOrigQueue.push(track);
  }

  return {
  queue: newQueue,
  originalQueue: newOrigQueue
  };
  }),

 removeFromQueue: (trackId) =>
  set((state) => {
  const newQueue = state.queue.filter((t) => t.id !== trackId);
  const isRemovingCurrent = state.currentTrack?.id === trackId;

  if (isRemovingCurrent && newQueue.length > 0) {
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
     const audio = audioEngine.getActiveAudioElement();
     if (audio) {
       audio.currentTime = 0;
       audio.play().catch(err => {
         if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
         console.error("Repeat mode 'one' play failed:", err);
       });
       set({ currentTime: 0 });
     }
     return;
   }

   if (repeatMode === "two") {
     if (repeatCounter < 1) { // Current play is #1 (counter 0), so replay once more for total 2
       const audio = audioEngine.getActiveAudioElement();
       if (audio) {
         audio.currentTime = 0;
         audio.play().catch(err => {
           if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
           console.error("Repeat mode 'two' play failed:", err);
         });
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
  let isAutoplay = true;
  try {
   if (typeof window !== "undefined") {
    const localPref = localStorage.getItem("zenify_autoplay");
    if (localPref !== null) isAutoplay = localPref === "true";
   }
   const authStore = (window as any).__ZENIFY_AUTH_STORE__;
   if (authStore?.getState?.()?.user?.preferences?.autoplay !== undefined) {
    isAutoplay = authStore.getState().user.preferences.autoplay;
   }
  } catch {}

  if (isAutoplay) {
   (async () => {
    try {
     const api = (await import("@/lib/api")).default;
     let candidateTracks: Track[] = [];

     // 1. First priority: Contextual recommendations radio queue
     try {
       const radioRes = await api.get('/queue/radio', {
          params: extractTrackVibeParams(currentTrack, 25)
        });
       if (radioRes.data?.tracks?.length) {
         candidateTracks = radioRes.data.tracks;
       }
     } catch (radioErr) {
       console.warn("[Autoplay] Radio queue fallback:", radioErr);
     }

     // 2. Second fallback: Same artist tracks
     const artistId = (currentTrack as any).artistId || currentTrack.artist?.id;
     if (candidateTracks.length === 0 && artistId) {
      const res = await api.get(`/artists/${artistId}`);
      if (res.data?.tracks?.length) {
       candidateTracks = res.data.tracks;
      }
     }

     // 3. Third fallback: Trending tracks
     if (candidateTracks.length === 0) {
      const res = await api.get("/tracks/trending");
      if (Array.isArray(res.data)) {
       candidateTracks = res.data;
      }
     }

     const freshTracks = candidateTracks.filter(t => !queue.some(q => q.id === t.id));
     if (freshTracks.length > 0) {
      const nextTrack = freshTracks[0];
      set(state => ({
       queue: [...state.queue, ...freshTracks.slice(0, 10)],
       originalQueue: [...state.originalQueue, ...freshTracks.slice(0, 10)],
       currentTrack: nextTrack,
       isPlaying: true,
       currentTime: 0,
       repeatCounter: 0,
       duration: nextTrack.duration || 0,
      }));
      return;
     }
    } catch (err) {
     console.warn("[Keep Playing] Failed to fetch autoplay tracks:", err);
    }
    const firstTrack = queue[0];
    set({ currentTrack: firstTrack, isPlaying: true, repeatCounter: 0, currentTime: 0, duration: firstTrack.duration || 0 });
   })();
   return;
  }

  set({ isPlaying: false, currentTime: 0 });
  const audio = audioEngine.getActiveAudioElement();
  if (audio) audio.pause();
  return;
 }

 const nextIndex = (currentIndex + 1) % queue.length;
 const nextTrack = queue[nextIndex];
 set({ currentTrack: nextTrack, isPlaying: true, repeatCounter: 0, currentTime: 0, duration: nextTrack.duration || 0 });

 // Proactive background radio top-up when nearing the end of the queue (<= 5 tracks left)
 const remainingInQueue = queue.length - 1 - nextIndex;
 if (remainingInQueue <= 5 && repeatMode === "off") {
   let isAutoplay = true;
   try {
     if (typeof window !== "undefined") {
       const localPref = localStorage.getItem("zenify_autoplay");
       if (localPref !== null) isAutoplay = localPref === "true";
     }
     const authStore = (window as any).__ZENIFY_AUTH_STORE__;
     if (authStore?.getState?.()?.user?.preferences?.autoplay !== undefined) {
       isAutoplay = authStore.getState().user.preferences.autoplay;
     }
   } catch {}

   if (isAutoplay && nextTrack) {
     (async () => {
       try {
         const api = (await import("@/lib/api")).default;
         const radioRes = await api.get('/queue/radio', {
            params: extractTrackVibeParams(nextTrack, 15)
          });
         if (radioRes.data?.tracks?.length) {
           const currentQ = get().queue;
           const fresh = radioRes.data.tracks.filter((t: Track) => !currentQ.some(q => q.id === t.id));
           if (fresh.length > 0) {
             set(state => ({
               queue: [...state.queue, ...fresh],
               originalQueue: [...state.originalQueue, ...fresh]
             }));
           }
         }
       } catch (err) {}
     })();
   }
 }
 },

 playPrev: () => {
 try { audioEngine.resume(); } catch (e) {}
 const { currentTrack, queue } = get();
 if (!currentTrack || queue.length === 0) return;

 const audio = audioEngine.getActiveAudioElement();
 if (audio && audio.currentTime > 3) {
 audio.currentTime = 0;
 set({ currentTime: 0 });
 return;
 }

 const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
 const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
 const prevTrack = queue[prevIndex];
 set({ currentTrack: prevTrack, isPlaying: true, repeatCounter: 0, currentTime: 0, duration: prevTrack.duration || 0 });
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
      return {
          currentTrack: updated,
          queue: updateInList(state.queue),
          originalQueue: updateInList(state.originalQueue),
      };
  }),
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
