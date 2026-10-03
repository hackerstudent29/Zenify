import { prisma } from '../utils/prisma';
import { MetadataResolverService } from './metadata-resolver.service';

export class MetadataMaintenanceService {
    /**
     * Automated Metadata Maintenance Job (Idempotent)
     * Scans for tracks missing coverUrl, genre, or metadata verification,
     * resolves metadata cleanly, and updates canonical artist records.
     */
    static async runMaintenance(batchSize = 25): Promise<{ processed: number; updated: number }> {
        console.log('[MetadataMaintenance] Starting automated metadata maintenance run...');

        try {
            // Fetch unverified tracks or tracks missing key metadata
            const tracks = await prisma.track.findMany({
                where: {
                    deletedAt: null,
                    OR: [
                        { metadataVerifiedAt: null },
                        { coverUrl: null },
                        { genre: null },
                        { metadataConfidence: { lt: 0.85 } }
                    ]
                },
                include: { artist: true },
                take: batchSize
            });

            if (tracks.length === 0) {
                console.log('[MetadataMaintenance] All tracks are fully verified. No work required.');
                return { processed: 0, updated: 0 };
            }

            let updatedCount = 0;

            for (const track of tracks) {
                const resolved = await MetadataResolverService.resolveMetadata({
                    title: track.title,
                    artistName: track.artist?.name,
                    existingCoverUrl: track.coverUrl || undefined,
                    existingGenre: track.genre || undefined
                });

                // Only update if metadata confidence is high AND changes are verified
                if (resolved.verified && resolved.metadataConfidence >= 0.85) {
                    await prisma.track.update({
                        where: { id: track.id },
                        data: {
                            title: resolved.title,
                            normalizedTitle: resolved.normalizedTitle,
                            artistId: resolved.primaryArtistId || track.artistId,
                            featuredArtists: resolved.featuredArtists.length > 0 ? resolved.featuredArtists.join(', ') : track.featuredArtists,
                            coverUrl: resolved.coverUrl || track.coverUrl,
                            genre: resolved.genre || track.genre,
                            releaseDate: resolved.releaseDate || track.releaseDate,
                            metadataSource: resolved.metadataSource,
                            metadataConfidence: resolved.metadataConfidence,
                            metadataVerifiedAt: new Date()
                        }
                    });
                    updatedCount++;
                } else {
                    // Touch metadataVerifiedAt so we don't repeatedly re-process unresolvable items
                    await prisma.track.update({
                        where: { id: track.id },
                        data: { metadataVerifiedAt: new Date() }
                    });
                }
            }

            console.log(`[MetadataMaintenance] Maintenance complete. Processed ${tracks.length} tracks, updated ${updatedCount}.`);
            return { processed: tracks.length, updated: updatedCount };
        } catch (err) {
            console.error('[MetadataMaintenance] Maintenance job failed:', err);
            return { processed: 0, updated: 0 };
        }
    }
}
