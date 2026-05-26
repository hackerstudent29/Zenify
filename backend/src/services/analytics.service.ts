import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';

export class AnalyticsService {
    constructor(private server: FastifyInstance) { }

    async getOverallMetrics(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        const isAdmin = user?.email === 'ramzendrum@gmail.com';

        if (isAdmin) {
            const totalReleases = await prisma.track.count({
                where: { 
                    ...(isAdmin ? {} : { userId }), 
                    deletedAt: null 
                }
            });

            const tracks = await prisma.track.findMany({
                where: { 
                    ...(isAdmin ? {} : { userId }), 
                    deletedAt: null 
                },
                select: { streams: true, downloads: true }
            });
            const totalPlays = tracks.reduce((sum, t) => sum + (t.streams || 0), 0);
            const totalDownloads = tracks.reduce((sum, t) => sum + (t.downloads || 0), 0);

            const ratings = await prisma.rating.aggregate({
                _avg: { value: true },
                where: isAdmin ? {} : { track: { userId } }
            });

            return {
                totalReleases,
                totalStreams: totalPlays,
                totalDownloads,
                averageRating: (ratings._avg as any)?.value || 0,
                type: 'ARTIST'
            };
        } else {
            // LISTENER: Personal listening analytics
            const totalStreams = await prisma.userTrackStat.aggregate({
                _sum: { streamCount: true },
                where: { userId }
            });

            const totalMinutes = await prisma.userTrackStat.aggregate({
                _sum: { totalListenDuration: true },
                where: { userId }
            });

            const followingCount = await prisma.artist.count({
                // count unique artists the user has listened to
                where: { tracks: { some: { userStats: { some: { userId } } } } }
            });

            const savesCount = await prisma.like.count({
                where: { userId }
            });

            return {
                totalReleases: followingCount, // Shown as "Artists"
                totalStreams: totalStreams._sum.streamCount || 0,
                totalDownloads: Math.round((totalMinutes._sum.totalListenDuration || 0) / 60), // Shown as "Hours"
                averageRating: savesCount, // Shown as "Saves"
                type: 'LISTENER'
            };
        }
    }

    async getTopTracks(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        const isAdmin = user?.email === 'ramzendrum@gmail.com';

        if (isAdmin) {
            const topTracks = await prisma.track.findMany({
                where: { 
                    ...(isAdmin ? {} : { userId }), 
                    deletedAt: null 
                },
                orderBy: { streams: 'desc' },
                take: 3
            });

            return topTracks.map(track => ({
                id: track.id,
                title: track.title,
                coverUrl: track.coverUrl,
                streams: track.streams,
                downloads: track.downloads || 0,
                engagementRatio: "Artist",
                rating: "Admin"
            }));
        } else {
            const topStats = await prisma.userTrackStat.findMany({
                where: { userId },
                orderBy: { streamCount: 'desc' },
                take: 3,
                include: { track: { include: { artist: true } } }
            });

            return topStats.map(stat => ({
                id: stat.track.id,
                title: stat.track.title,
                coverUrl: stat.track.coverUrl,
                streams: stat.streamCount,
                downloads: stat.totalListenDuration, // Used for minutes in UI
                artistName: stat.track.artist?.name || "Unknown",
                engagementRatio: "Listener",
                rating: "Active"
            }));
        }
    }

    async getActivityTrends(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        const isAdmin = user?.email === 'ramzendrum@gmail.com';

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        if (isAdmin) {
            const history = await prisma.history.findMany({
                where: { 
                    ...(isAdmin ? {} : { track: { userId } }), 
                    playedAt: { gte: thirtyDaysAgo } 
                },
                select: { playedAt: true }
            });
            const map = new Map();
            history.forEach(h => {
                const d = h.playedAt.toISOString().split('T')[0];
                map.set(d, (map.get(d) || 0) + 1);
            });
            const trends = [];
            for (let i = 29; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                trends.push(map.get(d.toISOString().split('T')[0]) || 0);
            }
            return trends;
        } else {
            // LISTENER: Show minutes listened per day from UserDailyStat (Accurate real-time tracking)
            const stats = await prisma.userDailyStat.findMany({
                where: { userId, date: { gte: thirtyDaysAgo } },
                select: { date: true, minutesListened: true }
            });
            const map = new Map();
            stats.forEach(s => {
                const d = s.date.toISOString().split('T')[0];
                map.set(d, s.minutesListened);
            });
            const trends = [];
            for (let i = 29; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                trends.push(map.get(d.toISOString().split('T')[0]) || 0);
            }
            return trends;
        }
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
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        const isAdmin = user?.email === 'ramzendrum@gmail.com';

        if (isAdmin) {
            const listeners = await prisma.user.findMany({
                where: { 
                    history: { 
                        some: { 
                            ...(isAdmin ? {} : { track: { userId } }) 
                        } 
                    } 
                },
                include: { preferences: true }
            });
            const countries: Record<string, number> = {};
            const ageBrackets: Record<string, number> = { '18-24': 0, '25-34': 0, '35-44': 0, '45+': 0, 'Unknown': 0 };

            listeners.forEach((l: any) => {
                const c = l.country || 'Unknown';
                countries[c] = (countries[c] || 0) + 1;
                if (!l.age) ageBrackets['Unknown']++;
                else if (l.age <= 24) ageBrackets['18-24']++;
                else if (l.age <= 34) ageBrackets['25-34']++;
                else if (l.age <= 44) ageBrackets['35-44']++;
                else ageBrackets['45+']++;
            });

            const genreStats: any[] = isAdmin 
                ? await prisma.$queryRaw`
                    SELECT t.genre, COUNT(h.id) as count
                    FROM "History" h
                    JOIN "Track" t ON h."trackId" = t.id
                    WHERE t.genre IS NOT NULL
                    GROUP BY t.genre
                    ORDER BY count DESC
                    LIMIT 3
                `
                : await prisma.$queryRaw`
                    SELECT t.genre, COUNT(h.id) as count
                    FROM "History" h
                    JOIN "Track" t ON h."trackId" = t.id
                    WHERE t."userId" = CAST(${userId} AS uuid)
                    AND t.genre IS NOT NULL
                    GROUP BY t.genre
                    ORDER BY count DESC
                    LIMIT 3
                `;

            return {
                topCountries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => ({ name: e[0], count: e[1] })),
                ageBrackets,
                topGenres: genreStats.map(g => g.genre)
            };
        } else {
            // LISTENER: Top Artists and Genre trends
            const topArtists: any[] = await prisma.$queryRaw`
                SELECT a.name, SUM(uts."streamCount") as count
                FROM "UserTrackStat" uts
                JOIN "Track" t ON uts."trackId" = t.id
                JOIN "Artist" a ON t."artistId" = a.id
                WHERE uts."userId" = CAST(${userId} AS uuid)
                GROUP BY a.name
                ORDER BY count DESC
                LIMIT 3
            `;

            const topGenres: any[] = await prisma.$queryRaw`
                SELECT t.genre, COUNT(h.id) as count
                FROM "History" h
                JOIN "Track" t ON h."trackId" = t.id
                WHERE h."userId" = CAST(${userId} AS uuid) AND t.genre IS NOT NULL
                GROUP BY t.genre
                ORDER BY count DESC
                LIMIT 3
            `;

            return {
                topCountries: topArtists.map(a => ({ name: Number(a.count) > 0 ? a.name : 'Unknown Artist', count: Number(a.count) })), 
                ageBrackets: { 'Energy': 85, 'Chill': 40, 'Mood': 65, 'Focus': 90 }, // AI-style mood metrics
                topGenres: topGenres.map(g => g.genre)
            };
        }
    }

    async getLibraryOverview(userId: string) {
        // 1. Most played songs
        const topTracksData = await prisma.userTrackStat.findMany({
            where: {
                userId,
                streamCount: { gt: 0 },
                track: { deletedAt: null }
            },
            orderBy: { streamCount: 'desc' },
            take: 6,
            include: { track: { include: { artist: true, album: true } } }
        });
        const topTracks = topTracksData.map(stat => stat.track);

        // 2. Most listened artists
        const topArtists: any = await prisma.$queryRaw`
            SELECT a.id, a.name, a."imageUrl", SUM(uts."streamCount") as "totalStreams"
            FROM "UserTrackStat" uts
            JOIN "Track" t ON uts."trackId" = t.id
            JOIN "Artist" a ON t."artistId" = a.id
            WHERE uts."userId" = CAST(${userId} AS uuid) AND uts."streamCount" > 0 AND t."deletedAt" IS NULL
            GROUP BY a.id, a.name, a."imageUrl"
            ORDER BY "totalStreams" DESC
            LIMIT 6
        `;
        // Convert BigInt totalStreams to Number
        const topArtistsFormatted = topArtists.map((a: any) => ({
            ...a,
            totalPlays: Number(a.totalStreams)
        }));

        // 3. Playlists created by user
        const playlists = await prisma.playlist.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 6,
            include: {
                _count: {
                    select: { tracks: true }
                }
            }
        });

        // 4. Recent albums from user's history
        const albumTracksData = await prisma.history.findMany({
            where: { 
                userId,
                track: { albumId: { not: null }, deletedAt: null } 
            },
            orderBy: { playedAt: 'desc' },
            take: 100,
            include: { track: { include: { album: { include: { artist: true } } } } }
        });

        const dedupAlbums = new Map();
        for (const history of albumTracksData) {
            const album = history.track.album;
            if (album && !dedupAlbums.has(album.id)) {
                dedupAlbums.set(album.id, album);
            }
        }
        let recentAlbums = Array.from(dedupAlbums.values()).slice(0, 6);

        // Fallback to top albums system-wide if no history
        if (recentAlbums.length === 0) {
            recentAlbums = await prisma.album.findMany({
                orderBy: { popularity_score: 'desc' },
                take: 6,
                include: { artist: true }
            });
        }

        return {
            topTracks,
            topArtists: topArtistsFormatted,
            playlists,
            recentAlbums
        };
    }
}
