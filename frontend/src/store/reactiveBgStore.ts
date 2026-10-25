import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ReactiveBgSettings {
  fullPlayer: boolean;
  trackPage: boolean;
  albumPage: boolean;
  artistPage: boolean;
  other: boolean;
}

export interface ReactiveBgState {
  reactiveBg: ReactiveBgSettings;

  // Surface control actions
  setSurface: (surface: keyof ReactiveBgSettings, enabled: boolean) => void;
  toggleSurface: (surface: keyof ReactiveBgSettings) => void;

  // Backward-compatible properties
  track: boolean;
  album: boolean;
  playlist: boolean;
  player: boolean;
  lyrics: boolean;
  setReactiveBg: (page: 'track' | 'album' | 'playlist' | 'player' | 'lyrics', enabled: boolean) => void;
  toggleReactiveBg: (page: 'track' | 'album' | 'playlist' | 'player' | 'lyrics') => void;
}

const DEFAULT_SETTINGS: ReactiveBgSettings = {
  fullPlayer: true,
  trackPage: true,
  albumPage: true,
  artistPage: false,
  other: true,
};

export const useReactiveBgStore = create<ReactiveBgState>()(
  persist(
    (set, get) => ({
      reactiveBg: DEFAULT_SETTINGS,

      // Synced legacy flags
      track: true,
      album: true,
      playlist: true,
      player: true,
      lyrics: true,

      setSurface: (surface, enabled) => {
        set((state) => {
          const updated = { ...state.reactiveBg, [surface]: enabled };
          return {
            reactiveBg: updated,
            track: updated.trackPage,
            album: updated.albumPage,
            player: updated.fullPlayer,
            lyrics: updated.other,
            playlist: updated.albumPage,
          };
        });
      },

      toggleSurface: (surface) => {
        set((state) => {
          const updated = { ...state.reactiveBg, [surface]: !state.reactiveBg[surface] };
          return {
            reactiveBg: updated,
            track: updated.trackPage,
            album: updated.albumPage,
            player: updated.fullPlayer,
            lyrics: updated.other,
            playlist: updated.albumPage,
          };
        });
      },

      setReactiveBg: (page, enabled) => {
        const surfaceMap: Record<string, keyof ReactiveBgSettings> = {
          track: 'trackPage',
          album: 'albumPage',
          playlist: 'albumPage',
          player: 'fullPlayer',
          lyrics: 'other',
        };
        const surface = surfaceMap[page] || 'other';
        get().setSurface(surface, enabled);
      },

      toggleReactiveBg: (page) => {
        const surfaceMap: Record<string, keyof ReactiveBgSettings> = {
          track: 'trackPage',
          album: 'albumPage',
          playlist: 'albumPage',
          player: 'fullPlayer',
          lyrics: 'other',
        };
        const surface = surfaceMap[page] || 'other';
        get().toggleSurface(surface);
      },
    }),
    {
      name: 'zenify-reactive-bg-settings-v4',
      version: 4,
      migrate: (persisted: any) => {
        const bg = persisted?.reactiveBg || {
          fullPlayer: persisted?.player ?? true,
          trackPage: persisted?.track ?? true,
          albumPage: persisted?.album ?? true,
          artistPage: false,
          other: persisted?.lyrics ?? true,
        };
        return {
          reactiveBg: bg,
          track: bg.trackPage,
          album: bg.albumPage,
          playlist: bg.albumPage,
          player: bg.fullPlayer,
          lyrics: bg.other,
        };
      },
      storage: createJSONStorage(() => localStorage),
    }
  )
);
