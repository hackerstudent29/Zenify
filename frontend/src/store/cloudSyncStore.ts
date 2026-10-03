import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '@/lib/api';
import { LocalAudioMetadata, saveTrackToCloudDB, enrichLocalTrackWithCatalog, saveLocalLibrary, getSavedLocalTracks } from '@/services/localLibraryStore';

export interface SyncJobItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  audioUrl?: string;
  duration?: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
}

interface CloudSyncState {
  isSyncing: boolean;
  isMinimized: boolean;
  currentSongTitle: string;
  totalCount: number;
  syncedCount: number;
  remainingCount: number;
  failedCount: number;
  items: SyncJobItem[];
  
  // Actions
  toggleMinimize: () => void;
  dismissPopup: () => void;
  startCloudSync: (tracksToSync: LocalAudioMetadata[]) => Promise<void>;
  checkAndUpdateSyncProgress: () => Promise<void>;
}

export const useCloudSyncStore = create<CloudSyncState>()(
  persist(
    (set, get) => ({
      isSyncing: false,
      isMinimized: false,
      currentSongTitle: '',
      totalCount: 0,
      syncedCount: 0,
      remainingCount: 0,
      failedCount: 0,
      items: [],

      toggleMinimize: () => set((state) => ({ isMinimized: !state.isMinimized })),

      dismissPopup: () =>
        set({
          isSyncing: false,
          totalCount: 0,
          syncedCount: 0,
          remainingCount: 0,
          failedCount: 0,
          items: [],
          currentSongTitle: '',
        }),

      startCloudSync: async (tracksToSync: LocalAudioMetadata[]) => {
        if (!tracksToSync || tracksToSync.length === 0) return;

        const jobItems: SyncJobItem[] = tracksToSync.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.matchedArtistName || t.artist || 'Unknown Artist',
          album: t.matchedAlbumName || t.album,
          coverUrl: t.matchedCoverUrl || t.coverUrl,
          audioUrl: t.audioUrl,
          duration: t.duration,
          status: t.isSavedToCloud && t.isMatched ? 'synced' : 'pending',
        }));

        const initialSynced = jobItems.filter((i) => i.status === 'synced').length;
        const initialPending = jobItems.length - initialSynced;

        set({
          isSyncing: true,
          isMinimized: false,
          totalCount: jobItems.length,
          syncedCount: initialSynced,
          remainingCount: initialPending,
          failedCount: 0,
          items: jobItems,
          currentSongTitle: jobItems.find((i) => i.status === 'pending')?.title || 'Starting sync...',
        });

        // Send batch payload to backend for background server-side processing
        // This ensures backend processes tracks even if the tab/browser is closed!
        const batchPayload = tracksToSync.map((t) => ({
          title: t.title,
          artistName: t.matchedArtistName || t.artist,
          albumTitle: t.matchedAlbumName || t.album,
          coverUrl: t.matchedCoverUrl || t.coverUrl,
          duration: t.duration ? Math.round(t.duration) : undefined,
          audioUrl: t.audioUrl && t.audioUrl.startsWith('http') ? t.audioUrl : undefined,
          importedBy: t.importedBy || 'Zenify User',
          importedAt: t.importedAt || new Date().toISOString(),
        }));

        api.post('/tracks/import-batch', { tracks: batchPayload }).catch((err) => {
          console.warn('[CloudSync] Background batch API post failed:', err);
        });

        // Process client-side worker items sequentially/concurrently
        let completed = initialSynced;
        let failed = 0;

        for (let i = 0; i < tracksToSync.length; i++) {
          const track = tracksToSync[i];
          if (track.isSavedToCloud && track.cloudTrackId && track.isMatched) {
            continue;
          }

          set({ currentSongTitle: `Syncing "${track.title}"...` });

          // Update item status in store
          set((state) => ({
            items: state.items.map((item) =>
              item.id === track.id ? { ...item, status: 'syncing' } : item
            ),
          }));

          try {
            const enriched = await enrichLocalTrackWithCatalog(track);
            const savedCloudTrack = await saveTrackToCloudDB(enriched);

            completed++;
            const remaining = jobItems.length - completed - failed;

            set((state) => ({
              syncedCount: completed,
              remainingCount: Math.max(0, remaining),
              items: state.items.map((item) =>
                item.id === track.id ? { ...item, status: 'synced' } : item
              ),
            }));

            // Persist updated track to IndexedDB
            const savedTracks = await getSavedLocalTracks();
            const updatedTracks = savedTracks.map((t: any) =>
              t.id === track.id ? savedCloudTrack : t
            );
            await saveLocalLibrary(updatedTracks);
          } catch (err) {
            console.error(`[CloudSync] Failed sync for "${track.title}":`, err);
            failed++;
            const remaining = jobItems.length - completed - failed;

            set((state) => ({
              failedCount: failed,
              remainingCount: Math.max(0, remaining),
              items: state.items.map((item) =>
                item.id === track.id ? { ...item, status: 'failed' } : item
              ),
            }));
          }
        }

        set({
          isSyncing: false,
          currentSongTitle: 'All songs synced to Cloud DB!',
          remainingCount: 0,
        });
      },

      checkAndUpdateSyncProgress: async () => {
        // Poll saved local tracks to verify sync completion upon page revisit
        try {
          const savedTracks = await getSavedLocalTracks();
          const state = get();
          if (state.totalCount > 0 && state.items.length > 0) {
            const trackMap = new Map(savedTracks.map((t: any) => [t.id, t]));
            let synced = 0;
            let pending = 0;

            state.items.forEach((item) => {
              const matched = trackMap.get(item.id);
              if (matched && (matched.isSavedToCloud || matched.isMatched)) {
                synced++;
              } else {
                pending++;
              }
            });

            set({
              syncedCount: Math.max(state.syncedCount, synced),
              remainingCount: pending,
              isSyncing: pending > 0,
            });
          }
        } catch (e) {
          console.warn('[CloudSync] Check progress error:', e);
        }
      },
    }),
    {
      name: 'zenify_cloud_sync_store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
