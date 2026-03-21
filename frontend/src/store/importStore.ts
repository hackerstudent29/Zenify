import { create } from 'zustand';
import api from '@/lib/api';

interface ImportProgress {
    current: number;
    total: number;
    activeTrack: string;
    successCount: number;
    failCount: number;
}

interface ImportState {
    isBatchImporting: boolean;
    batchProgress: ImportProgress;
    startBatchImport: (collection: any, tracksToImport: any[], overrides?: Record<number, { previewUrl?: string | null; customUrl?: string }>, opts?: { albumTitle?: string; artistName?: string; genre?: string; copyrightLabel?: string }) => Promise<{
        success: number,
        fail: number,
        total: number,
        successTitles: string[],
        failTitles: string[]
    }>;
    resetImportState: () => void;
}

export const useImportStore = create<ImportState>((set, get) => ({
    isBatchImporting: false,
    batchProgress: { current: 0, total: 0, activeTrack: "", successCount: 0, failCount: 0 },
    resetImportState: () => set({ isBatchImporting: false, batchProgress: { current: 0, total: 0, activeTrack: "", successCount: 0, failCount: 0 } }),
    startBatchImport: async (collection: any, tracksToImport: any[], overrides = {}, opts = {}) => {
        if (get().isBatchImporting) return { success: 0, fail: 0, total: 0, successTitles: [], failTitles: [] };

        set({
            isBatchImporting: true,
            batchProgress: { current: 0, total: tracksToImport.length, activeTrack: "", successCount: 0, failCount: 0 }
        });

        const successTitles: string[] = [];
        const failTitles: string[] = [];
        const albumTitle = opts.albumTitle || collection.title;
        const artistName = opts.artistName || collection.artist;
        const genre = opts.genre || collection.genre || "Cinema";
        const copyrightLabel = opts.copyrightLabel || "Zenify";

        try {
            for (let i = 0; i < tracksToImport.length; i++) {
                if (!get().isBatchImporting) break;

                const track = tracksToImport[i];
                const realIndex = collection.tracks.indexOf(track);
                const currentTitle = track.isPlaceholder ? `Track ${realIndex + 1}` : track.title;
                const override = overrides[realIndex] || {};

                set((state) => ({
                    batchProgress: { ...state.batchProgress, current: i + 1, activeTrack: currentTitle }
                }));

                try {
                    // Use already-fetched previewUrl if available
                    let audioUrl = override.previewUrl || null;
                    let lyrics = track.lyrics || null;

                    if (!audioUrl) {
                        // Use custom URL if provided, else search by name
                        const linkToUse = override.customUrl?.trim();
                        const query = linkToUse || (
                            track.isPlaceholder
                                ? `${artistName} ${albumTitle} track ${realIndex + 1}`
                                : `${track.artist || artistName} - ${track.title}`
                        );
                        const mode = linkToUse ? '' : '&mode=search';
                        const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(query)}&fetchAudio=true${mode}`);
                        audioUrl = res.data?.audioUrl || null;
                        if (res.data?.lyrics) lyrics = res.data.lyrics;
                    }

                    if (audioUrl) {
                        await api.post('/tracks/import-external', {
                            title: currentTitle,
                            artistName: track.artist || artistName,
                            genre,
                            coverUrl: collection.cover,
                            audioUrl,
                            albumTitle,
                            copyrightLabel,
                            trackNumber: track.trackNumber || realIndex + 1,
                            duration: track.duration || undefined,
                            lyrics: lyrics || undefined,
                        });
                        successTitles.push(currentTitle);
                        set((state) => ({
                            batchProgress: { ...state.batchProgress, successCount: successTitles.length }
                        }));
                    } else {
                        throw new Error("No audio source found");
                    }
                } catch (err) {
                    console.error(`Failed to import ${currentTitle}:`, err);
                    failTitles.push(currentTitle);
                    set((state) => ({
                        batchProgress: { ...state.batchProgress, failCount: failTitles.length }
                    }));
                }
            }
        } catch (e) {
            console.error("Batch import unexpected error:", e);
        } finally {
            setTimeout(() => {
                set({ isBatchImporting: false });
            }, 500);
        }

        return {
            success: successTitles.length,
            fail: failTitles.length,
            total: tracksToImport.length,
            successTitles,
            failTitles
        };
    }
}));
