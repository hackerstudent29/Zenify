import { Vibrant } from 'node-vibrant/node';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import { Prisma } from '@prisma/client';

export interface RawColor {
    r: number;
    g: number;
    b: number;
}

/** Parse "#RRGGBB" or "#RGB" hex string into {r,g,b} */
function hexToRgb(hex: string): RawColor {
    const h = hex.replace('#', '');
    if (h.length === 3) {
        const r = parseInt(h[0] + h[0], 16);
        const g = parseInt(h[1] + h[1], 16);
        const b = parseInt(h[2] + h[2], 16);
        return { r, g, b };
    }
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

/**
 * PaletteService
 * ─ Extracts 4 dominant colors from cover art using node-vibrant.
 * ─ Saves result to the `palette` Json field on Track / Album.
 * ─ Provides a backfill job for existing songs.
 */
export class PaletteService {

    /** Extract 4 colors from an image path or URL using node-vibrant */
    static async extractColors(imageUrl: string): Promise<RawColor[] | null> {
        if (!imageUrl) return null;
        try {
            let buffer: Buffer;
            if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
                // Local relative path (e.g. /public/... or uploads/...)
                const cleanPath = imageUrl.replace(/^\/+/, '');
                const localPath = path.resolve(__dirname, '../../', cleanPath);
                if (fs.existsSync(localPath)) {
                    buffer = fs.readFileSync(localPath);
                } else {
                    // Fallback: download from backend origin
                    const API_BASE = process.env.NEXT_PUBLIC_API_URL
                        || process.env.VITE_API_URL
                        || 'https://zenify-production-08b4.up.railway.app/api';
                    const baseOrigin = API_BASE.replace(/\/api$/, '');
                    const fullUrl = `${baseOrigin}/${cleanPath}`;
                    const res = await axios.get(fullUrl, { responseType: 'arraybuffer', timeout: 10000 });
                    buffer = Buffer.from(res.data);
                }
            } else {
                // Absolute HTTP URL
                const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
                buffer = Buffer.from(res.data);
            }

            const vibrant = new Vibrant(buffer);
            const palette = await vibrant.getPalette();

            const swatches = [
                palette.Vibrant,
                palette.DarkVibrant,
                palette.LightVibrant,
                palette.Muted,
                palette.DarkMuted,
                palette.LightMuted
            ].filter(Boolean);

            if (swatches.length === 0) return null;

            const colors = swatches.map(s => ({ r: s!.r, g: s!.g, b: s!.b }));

            // Ensure exactly 4 entries
            while (colors.length < 4) {
                colors.push(colors[colors.length - 1]);
            }
            return colors.slice(0, 4);
        } catch (e: any) {
            console.warn(`[PaletteService] extractColors failed for ${imageUrl}: ${e.message}`);
            return null;
        }
    }

    /** Extract + save palette for a single track. Returns the colors or null. */
    static async extractAndSaveTrack(trackId: string, coverUrl: string): Promise<RawColor[] | null> {
        // Skip if already saved
        const existing = await prisma.track.findUnique({
            where: { id: trackId },
            select: { palette: true, albumId: true }
        });
        
        let colors: RawColor[] | null = null;
        if (existing?.palette) {
            colors = existing.palette as unknown as RawColor[];
        } else {
            colors = await this.extractColors(coverUrl);
            if (colors) {
                await prisma.track.update({
                    where: { id: trackId },
                    data: { palette: colors as any }
                });
                console.log(`[PaletteService] ✅ Saved palette for track ${trackId}: ${JSON.stringify(colors)}`);
            }
        }

        // Auto-propagate palette to parent album if the album has no palette yet
        if (colors && existing?.albumId) {
            const album = await prisma.album.findUnique({
                where: { id: existing.albumId },
                select: { palette: true }
            });
            if (album && !album.palette) {
                await prisma.album.update({
                    where: { id: existing.albumId },
                    data: { palette: colors as any }
                });
                console.log(`[PaletteService] ✅ Propagated track palette to parent album ${existing.albumId}`);
            }
        }

        return colors;
    }

    /** Extract + save palette for a single album. Returns the colors or null. */
    static async extractAndSaveAlbum(albumId: string, coverUrl: string): Promise<RawColor[] | null> {
        // Skip if already saved
        const existing = await prisma.album.findUnique({
            where: { id: albumId },
            select: { palette: true }
        });
        if (existing?.palette) return existing.palette as unknown as RawColor[];

        const colors = await this.extractColors(coverUrl);
        if (colors) {
            await prisma.album.update({
                where: { id: albumId },
                data: { palette: colors as any }
            });
            console.log(`[PaletteService] ✅ Saved palette for album ${albumId}: ${JSON.stringify(colors)}`);
        }
        return colors;
    }

    /**
     * Backfill job: process all tracks/albums that don't have a palette yet.
     * Runs in the background; limit controls how many to process per call.
     */
    static async backfillAll(limit = 50): Promise<{ tracks: number; albums: number }> {
        console.log('[PaletteService] 🚀 Starting palette backfill...');
        let tracksDone = 0, albumsDone = 0;

        const allTracks = await prisma.track.findMany({
            where: { coverUrl: { not: null } },
            select: { id: true, coverUrl: true, palette: true },
        });
        const tracks = allTracks.filter(t => !t.palette).slice(0, limit);

        for (const t of tracks) {
            if (!t.coverUrl) continue;
            try {
                const ok = await this.extractAndSaveTrack(t.id, t.coverUrl);
                if (ok) tracksDone++;
            } catch (e: any) {
                console.warn(`[PaletteService] Track ${t.id} failed: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        const allAlbums = await prisma.album.findMany({
            where: { coverUrl: { not: null } },
            select: { id: true, coverUrl: true, palette: true },
        });
        const albums = allAlbums.filter(a => !a.palette).slice(0, limit);

        for (const a of albums) {
            if (!a.coverUrl) continue;
            try {
                const ok = await this.extractAndSaveAlbum(a.id, a.coverUrl);
                if (ok) albumsDone++;
            } catch (e: any) {
                console.warn(`[PaletteService] Album ${a.id} failed: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        console.log(`[PaletteService] ✅ Backfill complete. Tracks: ${tracksDone}, Albums: ${albumsDone}`);
        return { tracks: tracksDone, albums: albumsDone };
    }

    /**
     * Count how many tracks/albums still need palette extraction
     */
    static async getPendingCount(): Promise<{ tracks: number; albums: number }> {
        const [allTracks, allAlbums] = await Promise.all([
            prisma.track.findMany({ where: { coverUrl: { not: null } }, select: { palette: true } }),
            prisma.album.findMany({ where: { coverUrl: { not: null } }, select: { palette: true } }),
        ]);
        
        const pendingTracks = allTracks.filter(t => !t.palette).length;
        const pendingAlbums = allAlbums.filter(a => !a.palette).length;
        
        return { tracks: pendingTracks, albums: pendingAlbums };
    }
}
