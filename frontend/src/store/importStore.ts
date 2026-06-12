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
 startBatchImport: (collection: any, tracksToImport: any[], overrides?: Record<number, { previewUrl?: string | null; customUrl?: string; customImage?: string }>, opts?: { albumTitle?: string; artistName?: string; genre?: string; copyrightLabel?: string }) => Promise<{
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
 startBatchImport: async (collection: any, tracksToImport: any[], overrides: any = {}, opts: any = {}) => {
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
 const batchPayload = tracksToImport.map((track, i) => {
 const realIndex = collection.tracks.indexOf(track);
 const currentTitle = track.isPlaceholder ? `Track ${realIndex + 1}` : track.title;
 const override = overrides[realIndex] || {};

 return {
 title: currentTitle,
 artistName: track.artist || artistName,
 genre,
 coverUrl: override.customImage || track.cover || collection.cover,
 isBulk: tracksToImport.length > 1,
 audioUrl: override.previewUrl || null,
 customUrl: override.customUrl?.trim() || null,
 albumTitle,
 copyrightLabel,
 trackNumber: track.trackNumber || realIndex + 1,
 duration: track.duration || undefined,
 lyrics: track.lyrics || undefined
 };
 });

 await api.post('/tracks/import-batch', { tracks: batchPayload, opts });
 
 // Assume success for frontend display since it's backgrounded
 successTitles.push(...batchPayload.map(t => t.title));
 set((state) => ({
 batchProgress: { current: batchPayload.length, total: batchPayload.length, activeTrack: 'Sent to Background Task', successCount: batchPayload.length, failCount: 0 }
 }));
 } catch (e) {
 console.error("Batch import unexpected error:", e);
 } finally {
 setTimeout(() => {
 set({ isBatchImporting: false });
 }, 1000);
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
