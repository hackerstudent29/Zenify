import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';

export class AnalyticsService {
    constructor(private server: FastifyInstance) { }

    async getOverallMetrics(userId: string) {
        // 1. Total Releases
        const totalReleases = await prisma.track.count({
            where: { userId, deletedAt: null }
        });

        // 2. Total Plays & Downloads
        const tracks = await prisma.track.findMany({
            where: { userId, deletedAt: null },
            select: { plays: true, downloads: true }
        });
        const totalPlays = tracks.reduce((sum, t) => sum + (t.plays || 0), 0);
        const totalDownloads = tracks.reduce((sum, t) => sum + (t.downloads || 0), 0);

        // 3. Average Rating
        const ratings = await prisma.rating.aggregate({
            _avg: { value: true },
            where: {
                track: { userId }
            }
        });

        return {
            totalReleases,
            totalPlays,
            totalDownloads,
            averageRating: (ratings._avg as any)?.value || 0
        };
    }

    async getTopTracks(userId: string) {
        const topTracks = await prisma.track.findMany({
            where: { userId, deletedAt: null },
            orderBy: { plays: 'desc' },
            take: 3,
            include: {
                ratings: {
                    select: { value: true }
                }
            }
        });

        return topTracks.map(track => {
            const ratingsArray = (track as any).ratings || [];
            const avgRating = ratingsArray.length > 0
                ? ratingsArray.reduce((sum: number, r: any) => sum + r.value, 0) / ratingsArray.length
                : 0;

            return {
                id: track.id,
                title: track.title,
                coverUrl: track.coverUrl,
                plays: track.plays,
                downloads: track.downloads || 0,
                engagementRatio: track.plays > 0 ? ((track.downloads || 0) / track.plays).toFixed(2) : "0.00",
                rating: avgRating.toFixed(1)
            };
        });
    }

    async getActivityTrends(userId: string) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const history = await prisma.history.findMany({
            where: {
                track: { userId },
                playedAt: { gte: thirtyDaysAgo }
            },
            select: { playedAt: true }
        });

        const activityMap = new Map<string, number>();
        history.forEach(h => {
            const date = h.playedAt.toISOString().split('T')[0];
            activityMap.set(date, (activityMap.get(date) || 0) + 1);
        });

        const trends = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            trends.push(activityMap.get(dateStr) || 0);
        }

        return trends;
    }

    async getRecentFeedback(userId: string) {
        return prisma.rating.findMany({
            where: {
                track: { userId },
                comment: { not: null }
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { name: true, username: true, avatarUrl: true }
                },
                track: {
                    select: { title: true }
                }
            }
        });
    }

    async getListenerDemographics(userId: string) {
        const listeners = await prisma.user.findMany({
            where: {
                history: {
                    some: {
                        track: { userId }
                    }
                }
            },
            include: {
                preferences: true
            }
        });

        const countries: Record<string, number> = {};
        const ageBrackets: Record<string, number> = { '18-24': 0, '25-34': 0, '35-44': 0, '45+': 0, 'Unknown': 0 };
        const genres: Record<string, number> = {};

        listeners.forEach((l: any) => {
            const c = l.country || 'Unknown';
            countries[c] = (countries[c] || 0) + 1;

            if (!l.age) ageBrackets['Unknown']++;
            else if (l.age <= 24) ageBrackets['18-24']++;
            else if (l.age <= 34) ageBrackets['25-34']++;
            else if (l.age <= 44) ageBrackets['35-44']++;
            else ageBrackets['45+']++;

            l.preferences?.preferredGenres.forEach((g: string) => {
                genres[g] = (genres[g] || 0) + 1;
            });
        });

        const topGenres = Object.entries(genres)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(e => e[0]);

        const topCountries = Object.entries(countries)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(e => e[0]);

        return {
            topCountries,
            ageBrackets,
            topGenres
        };
    }
}
