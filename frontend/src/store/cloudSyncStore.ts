import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '@/lib/api';
import { LocalAudioMetadata } from '@/lib/id3Parser';
import { saveTrackToCloudDB, enrichLocalTrackWithCatalog, saveLocalLibrary, getSavedLocalTracks, runParallelWorkerPool } from '@/services/localLibraryStore';

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

        // Dynamic parallel worker pool for fast concurrent Cloud DB sync (1 worker for single song, 8 workers for batch)
        let completed = initialSynced;
        let failed = 0;
        const concurrency = tracksToSync.length === 1 ? 1 : Math.min(8, tracksToSync.length);

        await runParallelWorkerPool(
          tracksToSync,
          async (track) => {
            if (track.isSavedToCloud && track.cloudTrackId && track.isMatched) {
              return track;
            }

            set((state) => ({
              currentSongTitle: `Parallel syncing (${concurrency} workers): "${track.title}"...`,
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
              return savedCloudTrack;
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
              return track;
            }
          },
          concurrency,
          (completedCount, totalCount, active) => {
            set({
              currentSongTitle: `Parallel syncing (${active} workers active)...`,
            });
          }
        );

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
