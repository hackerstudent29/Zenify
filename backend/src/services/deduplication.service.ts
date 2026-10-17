import { prisma } from '../utils/prisma.js';
import { normalizeArtistName } from '../utils/artist.js';

export interface DeduplicationReport {
    timestamp: Date;
    tracksScanned: number;
    duplicateGroupsFound: number;
    tracksConsolidated: number;
    artistsScanned: number;
    artistsConsolidated: number;
}

/**
 * Normalizes song title by removing bracketed video fluff, feature mentions,
 * audio quality descriptors, and punctuation for strict duplicate matching.
 */
export function normalizeTrackTitle(rawTitle: string): string {
    if (!rawTitle) return '';
    let title = rawTitle.trim();

    // Decode common HTML entities
    title = title
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');

    // Remove leading/trailing quotes
    title = title.replace(/^["']+|["']+$/g, '');

    // Standardize Remix tags
    title = title.replace(/\s*[\[\(](?:official\s+)?remix[\]\)]/gi, ' remix');

    // Remove video and audio clutter tags:
    // E.g. (Official Music Video), [Official Video], (Lyric Video), [Audio], (Visualizer), (From "Leo"), [4K], [HD]
    title = title.replace(/\s*[\[\(](?:official\s+)?(?:music\s+)?(?:video|audio|lyric|lyrics|visualizer|remastered|hd|4k|full\s+song|video\s+song|single|original|from\s+[^\]\)]+)[\]\)]/gi, '');

    // Remove feature credits inside title: (feat. ...), (ft. ...), [feat. ...], feat. ..., ft. ...
    title = title.replace(/\s*[\[\(](?:feat\.?|ft\.?|featuring)\s+[^\]\)]+[\]\)]/gi, '');
    title = title.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '');

    // Remove trailing pipes / hyphens with channel or video clutter: " | Anirudh | Vijay", " - Lyric Video"
    title = title.replace(/\s*[\|\/].*$/, '');
    title = title.replace(/\s*-\s*(?:lyric|lyrics|official|audio|video|full\s+song|visualizer).*/i, '');

    // Convert to lowercase and strip all punctuation except letters, digits, and regional unicode scripts
    title = title.toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return title;
}

/**
 * Normalizes artist name to primary canonical form for consistent fingerprinting.
 */
export function normalizeArtistForDeduplication(rawArtist: string): string {
    if (!rawArtist) return 'unknown';
    // Use canonical lookup and aliases (e.g. "A R Rahman" -> "A. R. Rahman", "Anirudh" -> "Anirudh Ravichander")
    const canonical = normalizeArtistName(rawArtist);

    // Extract primary lead artist if multiple are chained with separators
    const primary = canonical.split(/\s*[,&/]\s*|\s+(?:feat\.?|ft\.?|featuring|vs\.?|x)\s+/i)[0].trim();

    return primary
        .toLowerCase()
        .replace(/^(?:the\s+)/i, '')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generates an immutable string fingerprint for title + artist combination.
 */
export function generateTrackFingerprint(title: string, artistName: string): string {
    const normTitle = normalizeTrackTitle(title);
    const normArtist = normalizeArtistForDeduplication(artistName);
    return `${normTitle}:::${normArtist}`;
}

export class DeduplicationService {
    private static isRunning = false;

    /**
     * Check if a duplicate track already exists in the catalog before inserting.
     * Searches via:
     * 1. Exact case-insensitive title and artist name match
     * 2. Fingerprint match against candidate tracks from the same artist
     * 3. Duration sanity checks if duration is provided
     */
    static async findExistingDuplicate(
        title: string,
        artistName: string,
        duration?: number,
        excludeTrackId?: string
    ) {
        if (!title || !artistName) return null;

        const normTitle = normalizeTrackTitle(title);
        const normArtist = normalizeArtistForDeduplication(artistName);
        const targetFingerprint = `${normTitle}:::${normArtist}`;

        // 1. Direct case-insensitive match on track title & artist name
        const directMatch = await prisma.track.findFirst({
            where: {
                deletedAt: null,
                id: excludeTrackId ? { not: excludeTrackId } : undefined,
                title: { equals: title.trim(), mode: 'insensitive' },
                artist: { name: { equals: artistName.trim(), mode: 'insensitive' } },
            },
            include: { artist: true, album: true }
        });
        if (directMatch) return directMatch;

        // 2. Fetch tracks from the artist (or matching canonical artist name)
        const artistCandidates = await prisma.artist.findMany({
            where: {
                OR: [
                    { name: { equals: artistName.trim(), mode: 'insensitive' } },
                    { name: { contains: normArtist, mode: 'insensitive' } },
                ]
            },
            include: {
                tracks: {
                    where: {
                        deletedAt: null,
                        id: excludeTrackId ? { not: excludeTrackId } : undefined,
                    },
                    include: { artist: true, album: true }
                }
            }
        });

        for (const artistRecord of artistCandidates) {
            for (const track of artistRecord.tracks) {
                const trackFp = generateTrackFingerprint(track.title, track.artist?.name || artistRecord.name);
                if (trackFp === targetFingerprint) {
                    // Check duration sanity if provided: allow up to 45s difference or teaser vs full song
                    if (!duration || Math.abs(track.duration - duration) < 45 || track.duration > 120) {
                        return track;
                    }
                }
            }
        }

        // 3. Fallback search by normalized title words if the artist might be formatted differently
        if (normTitle.length >= 3) {
            const potentialMatches = await prisma.track.findMany({
                where: {
                    deletedAt: null,
                    id: excludeTrackId ? { not: excludeTrackId } : undefined,
                    title: { contains: normTitle.slice(0, 15), mode: 'insensitive' },
                },
                include: { artist: true, album: true },
                take: 10
            });

            for (const track of potentialMatches) {
                const trackFp = generateTrackFingerprint(track.title, track.artist?.name || '');
                if (trackFp === targetFingerprint) {
                    return track;
                }
            }
        }

        return null;
    }

    /**
     * Scores a track candidate to elect the best "Winner" in a duplicate group.
     * Evaluates audio permanence, lyrics quality, stream count, and playlist presence.
     */
    private static scoreTrack(track: any): number {
        let score = 0;

        const audio = track.audioUrl || '';
        const isR2OrCloudinary = audio.includes('r2.cloudflarestorage.com') ||
            audio.includes('cloudinary.com') ||
            audio.includes('s3.') ||
            audio.includes('/uploads/');
        const isDirectStream = audio.startsWith('http') &&
            !audio.includes('/stream-youtube') &&
            !audio.includes('apple.com') &&
            !audio.includes('audio-ssl');
        const isStreamYoutube = audio.includes('/stream-youtube');
        const isEmptyAudio = !audio || audio.trim() === '';

        // Audio quality hierarchy
        if (isR2OrCloudinary) score += 5000;
        else if (isDirectStream) score += 3000;
        else if (isStreamYoutube) score += 1000;
        else if (isEmptyAudio) score -= 10000;

        // Lyrics completeness
        if (track.raw_lrc) score += 800;
        if (track.synced_lyrics && typeof track.synced_lyrics === 'object' && Object.keys(track.synced_lyrics).length > 0) score += 600;
        if (track.lyrics && track.lyrics.length > 50) score += 300;

        // Album association
        if (track.albumId) score += 200;

        // Cover quality
        if (track.coverUrl && !track.coverUrl.includes('unsplash.com')) score += 100;

        // Community engagement
        score += (track.streams || 0) * 10;
        score += ((track._count?.likes ?? track.likes?.length) || 0) * 50;
        score += ((track._count?.playlistTracks ?? track.playlistTracks?.length) || 0) * 80;
        score += ((track._count?.history ?? track.history?.length) || 0) * 20;

        // Full duration vs teaser penalty
        if (track.duration && track.duration < 75) score -= 2000;
        else if (track.duration && track.duration >= 120) score += 200;

        // Published status preference
        if (track.releaseStatus === 'PUBLISHED') score += 500;

        return score;
    }

    /**
     * Consolidates duplicate tracks into a single chosen Winner.
     * Safely migrates all likes, playlist entries, history, and stats from losers to the winner,
     * merges stream counts, and deletes the losers.
     */
    static async consolidateDuplicates(winnerId: string, loserIds: string[]) {
        if (!winnerId || loserIds.length === 0) return;

        const winner = await prisma.track.findUnique({
            where: { id: winnerId },
            include: {
                likes: true,
                playlistTracks: true,
                artist: true,
            }
        });

        if (!winner) {
            console.warn(`[Deduplication] Winner track ${winnerId} not found, aborting merge.`);
            return;
        }

        let extraStreams = 0;
        let betterAudioUrl: string | null = null;
        let betterLyrics: string | null = null;
        let betterSyncedLyrics: any = null;
        let betterRawLrc: string | null = null;
        let betterCoverUrl: string | null = null;

        for (const loserId of loserIds) {
            if (loserId === winnerId) continue;

            const loser = await prisma.track.findUnique({
                where: { id: loserId },
                include: {
                    likes: true,
                    playlistTracks: true,
                    history: true,
                    userStats: true,
                    ratings: true,
                    purchases: true,
                }
            });

            if (!loser) continue;

            extraStreams += loser.streams || 0;

            // Check if loser has permanent audio while winner only has youtube fallback or empty audio
            const winnerAudio = winner.audioUrl || '';
            const loserAudio = loser.audioUrl || '';
            const winnerHasPermAudio = winnerAudio.includes('r2.cloudflarestorage.com') || winnerAudio.includes('cloudinary.com');
            const loserHasPermAudio = loserAudio.includes('r2.cloudflarestorage.com') || loserAudio.includes('cloudinary.com');

            if (!winnerHasPermAudio && loserHasPermAudio && !betterAudioUrl) {
                betterAudioUrl = loser.audioUrl;
            }

            // Check if loser has lyrics while winner does not
            if (!winner.raw_lrc && loser.raw_lrc && !betterRawLrc) {
                betterRawLrc = loser.raw_lrc;
            }
            if (!winner.synced_lyrics && loser.synced_lyrics && !betterSyncedLyrics) {
                betterSyncedLyrics = loser.synced_lyrics;
            }
            if (!winner.lyrics && loser.lyrics && !betterLyrics) {
                betterLyrics = loser.lyrics;
            }
            if ((!winner.coverUrl || winner.coverUrl.includes('unsplash.com')) && loser.coverUrl && !loser.coverUrl.includes('unsplash.com')) {
                betterCoverUrl = loser.coverUrl;
            }

            // 1. Migrate Likes (respect unique constraint on userId_trackId)
            for (const like of loser.likes) {
                const alreadyLiked = await prisma.like.findUnique({
                    where: { userId_trackId: { userId: like.userId, trackId: winner.id } }
                });
                if (!alreadyLiked) {
                    await prisma.like.create({
                        data: { userId: like.userId, trackId: winner.id }
                    }).catch(() => {});
                }
            }

            // 2. Migrate Playlist Tracks (respect unique constraint on playlistId_trackId)
            for (const pt of loser.playlistTracks) {
                const alreadyInPlaylist = await prisma.playlistTrack.findUnique({
                    where: { playlistId_trackId: { playlistId: pt.playlistId, trackId: winner.id } }
                });
                if (!alreadyInPlaylist) {
                    await prisma.playlistTrack.create({
                        data: { playlistId: pt.playlistId, trackId: winner.id }
                    }).catch(() => {});
                }
            }

            // 3. Migrate History
            await prisma.history.updateMany({
                where: { trackId: loserId },
                data: { trackId: winner.id }
            }).catch(() => {});

            // 4. Migrate UserTrackStats
            for (const stat of loser.userStats) {
                const existingStat = await prisma.userTrackStat.findUnique({
                    where: { userId_trackId: { userId: stat.userId, trackId: winner.id } }
                });
                if (existingStat) {
                    await prisma.userTrackStat.update({
                        where: { id: existingStat.id },
                        data: {
                            streamCount: existingStat.streamCount + stat.streamCount,
                            totalListenDuration: existingStat.totalListenDuration + stat.totalListenDuration,
                            skipCount: existingStat.skipCount + stat.skipCount,
                        }
                    }).catch(() => {});
                } else {
                    await prisma.userTrackStat.update({
                        where: { id: stat.id },
                        data: { trackId: winner.id }
                    }).catch(() => {});
                }
            }

            // 5. Migrate Ratings
            for (const rating of loser.ratings) {
                const existingRating = await prisma.rating.findUnique({
                    where: { userId_trackId: { userId: rating.userId, trackId: winner.id } }
                });
                if (!existingRating) {
                    await prisma.rating.update({
                        where: { id: rating.id },
                        data: { trackId: winner.id }
                    }).catch(() => {});
                }
            }

            // 6. Migrate Purchases
            for (const purchase of loser.purchases) {
                const existingPurchase = await prisma.purchase.findUnique({
                    where: { userId_trackId: { userId: purchase.userId, trackId: winner.id } }
                });
                if (!existingPurchase) {
                    await prisma.purchase.update({
                        where: { id: purchase.id },
                        data: { trackId: winner.id }
                    }).catch(() => {});
                }
            }

            // 7. Update FeaturedContent polymorphic references
            await prisma.featuredContent.updateMany({
                where: { contentType: 'track', contentId: loserId },
                data: { contentId: winner.id }
            }).catch(() => {});

            // Clean up foreign keys on loser before track deletion
            await prisma.like.deleteMany({ where: { trackId: loserId } }).catch(() => {});
            await prisma.playlistTrack.deleteMany({ where: { trackId: loserId } }).catch(() => {});
            await prisma.history.deleteMany({ where: { trackId: loserId } }).catch(() => {});
            await prisma.userTrackStat.deleteMany({ where: { trackId: loserId } }).catch(() => {});
            await prisma.rating.deleteMany({ where: { trackId: loserId } }).catch(() => {});
            await prisma.purchase.deleteMany({ where: { trackId: loserId } }).catch(() => {});
            await prisma.trackAnalytics.deleteMany({ where: { trackId: loserId } }).catch(() => {});

            // Delete the duplicate loser track
            await prisma.track.delete({ where: { id: loserId } }).catch((err) => {
                console.error(`[Deduplication] Failed to delete duplicate track ${loserId}:`, err.message);
            });

            console.log(`[Deduplication] Deleted inferior duplicate track: "${loser.title}" (ID: ${loserId})`);
        }

        // Apply stream consolidation and upgraded audio/lyrics to the Winner
        const updateWinnerData: any = {};
        if (extraStreams > 0) {
            updateWinnerData.streams = (winner.streams || 0) + extraStreams;
        }
        if (betterAudioUrl) {
            updateWinnerData.audioUrl = betterAudioUrl;
        }
        if (betterRawLrc) {
            updateWinnerData.raw_lrc = betterRawLrc;
        }
        if (betterSyncedLyrics) {
            updateWinnerData.synced_lyrics = betterSyncedLyrics;
        }
        if (betterLyrics) {
            updateWinnerData.lyrics = betterLyrics;
        }
        if (betterCoverUrl) {
            updateWinnerData.coverUrl = betterCoverUrl;
        }

        // Recalculate true like count
        const totalLikes = await prisma.like.count({ where: { trackId: winner.id } });
        updateWinnerData.like_count = totalLikes;

        if (Object.keys(updateWinnerData).length > 0) {
            await prisma.track.update({
                where: { id: winner.id },
                data: updateWinnerData
            });
            console.log(`[Deduplication] Winner track "${winner.title}" (${winner.id}) updated with consolidated data:`, updateWinnerData);
        }
    }

    /**
     * Deduplicates redundant Artist records created through case or spelling variations.
     */
    static async deduplicateArtists(): Promise<number> {
        let mergedArtists = 0;
        const allArtists = await prisma.artist.findMany({
            include: {
                tracks: { select: { id: true } },
                albums: { select: { id: true } }
            }
        });

        const artistGroups = new Map<string, typeof allArtists>();

        for (const artist of allArtists) {
            const canonicalKey = normalizeArtistForDeduplication(artist.name);
            const group = artistGroups.get(canonicalKey) || [];
            group.push(artist);
            artistGroups.set(canonicalKey, group);
        }

        for (const [key, group] of artistGroups.entries()) {
            if (group.length < 2) continue;

            console.log(`[Deduplication] Found duplicate artist group for "${key}" with ${group.length} records.`);

            // Elect winner artist: highest track count, verified, or most complete profile
            const sorted = [...group].sort((a, b) => {
                const aScore = (a.verified ? 1000 : 0) + (a.tracks.length * 10) + (a.albums.length * 20) + (a.imageUrl ? 50 : 0);
                const bScore = (b.verified ? 1000 : 0) + (b.tracks.length * 10) + (b.albums.length * 20) + (b.imageUrl ? 50 : 0);
                return bScore - aScore;
            });

            const winner = sorted[0];
            const losers = sorted.slice(1);

            for (const loser of losers) {
                // Re-link tracks to winner artist
                await prisma.track.updateMany({
                    where: { artistId: loser.id },
                    data: { artistId: winner.id }
                });

                // Re-link albums to winner artist
                await prisma.album.updateMany({
                    where: { artistId: loser.id },
                    data: { artistId: winner.id }
                });

                // Re-link featured content
                await prisma.featuredContent.updateMany({
                    where: { contentType: 'artist', contentId: loser.id },
                    data: { contentId: winner.id }
                });

                // Delete the duplicate artist
                await prisma.artist.delete({ where: { id: loser.id } }).catch((err) => {
                    console.error(`[Deduplication] Failed to delete duplicate artist ${loser.id}:`, err.message);
                });

                mergedArtists++;
                console.log(`[Deduplication] Merged duplicate artist "${loser.name}" into "${winner.name}" (${winner.id})`);
            }
        }

        return mergedArtists;
    }

    /**
     * Active background watcher.
     * Scans all tracks in the database, identifies duplicate buckets (>= 2 tracks),
     * elects the superior winner, and cleanly merges losers.
     */
    static async runActiveWatcher(): Promise<DeduplicationReport> {
        if (this.isRunning) {
            console.log('[Deduplication] Active watcher is already in progress, skipping overlapping sweep.');
            return {
                timestamp: new Date(),
                tracksScanned: 0,
                duplicateGroupsFound: 0,
                tracksConsolidated: 0,
                artistsScanned: 0,
                artistsConsolidated: 0,
            };
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            console.log('[Deduplication] Starting active catalog duplicate scan...');

            // Stage 1: Ultra-lightweight fingerprint scan (no lyrics, no history arrays)
            const trackSummaries = await prisma.track.findMany({
                where: { deletedAt: null },
                select: {
                    id: true,
                    title: true,
                    createdAt: true,
                    artist: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                }
            });

            // Group by strict track fingerprint
            const duplicateBuckets = new Map<string, typeof trackSummaries>();

            for (const track of trackSummaries) {
                const fp = generateTrackFingerprint(track.title, track.artist?.name || 'Unknown');
                const bucket = duplicateBuckets.get(fp) || [];
                bucket.push(track);
                duplicateBuckets.set(fp, bucket);
            }

            // Stage 2: Only fetch full scoring fields for actual duplicate groups (>= 2 tracks)
            const candidateGroups = Array.from(duplicateBuckets.entries()).filter(([_, group]) => group.length >= 2);
            
            let duplicateGroupsFound = 0;
            let tracksConsolidated = 0;

            if (candidateGroups.length > 0) {
                const candidateTrackIds = candidateGroups.flatMap(([_, group]) => group.map(t => t.id));
                const detailedCandidates = await prisma.track.findMany({
                    where: { id: { in: candidateTrackIds } },
                    select: {
                        id: true,
                        title: true,
                        audioUrl: true,
                        coverUrl: true,
                        duration: true,
                        streams: true,
                        lyrics: true,
                        synced_lyrics: true,
                        raw_lrc: true,
                        releaseStatus: true,
                        albumId: true,
                        createdAt: true,
                        artist: {
                            select: {
                                id: true,
                                name: true,
                            }
                        },
                        _count: {
                            select: {
                                likes: true,
                                playlistTracks: true,
                                history: true
                            }
                        }
                    }
                });

                const candidateMap = new Map(detailedCandidates.map(t => [t.id, t]));

                for (const [fingerprint, group] of candidateGroups) {
                    duplicateGroupsFound++;
                    console.log(`[Deduplication] Detected duplicate group [${fingerprint}] with ${group.length} tracks.`);

                    const detailedGroup = group.map(t => candidateMap.get(t.id)).filter(Boolean) as typeof detailedCandidates;
                    if (detailedGroup.length < 2) continue;

                    // Sort by quality and completeness score descending
                    const ranked = [...detailedGroup].sort((a, b) => {
                        const scoreA = this.scoreTrack(a);
                        const scoreB = this.scoreTrack(b);
                        if (scoreB !== scoreA) return scoreB - scoreA;
                        // Tie-breaker: older created date preferred
                        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    });

                    const winner = ranked[0];
                    const losers = ranked.slice(1);

                    console.log(`[Deduplication] Elected Winner: "${winner.title}" (${winner.id}) [Score: ${this.scoreTrack(winner)}]`);
                    console.log(`[Deduplication] Merging ${losers.length} inferior duplicates into winner...`);

                    await this.consolidateDuplicates(winner.id, losers.map(l => l.id));
                    tracksConsolidated += losers.length;
                }
            }

            // Also sweep for duplicate artists
            const artistsMerged = await this.deduplicateArtists();

            const durationMs = Date.now() - startTime;
            console.log(`[Deduplication] Sweep finished in ${durationMs}ms: Scanned ${trackSummaries.length} tracks, found ${duplicateGroupsFound} duplicate groups, merged ${tracksConsolidated} duplicate tracks, merged ${artistsMerged} duplicate artists.`);

            return {
                timestamp: new Date(),
                tracksScanned: trackSummaries.length,
                duplicateGroupsFound,
                tracksConsolidated,
                artistsScanned: 0,
                artistsConsolidated: artistsMerged,
            };
        } catch (error: any) {
            console.error('[Deduplication] Active watcher encountered an error:', error.message);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }
}
