import { prisma } from '../utils/prisma';
import { setCacheVal, getCacheVal } from '../utils/cache';

export class TrendingService {
    /**
     * Calculates dynamic trending score for all published tracks using weighted signals & time decay.
     * Signals:
     * - 48-hour stream velocity (Weight: 3.5)
     * - 48-hour unique listeners (Weight: 4.0)
     * - 7-day likes (Weight: 2.5)
     * - Completion rate average (Weight: 2.0)
     * - Skip penalty (Weight: -1.5)
     * - Recency time decay (Half-life decay over 7 days)
     */
    static async updateTrendingScores(): Promise<number> {
        const now = new Date();
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        try {
            // 1. Fetch 48-hour play counts and unique listener counts per track from History
            const recentPlays = await prisma.history.groupBy({
                by: ['trackId'],
                where: { playedAt: { gte: fortyEightHoursAgo } },
                _count: { trackId: true },
            });
            const playMap = new Map<string, number>(recentPlays.map(r => [r.trackId, r._count.trackId]));

            // Unique listeners in 48h
            const recentHistory = await prisma.history.findMany({
                where: { playedAt: { gte: fortyEightHoursAgo } },
                select: { trackId: true, userId: true }
            });
            const listenerMap = new Map<string, Set<string>>();
            recentHistory.forEach(h => {
                if (!listenerMap.has(h.trackId)) listenerMap.set(h.trackId, new Set());
                listenerMap.get(h.trackId)!.add(h.userId);
            });

            // 2. Fetch 7-day like counts
            const recentLikes = await prisma.like.groupBy({
                by: ['trackId'],
                where: { createdAt: { gte: sevenDaysAgo } },
                _count: { trackId: true }
            });
            const likeMap = new Map<string, number>(recentLikes.map(l => [l.trackId, l._count.trackId]));

            // 3. Fetch completion & skip stats from UserTrackStat
            const trackStats = await prisma.userTrackStat.groupBy({
                by: ['trackId'],
                _avg: { completionRateAvg: true },
                _sum: { skipCount: true }
            });
            const completionMap = new Map<string, number>(trackStats.map(s => [s.trackId, s._avg.completionRateAvg || 0]));
            const skipMap = new Map<string, number>(trackStats.map(s => [s.trackId, s._sum.skipCount || 0]));

            // 4. Fetch all published tracks
            const tracks = await prisma.track.findMany({
                where: {
                    deletedAt: null,
                    isUnlisted: false,
                    OR: [
                        { releaseStatus: 'PUBLISHED' },
                        { releaseStatus: 'SCHEDULED', scheduledAt: { lte: now } }
                    ]
                },
                select: { id: true, createdAt: true, engagement_score: true, streams: true }
            });

            const updates: Promise<any>[] = [];

            for (const track of tracks) {
                const plays48h = playMap.get(track.id) || 0;
                const uniqueListeners48h = listenerMap.get(track.id)?.size || 0;
                const likes7d = likeMap.get(track.id) || 0;
                const completionAvg = completionMap.get(track.id) || 0; // 0 to 1
                const skips = skipMap.get(track.id) || 0;

                // Time decay multiplier: 1.0 for new releases, decaying as age increases
                const ageInDays = (now.getTime() - new Date(track.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                const timeDecay = 1 / (1 + Math.pow(ageInDays / 7, 1.2));

                // Raw Weighted Trending Score
                const rawScore =
                    (plays48h * 3.5) +
                    (uniqueListeners48h * 4.0) +
                    (likes7d * 2.5) +
                    (completionAvg * 20.0) -
                    (skips * 1.5) +
                    ((track.engagement_score || 0) * 0.1);

                const finalTrendingScore = Math.max(0, rawScore * timeDecay);

                updates.push(
                    prisma.track.update({
                        where: { id: track.id },
                        data: { trendingScore: finalTrendingScore }
                    })
                );
            }

            await Promise.all(updates);
            await setCacheVal('trending_scores_updated_at', new Date().toISOString(), 300);
            return tracks.length;
        } catch (err) {
            console.error('[TrendingService] Failed to compute trending scores:', err);
            return 0;
        }
    }

    /**
     * Retrieves canonical trending tracks for homepage & section API
     */
    static async getTrendingTracks(limit = 20) {
        const cached = await getCacheVal(`trending_tracks_${limit}`);
        if (cached && Array.isArray(cached)) return cached;

        const tracks = await prisma.track.findMany({
            where: {
                deletedAt: null,
                isUnlisted: false,
                releaseStatus: 'PUBLISHED'
            },
            include: {
                artist: { select: { id: true, name: true, imageUrl: true } },
                album: { select: { id: true, title: true, coverUrl: true, palette: true } }
            },
            orderBy: [
                { trendingScore: 'desc' },
                { engagement_score: 'desc' },
                { streams: 'desc' }
            ],
            take: limit
        });

        const formatted = tracks.map(t => ({
            id: t.id,
            title: t.title,
            coverUrl: t.coverUrl,
            audioUrl: t.audioUrl,
            duration: t.duration,
            genre: t.genre,
            trendingScore: t.trendingScore,
            artist: {
                id: t.artist?.id || '',
                name: t.artist?.name || 'Unknown Artist',
                imageUrl: t.artist?.imageUrl
            },
            album: t.album ? {
                id: t.album.id,
                title: t.album.title,
                coverUrl: t.album.coverUrl,
                palette: t.album.palette
            } : undefined
        }));

        await setCacheVal(`trending_tracks_${limit}`, formatted, 120); // 2 minute cache
        return formatted;
    }
}
