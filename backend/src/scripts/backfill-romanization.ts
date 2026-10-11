import { prisma } from '../utils/prisma.js';
import { RomanizationService } from '../services/romanization.service.js';

/**
 * Resumable backfill script for lyrics romanization across all tracks in the database.
 * Processes in batches of 10.
 * Reports Converted, Skipped, and Failed counts.
 */
async function backfillRomanization() {
    console.log('=====================================================');
    console.log('   Zenify Lyrics Romanization Backfill Engine        ');
    console.log('=====================================================');

    let convertedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let totalProcessed = 0;

    const BATCH_SIZE = 10;
    let cursor: string | undefined = undefined;

    try {
        while (true) {
            const tracks: any[] = await prisma.track.findMany({
                take: BATCH_SIZE,
                skip: cursor ? 1 : 0,
                cursor: cursor ? { id: cursor } : undefined,
                where: {
                    deletedAt: null,
                    OR: [
                        { lyrics: { not: null } },
                        { synced_lyrics: { not: null } }
                    ]
                },
                select: {
                    id: true,
                    title: true,
                    lyrics: true,
                    synced_lyrics: true,
                    romanizedLyrics: true,
                    sourceHash: true,
                    artist: { select: { name: true } }
                },
                orderBy: { id: 'asc' }
            });

            if (tracks.length === 0) {
                break;
            }

            cursor = tracks[tracks.length - 1].id;

            for (const track of tracks) {
                totalProcessed++;
                const plainText = track.lyrics || '';
                const syncedTokens = Array.isArray(track.synced_lyrics) ? (track.synced_lyrics as any[]) : [];
                const combined = plainText + ' ' + syncedTokens.map(t => t.text || '').join(' ');

                // 1. Skip if already Latin / English
                if (!RomanizationService.containsNonLatin(combined)) {
                    skippedCount++;
                    console.log(`[Backfill] (${totalProcessed}) Skipped (Latin/English): "${track.title}"`);
                    continue;
                }

                // 2. Skip if already romanized and sourceHash unchanged
                const currentHash = RomanizationService.computeSourceHash(plainText, track.synced_lyrics);
                if (
                    track.sourceHash === currentHash &&
                    track.romanizedLyrics &&
                    !RomanizationService.containsNonLatin(track.romanizedLyrics)
                ) {
                    skippedCount++;
                    console.log(`[Backfill] (${totalProcessed}) Skipped (Already Romanized): "${track.title}"`);
                    continue;
                }

                // 3. Process track
                console.log(`[Backfill] (${totalProcessed}) Processing: "${track.title}" by ${track.artist?.name || 'Unknown'}...`);
                const result = await RomanizationService.processTrack(track.id, false);

                if (result.success) {
                    if (result.skipped) {
                        skippedCount++;
                        console.log(`[Backfill] (${totalProcessed}) Skipped: "${track.title}" - ${result.error || 'Already valid'}`);
                    } else {
                        convertedCount++;
                        console.log(`[Backfill] (${totalProcessed}) ✔ Converted: "${track.title}" -> ${result.lang}`);
                    }
                } else {
                    failedCount++;
                    console.error(`[Backfill] (${totalProcessed}) ✖ Failed: "${track.title}" - ${result.error}`);
                }

                // Brief pause to maintain respectful rate limits
                await new Promise(r => setTimeout(r, 200));
            }
        }
    } catch (err: any) {
        console.error('[Backfill] Fatal error during backfill loop:', err);
    } finally {
        console.log('\n=====================================================');
        console.log('              Backfill Complete Report               ');
        console.log('=====================================================');
        console.log(`Total Scanned: ${totalProcessed}`);
        console.log(`✔ Converted:   ${convertedCount}`);
        console.log(`⏭ Skipped:     ${skippedCount}`);
        console.log(`✖ Failed:      ${failedCount}`);
        console.log('=====================================================\n');

        await prisma.$disconnect();
    }
}

// Allow direct CLI invocation
if (process.argv[1] && process.argv[1].includes('backfill-romanization')) {
    backfillRomanization()
        .then(() => process.exit(0))
        .catch(e => {
            console.error(e);
            process.exit(1);
        });
}

export { backfillRomanization };
