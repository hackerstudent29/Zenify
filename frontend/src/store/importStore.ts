import { create } from 'zustand';
import api from '@/lib/api';

interface ImportProgress {
    current: number;
    total: number;
    activeTrack: string;
}

interface ImportState {
    isBatchImporting: boolean;
    batchProgress: ImportProgress;
    startBatchImport: (collection: any, tracksToImport: any[]) => Promise<void>;
    resetImportState: () => void;
}

export const useImportStore = create<ImportState>((set, get) => ({
    isBatchImporting: false,
    batchProgress: { current: 0, total: 0, activeTrack: "" },
    resetImportState: () => set({ isBatchImporting: false, batchProgress: { current: 0, total: 0, activeTrack: "" } }),
    startBatchImport: async (collection: any, tracksToImport: any[]) => {
        if (get().isBatchImporting) return;

        set({
            isBatchImporting: true,
            batchProgress: { current: 0, total: tracksToImport.length, activeTrack: "" }
        });

        try {
            for (let i = 0; i < tracksToImport.length; i++) {
                // If it was somehow cancelled or reset
                if (!get().isBatchImporting) break;

                const track = tracksToImport[i];
                const realIndex = collection.tracks.indexOf(track);

                set({
                    batchProgress: { current: i + 1, total: tracksToImport.length, activeTrack: track.title }
                });

                try {
                    const query = track.isPlaceholder ? `${collection.artist} ${collection.title} track ${realIndex + 1}` : `${track.artist || collection.artist} - ${track.title}`;
                    const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(query)}&fetchAudio=true&mode=search`);
                    const data = res.data;

                    if (data.audioUrl) {
                        await api.post('/tracks/import-external', {
                            title: track.isPlaceholder ? `Track ${realIndex + 1}` : track.title,
                            artistName: track.artist || collection.artist,
                            genre: collection.genre || "Electronic",
                            coverUrl: collection.cover,
                            audioUrl: data.audioUrl,
                            albumTitle: collection.title,
                            duration: track.duration || data.duration || undefined,
                        });
                    }
                } catch (err) {
                    console.error(`Failed to import ${track.title}:`, err);
                }
            }
        } catch (e) {
            console.error("Batch import unexpected error:", e);
        } finally {
            // Give the user a moment to see it hit 100%
            setTimeout(() => {
                set({ isBatchImporting: false });
            }, 3000);
        }
    }
}));
