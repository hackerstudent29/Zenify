import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ReactiveBgState {
  track: boolean;     // Default: OFF (false)
  album: boolean;     // Default: OFF (false)
  playlist: boolean;  // Default: OFF (false)
  player: boolean;    // Default: ON (true)
  lyrics: boolean;    // Default: OFF (false)

  setReactiveBg: (page: 'track' | 'album' | 'playlist' | 'player' | 'lyrics', enabled: boolean) => void;
  toggleReactiveBg: (page: 'track' | 'album' | 'playlist' | 'player' | 'lyrics') => void;
}

export const useReactiveBgStore = create<ReactiveBgState>()(
  persist(
    (set) => ({
      // Apple Music Fluid Artwork background defaults (ON across all musical experiences):
      track: true,
      album: true,
      playlist: true,
      player: true,
      lyrics: true,

      setReactiveBg: (page, enabled) => {
        set({ [page]: enabled });
      },

      toggleReactiveBg: (page) => {
        set((state) => ({ [page]: !state[page] }));
      },
    }),
    {
      name: 'zenify-reactive-bg-preferences',
      version: 3,
      migrate: (persistedState: any) => ({
        ...persistedState,
        track: true,
        album: true,
        playlist: true,
        player: true,
        lyrics: true,
      }),
      storage: createJSONStorage(() => localStorage),
    }
  )
);
