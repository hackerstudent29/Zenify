import { prisma } from '../utils/prisma';

// ---------------- In-Memory Cache ----------------
interface CacheEntry {
    data: any;
    expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function getCached(key: string): any | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: any, ttlMs: number) {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ---------------- Slim Track Select ----------------
const SLIM_SELECT = {
    id: true,
    title: true,
    coverUrl: true,
    audioUrl: true,
    duration: true,
    genre: true,
    streams: true,
    createdAt: true,
    engagement_score: true,
    bpm: true,
    language: true,
    like_count: true,
    artist: {
        select: { id: true, name: true, imageUrl: true }
    },
    album: {
        select: { id: true, title: true, coverUrl: true }
    }
};

// Format tracks for API response to match exactly what the frontend PlayerStore expects
function formatTrack(t: any) {
    return {
        id: t.id,
        title: t.title,
        coverUrl: t.coverUrl,
        audioUrl: t.audioUrl,
        duration: t.duration,
        genre: t.genre,
        artistId: t.artist?.id,
        artist: {
            id: t.artist?.id || '',
            name: t.artist?.name || 'Unknown Artist',
            imageUrl: t.artist?.imageUrl,
        },
        album: t.album ? {
            id: t.album.id,
            title: t.album.title,
            coverUrl: t.album.coverUrl,
        } : undefined,
    };
}

export class HomepageService {

    // ========================================================
    // PUBLIC: Get all homepage sections for a user
    // ========================================================
    async getHomepage(userId?: string, currentTrackId?: string) {
        const sections: any[] = [];

        // Run queries in parallel
        const [mostPlayed, newReleases, trending, personalized, similar] = await Promise.all([
            this.getMostPlayedRow(),
            this.getNewReleasesRow(),
            this.getTrendingRow(),
            userId ? this.getPersonalizedRow(userId) : Promise.resolve([]),
            currentTrackId ? this.getSimilarRow(currentTrackId) : Promise.resolve([]),
        ]);

        sections.push({
            title: 'Most Played',
            subtitle: 'THE MOST STREAMED FREQUENCIES IN THE ARCHIVE',
            type: 'most_played',
            items: mostPlayed,
        });

        sections.push({
            title: 'New Arrivals',
            subtitle: 'FRESHLY PRESSED FROM THE STUDIO',
            type: 'new',
            items: newReleases,
        });

        sections.push({
            title: 'Trending Now',
            subtitle: 'WHAT THE COMMUNITY IS VIBING TO',
            type: 'trending',
            items: trending,
        });

        if (personalized && personalized.length > 0) {
            sections.push({
                title: 'Made For You',
                subtitle: 'BASED ON YOUR SONIC PREFERENCES',
                type: 'personalized',
                items: personalized,
            });
        }

        if (similar && similar.length > 0) {
            sections.push({
                title: 'Similar to What You\'re Playing',
                subtitle: 'SONICALLY COMPATIBLE FREQUENCIES',
                type: 'similar',
                items: similar,
            });
        }

        return { sections };
    }

    // ========================================================
    // ROW 1: Personalized For User
    // ========================================================
    private async getPersonalizedRow(userId: string) {
        try {
            // 1. Get user's listening history with genre/artist stats
            const userStats = await prisma.userTrackStat.findMany({
                where: { userId },
                orderBy: { streamCount: 'desc' },
                take: 50,
                include: {
                    track: {
                        select: { genre: true, artistId: true, id: true }
                    }
                }
            });

            if (userStats.length === 0) return this.getFallbackPopular();

            // 2. Identify top 3 genres
            const genreCounts: Record<string, number> = {};
            const artistCounts: Record<string, number> = {};
            const playedTrackIds = new Set<string>();

            for (const stat of userStats) {
                const genre = stat.track.genre || 'unknown';
                const artistId = stat.track.artistId;
                genreCounts[genre] = (genreCounts[genre] || 0) + stat.streamCount;
                artistCounts[artistId] = (artistCounts[artistId] || 0) + stat.streamCount;
                if (stat.streamCount > 5) playedTrackIds.add(stat.track.id); // Exclude heavily played
            }

            const topGenres = Object.entries(genreCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([genre]) => genre);

            const topArtistIds = Object.entries(artistCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([id]) => id);

            // 3. Fetch candidate tracks matching genre or artist, excluding heavily played
            const candidates = await prisma.track.findMany({
                where: {
                    deletedAt: null,
                    releaseStatus: 'PUBLISHED',
                    isUnlisted: false,
                    id: { notIn: Array.from(playedTrackIds) },
                    OR: [
                        { genre: { in: topGenres } },
                        { artistId: { in: topArtistIds } },
                    ]
                },
                select: SLIM_SELECT,
                take: 40,
            });

            // 4. Score each candidate
            const now = Date.now();
            const scored = candidates.map(track => {
                const genreMatch = topGenres.includes(track.genre || '') ? 1 : 0;
                const artistMatch = topArtistIds.includes((track as any).artistId) ? 1 : 0;
                const engagement = track.engagement_score || 0;
                const ageMs = now - new Date(track.createdAt).getTime();
                const freshnessScore = Math.max(0, 1 - ageMs / (90 * 24 * 60 * 60 * 1000)); // decay over 90 days

                const personalScore =
                    genreMatch * 0.4 +
                    artistMatch * 0.3 +
                    Math.min(engagement / 100, 1) * 0.2 +
                    freshnessScore * 0.1;

                return { track, score: personalScore };
            });

            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, 10).map(s => formatTrack(s.track));
        } catch (err) {
            console.error('Personalized row failed:', err);
            return this.getFallbackPopular();
        }
    }

    // Most Played Row (Global Top 20)
    private async getMostPlayedRow() {
        const cached = getCached('most_played_row');
        if (cached) return cached;

        const tracks = await prisma.track.findMany({
            where: { deletedAt: null, releaseStatus: 'PUBLISHED', isUnlisted: false },
            select: SLIM_SELECT,
            orderBy: { streams: 'desc' },
            take: 20,
        });

        const result = tracks.map(formatTrack);
        setCache('most_played_row', result, 5 * 60 * 1000); // 5 min cache
        return result;
    }

    // Fallback when no user or no history
    private async getFallbackPopular() {
        return this.getMostPlayedRow();
    }

    // ========================================================
    // ROW 2: Trending Now
    // ========================================================
    private async getTrendingRow() {
        const cached = getCached('trending_row');
        if (cached) return cached;

        try {
            const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Get play counts in last 48 hours from history
            const recentPlays = await prisma.history.groupBy({
                by: ['trackId'],
                where: { playedAt: { gte: twoDaysAgo } },
                _count: { trackId: true },
                orderBy: { _count: { trackId: 'desc' } },
                take: 30,
            });

            if (recentPlays.length === 0) {
                // Fallback: use tracks marked as isTrending OR with highest engagement scores
                // This is better than just 'plays desc' which is already used in Most Played
                const tracks = await prisma.track.findMany({
                    where: { deletedAt: null, releaseStatus: 'PUBLISHED', isUnlisted: false },
                    select: SLIM_SELECT,
                    orderBy: [
                        { isTrending: 'desc' },
                        { engagement_score: 'desc' },
                        { streams: 'desc' }
                    ],
                    take: 12,
                });
                // Randomize slightly to keep it fresh
                const shuffled = tracks.sort(() => 0.5 - Math.random()).slice(0, 10);
                const result = shuffled.map(formatTrack);
                setCache('trending_row', result, 10 * 60 * 1000);
                return result;
            }

            const trackIds = recentPlays.map(r => r.trackId);
            const playCountMap = new Map(recentPlays.map(r => [r.trackId, r._count.trackId]));

            // Get play counts from 7 days ago for growth rate calculation
            const weekPlays = await prisma.history.groupBy({
                by: ['trackId'],
                where: {
                    trackId: { in: trackIds },
                    playedAt: { gte: sevenDaysAgo, lt: twoDaysAgo }
                },
                _count: { trackId: true },
            });
            const weekPlayMap = new Map(weekPlays.map(r => [r.trackId, r._count.trackId]));

            // Fetch track details
            const tracks = await prisma.track.findMany({
                where: { id: { in: trackIds }, deletedAt: null, releaseStatus: 'PUBLISHED', isUnlisted: false },
                select: SLIM_SELECT,
            });

            // Score: plays_last_48h * 0.5 + growth_rate * 0.3 + engagement * 0.2
            const scored = tracks.map(track => {
                const recent = playCountMap.get(track.id) || 0;
                const previous = weekPlayMap.get(track.id) || 1; // avoid div/0
                const growthRate = Math.min((recent / previous) - 1, 5); // cap at 5x growth
                const engagement = Math.min((track.engagement_score || 0) / 100, 1);

                const trendingScore =
                    Math.min(recent / 20, 1) * 0.5 +  // normalize to max ~20 plays
                    Math.max(0, growthRate / 5) * 0.3 +
                    engagement * 0.2;

                return { track, score: trendingScore };
            });

            scored.sort((a, b) => b.score - a.score);
            const result = scored.slice(0, 10).map(s => formatTrack(s.track));
            setCache('trending_row', result, 10 * 60 * 1000); // 10 min cache
            return result;
        } catch (err) {
            console.error('Trending row failed:', err);
            return [];
        }
    }

    // ========================================================
    // ROW 3: New & Quality Releases
    // ========================================================
    private async getNewReleasesRow() {
        const cached = getCached('new_releases_row');
        if (cached) return cached;

        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            let tracks = await prisma.track.findMany({
                where: {
                    deletedAt: null,
                    releaseStatus: 'PUBLISHED',
                    isUnlisted: false,
                    createdAt: { gte: thirtyDaysAgo },
                },
                select: SLIM_SELECT,
                orderBy: { createdAt: 'desc' },
                take: 30,
            });

            // If no tracks in last 30 days, just get the latest 30 tracks
            if (tracks.length === 0) {
                tracks = await prisma.track.findMany({
                    where: {
                        deletedAt: null,
                        releaseStatus: 'PUBLISHED',
                        isUnlisted: false,
                    },
                    select: SLIM_SELECT,
                    orderBy: { createdAt: 'desc' },
                    take: 30,
                });
            }

            const now = Date.now();
            const scored = tracks.map(track => {
                const ageMs = now - new Date(track.createdAt).getTime();
                const freshnessWeight = Math.max(0, 1 - ageMs / (30 * 24 * 60 * 60 * 1000));
                const earlyEngagement = Math.min((track.engagement_score || 0) / 50, 1);
                const likeVelocity = Math.min((track.like_count || 0) / 10, 1);

                const newScore =
                    freshnessWeight * 0.5 +
                    earlyEngagement * 0.3 +
                    likeVelocity * 0.2;

                return { track, score: newScore };
            });

            scored.sort((a, b) => b.score - a.score);
            const result = scored.slice(0, 12).map(s => formatTrack(s.track));
            setCache('new_releases_row', result, 10 * 60 * 1000);
            return result;
        } catch (err) {
            console.error('New releases row failed:', err);
            return [];
        }
    }

    // ========================================================
    // ROW 4: Similar to Currently Playing
    // ========================================================
    private async getSimilarRow(trackId: string) {
        const cacheKey = `similar_${trackId}`;
        const cached = getCached(cacheKey);
        if (cached) return cached;

        try {
            const currentTrack = await prisma.track.findUnique({
                where: { id: trackId },
                select: { genre: true, language: true, bpm: true, artistId: true }
            });

            if (!currentTrack) return [];

            const bpmRange = currentTrack.bpm ? { gte: currentTrack.bpm - 15, lte: currentTrack.bpm + 15 } : undefined;

            const candidates = await prisma.track.findMany({
                where: {
                    id: { not: trackId },
                    deletedAt: null,
                    releaseStatus: 'PUBLISHED',
                    isUnlisted: false,
                    OR: [
                        { genre: currentTrack.genre },
                        { language: currentTrack.language },
                        { artistId: currentTrack.artistId },
                        ...(bpmRange ? [{ bpm: bpmRange }] : []),
                    ]
                },
                select: SLIM_SELECT,
                take: 30,
            });

            // Simple similarity scoring (cosine-like vector approach)
            const scored = candidates.map(track => {
                let similarity = 0;
                if (track.genre === currentTrack.genre) similarity += 0.4;
                if (track.language === currentTrack.language) similarity += 0.15;
                if ((track as any).artistId === currentTrack.artistId) similarity += 0.25;
                if (currentTrack.bpm && track.bpm) {
                    const bpmDiff = Math.abs(track.bpm - currentTrack.bpm);
                    similarity += Math.max(0, 0.2 - (bpmDiff / 150)); // closer BPM = higher score
                }
                return { track, score: similarity };
            });

            scored.sort((a, b) => b.score - a.score);
            const result = scored.slice(0, 10).map(s => formatTrack(s.track));
            setCache(cacheKey, result, 5 * 60 * 1000);
            return result;
        } catch (err) {
            console.error('Similar row failed:', err);
            return [];
        }
    }

    // ========================================================
    // ENGAGEMENT SCORE UPDATER (call periodically)
    // ========================================================
    static async updateEngagementScores() {
        console.log('[Engagement] Starting score update...');
        const startTime = Date.now();

        try {
            // Get all tracks with their aggregate stats
            const tracks = await prisma.track.findMany({
                where: { deletedAt: null },
                select: {
                    id: true,
                    streams: true,
                    like_count: true,
                    userStats: {
                        select: {
                            streamCount: true,
                            skipCount: true,
                            completionRateAvg: true,
                        }
                    }
                }
            });

            let updated = 0;
            // Process sequentially to avoid Prisma connection pool timeouts
            for (const track of tracks) {
                const totalPlays = track.streams || 0;
                const likeCount = track.like_count || 0;

                // Aggregate across all user stats for this track
                let avgCompletion = 0;
                let skipRate = 0;
                if (track.userStats.length > 0) {
                    const totalUserPlays = track.userStats.reduce((s, u: any) => s + (u.streamCount || 0), 0);
                    const totalSkips = track.userStats.reduce((s, u: any) => s + u.skipCount, 0);
                    avgCompletion = track.userStats.reduce((s, u) => s + (u.completionRateAvg || 0), 0) / track.userStats.length;
                    skipRate = totalUserPlays > 0 ? totalSkips / totalUserPlays : 0;
                }

                // EngagementScore = plays*0.4 + completion*0.3 - skipRate*0.2 + likes*0.1
                const score =
                    Math.min(totalPlays / 100, 1) * 40 +     // normalize plays (cap at 100)
                    avgCompletion * 30 +                       // 0-1 range
                    (1 - skipRate) * 20 +                      // lower skip = better
                    Math.min(likeCount / 50, 1) * 10;         // normalize likes (cap at 50)

                await prisma.track.update({
                    where: { id: track.id },
                    data: { engagement_score: Math.round(score * 100) / 100 }
                });
                updated++;
            }

            const elapsed = Date.now() - startTime;
            console.log(`[Engagement] Updated ${updated} tracks in ${elapsed}ms.`);
        } catch (err) {
            console.error('[Engagement] Score update failed:', err);
        }
    }
}
