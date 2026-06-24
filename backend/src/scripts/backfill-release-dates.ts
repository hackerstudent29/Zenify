import { prisma } from '../utils/prisma.js';
import { ExternalMetadataService } from '../services/external-metadata.service.js';

async function main() {
    console.log('[Backfill] Starting release dates backfill process...');
    
    // Find tracks where releaseDate is null
    const tracks = await prisma.track.findMany({
        where: {
            releaseDate: null,
            deletedAt: null
        },
        include: {
            artist: true,
            album: true
        }
    });

    console.log(`[Backfill] Found ${tracks.length} tracks missing a release date.`);

    let updatedCount = 0;

    for (const track of tracks) {
        const artistName = track.artist?.name || 'Unknown Artist';
        const albumTitle = track.album?.title || undefined;
        console.log(`[Backfill] Querying iTunes for "${track.title}" by "${artistName}" (Album: ${albumTitle || 'None'})...`);
        
        try {
            const hqMeta = await ExternalMetadataService.searchITunesMetadata(track.title, artistName, albumTitle);
            if (hqMeta && hqMeta.releaseDate) {
                const newReleaseDate = new Date(hqMeta.releaseDate);
                if (!isNaN(newReleaseDate.getTime())) {
                    await prisma.track.update({
                        where: { id: track.id },
                        data: { releaseDate: newReleaseDate }
                    });
                    console.log(`  -> SUCCESS: Updated release date to ${hqMeta.releaseDate}`);
                    updatedCount++;
                }
            } else {
                console.log(`  -> NO MATCH found on iTunes.`);
            }
        } catch (err: any) {
            console.error(`  -> ERROR for track ${track.title}:`, err.message);
        }
        
        // Brief sleep to avoid hitting Apple search rate limits too fast
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`[Backfill] Completed backfilling release dates. Total updated: ${updatedCount}/${tracks.length}`);
    await prisma.$disconnect();
}

main().catch(console.error);
