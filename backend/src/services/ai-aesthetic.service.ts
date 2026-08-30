import { prisma } from '../utils/prisma';
import { Vibrant } from 'node-vibrant/node';

export class AIAestheticService {
    /**
     * Analyzes the track's cover artwork using node-vibrant to extract dominant color.
     */
    static async syncTrackAesthetic(trackId: string): Promise<any> {
        const track = await prisma.track.findUnique({
            where: { id: trackId },
            include: { artist: true }
        });

        if (!track || !track.coverUrl) {
            console.warn(`[AIAesthetic] Track ${trackId} not found or has no cover URL`);
            return null;
        }

        // Resolve full cover URL
        let fullCoverUrl = track.coverUrl;
        if (!fullCoverUrl.startsWith('http')) {
            fullCoverUrl = `https://zenify-production-7f21.up.railway.app/uploads/${fullCoverUrl.replace(/^\/+/, '')}`;
        }

        console.log(`[AIAesthetic] Extracting colors for: ${track.title} at ${fullCoverUrl}`);

        try {
            const vibrant = new Vibrant(fullCoverUrl);
            const palette = await vibrant.getPalette();
            
            let dominantColor = '#1A1A2E'; // Fallback
            let vibe = 'Dark Mood';
            
            if (palette.Vibrant) {
                dominantColor = palette.Vibrant.hex;
                vibe = 'Vibrant Energy';
            } else if (palette.Muted) {
                dominantColor = palette.Muted.hex;
                vibe = 'Muted Chill';
            } else if (palette.DarkVibrant) {
                dominantColor = palette.DarkVibrant.hex;
                vibe = 'Dark Intense';
            }

            console.log(`[AIAesthetic] ✅ Result for "${track.title}": ${vibe} (${dominantColor})`);

            return await prisma.track.update({
                where: { id: trackId },
                data: {
                    aura_color: dominantColor.toUpperCase(),
                    aura_vibe: vibe
                }
            });

        } catch (err: any) {
            console.error(`[AIAesthetic] ❌ Color extraction failed for ${track.title}:`, err.message);
            return null;
        }
    }

    /**
     * Predicts the visual aesthetic for an album.
     */
    static async syncAlbumAesthetic(albumId: string) {
        const album = await prisma.album.findUnique({
            where: { id: albumId },
            include: { artist: true, tracks: { take: 5 } }
        });

        if (!album || !album.coverUrl) return null;

        let fullCoverUrl = album.coverUrl;
        if (!fullCoverUrl.startsWith('http')) {
            fullCoverUrl = `https://zenify-production-7f21.up.railway.app/uploads/${fullCoverUrl.replace(/^\/+/, '')}`;
        }

        try {
            const vibrant = new Vibrant(fullCoverUrl);
            const palette = await vibrant.getPalette();
            
            let dominantColor = '#1A1A2E'; // Fallback
            let vibe = 'Dark Mood';
            
            if (palette.Vibrant) {
                dominantColor = palette.Vibrant.hex;
                vibe = 'Vibrant Energy';
            } else if (palette.Muted) {
                dominantColor = palette.Muted.hex;
                vibe = 'Muted Chill';
            } else if (palette.DarkVibrant) {
                dominantColor = palette.DarkVibrant.hex;
                vibe = 'Dark Intense';
            }

            return await prisma.album.update({
                where: { id: albumId },
                data: {
                    aura_color: dominantColor.toUpperCase(),
                    aura_vibe: vibe
                }
            });
        } catch (err) {
            return null;
        }
    }
}
