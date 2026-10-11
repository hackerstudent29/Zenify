import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { askAI, DEFAULT_MODEL } from '../utils/ai.js';

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
                select: { country: true, age: true }
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
                    WHERE t."userId" = ${userId}
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
            // LISTENER: Real Personal Analytics & Sonic Persona
            const totalStreamsResult = await prisma.userTrackStat.aggregate({
                _sum: { streamCount: true },
                where: { userId }
            });
            const totalStreams = totalStreamsResult._sum.streamCount || 0;

            if (totalStreams === 0) {
                return {
                    topCountries: [],
                    ageBrackets: {}, // STRICT: No fake numbers when user hasn't listened
                    topGenres: [],
                    aiPersona: null
                };
            }

            // User has actual stream history!
            const topArtists: any[] = await prisma.$queryRaw`
                SELECT a.name, SUM(uts."streamCount") as count
                FROM "UserTrackStat" uts
                JOIN "Track" t ON uts."trackId" = t.id
                JOIN "Artist" a ON t."artistId" = a.id
                WHERE uts."userId" = ${userId} AND uts."streamCount" > 0
                GROUP BY a.name
                ORDER BY count DESC
                LIMIT 3
            `;

            const topGenres: any[] = await prisma.$queryRaw`
                SELECT t.genre, COUNT(h.id) as count
                FROM "History" h
                JOIN "Track" t ON h."trackId" = t.id
                WHERE h."userId" = ${userId} AND t.genre IS NOT NULL
                GROUP BY t.genre
                ORDER BY count DESC
                LIMIT 3
            `;

            // Calculate REAL dynamic vibe metrics from actual listened tracks
            const userTrackStats = await prisma.userTrackStat.findMany({
                where: { userId, streamCount: { gt: 0 } },
                include: {
                    track: {
                        select: {
                            genre: true,
                            bpm: true,
                            duration: true,
                            title: true,
                            aura_vibe: true
                        }
                    }
                },
                take: 50
            });

            let totalWeightedBpm = 0;
            let bpmCount = 0;
            let highEnergyTracks = 0;
            let chillTracks = 0;
            let totalListenSecs = 0;

            userTrackStats.forEach(stat => {
                const plays = stat.streamCount || 1;
                totalListenSecs += stat.totalListenDuration || 0;
                const g = (stat.track?.genre || '').toLowerCase();
                const vibe = (stat.track?.aura_vibe || '').toLowerCase();

                if (stat.track?.bpm && stat.track.bpm > 0) {
                    totalWeightedBpm += stat.track.bpm * plays;
                    bpmCount += plays;
                }

                if (g.includes('dance') || g.includes('edm') || g.includes('rock') || g.includes('hip-hop') || g.includes('rap') || g.includes('pop') || vibe.includes('energetic') || vibe.includes('electric') || (stat.track?.bpm && stat.track.bpm > 125)) {
                    highEnergyTracks += plays;
                } else if (g.includes('ambient') || g.includes('classical') || g.includes('lo-fi') || g.includes('lofi') || g.includes('acoustic') || g.includes('r&b') || g.includes('chill') || vibe.includes('calm') || vibe.includes('chill') || (stat.track?.bpm && stat.track.bpm < 100)) {
                    chillTracks += plays;
                }
            });

            const avgBpm = bpmCount > 0 ? (totalWeightedBpm / bpmCount) : 115;
            const energyPercent = Math.min(95, Math.max(15, Math.round((highEnergyTracks / Math.max(totalStreams, 1)) * 60 + (avgBpm / 150) * 40)));
            const chillPercent = Math.min(95, Math.max(10, Math.round((chillTracks / Math.max(totalStreams, 1)) * 70 + (avgBpm < 110 ? 30 : 10))));
            const moodPercent = Math.min(95, Math.max(25, Math.round(50 + (energyPercent - chillPercent) * 0.3)));
            const avgListenPerStream = totalListenSecs / Math.max(totalStreams, 1);
            const focusPercent = Math.min(95, Math.max(20, Math.round(Math.min(90, (avgListenPerStream / 180) * 80 + 20))));

            const primaryGenre = topGenres[0]?.genre || 'Eclectic';
            const topArtistName = topArtists[0]?.name || 'Favorite Artists';

            let archetype = 'Sonic Explorer';
            if (primaryGenre.toLowerCase().includes('soundtrack') || primaryGenre.toLowerCase().includes('score')) archetype = 'Cinematic Visionary';
            else if (energyPercent > 70) archetype = 'High-Octane Pulse';
            else if (chillPercent > 65) archetype = 'Chillout Alchemist';
            else if (focusPercent > 75) archetype = 'Deep Immersionist';
            else if (primaryGenre) archetype = `${primaryGenre} Devotee`;

            const dominantMood = energyPercent > 65 ? 'Electric' : (chillPercent > 60 ? 'Tranquil' : (focusPercent > 70 ? 'Deep Focus' : 'Reflective'));
            const focusLevel = focusPercent > 75 ? 'Deep' : (focusPercent > 50 ? 'Adaptive' : 'Flow');

            const description = `Based on your recent 30-day activity of ${totalStreams} streams across ${userTrackStats.length} tracks, your taste centers around ${primaryGenre} rhythms and ${topArtistName}. Your listening pattern leans towards ${energyPercent > 60 ? 'high-energy stimulation' : 'melodic tranquility'}, featuring a dominant ${dominantMood.toLowerCase()} resonance.`;

            return {
                topCountries: topArtists.map(a => ({ name: Number(a.count) > 0 ? a.name : 'Unknown Artist', count: Number(a.count) })), 
                ageBrackets: { 
                    'Energy': energyPercent, 
                    'Chill': chillPercent, 
                    'Mood': moodPercent, 
                    'Focus': focusPercent 
                },
                topGenres: topGenres.map(g => g.genre),
                aiPersona: {
                    archetype,
                    description,
                    dominantMood,
                    focusLevel,
                    primaryGenre,
                    topArtist: topArtistName
                }
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
            WHERE uts."userId" = ${userId} AND uts."streamCount" > 0 AND t."deletedAt" IS NULL
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
                },
                tracks: {
                    where: {
                        track: { deletedAt: null }
                    },
                    include: {
                        track: {
                            select: { coverUrl: true }
                        }
                    },
                    orderBy: { addedAt: 'asc' },
                    take: 4
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

    static async generateWeeklyInsight(username: string, stats: { totalDuration: number; topTrackName: string; topArtistName: string; totalStreams: number }): Promise<string> {
        const prompt = `Task: Write a short, personalized weekly listening insight for the user "${username}".
        
        Stats:
        - Total listened duration: ${stats.totalDuration} minutes
        - Total streams: ${stats.totalStreams} tracks
        - Top Track: "${stats.topTrackName}"
        - Top Artist: "${stats.topArtistName}"
        
        Guidelines:
        1. Write exactly one engaging paragraph (2-3 sentences).
        2. Use a cool, audiophile-friendly tone.
        3. Do not use generic greetings like "Hi ${username}". Start right into the insight.
        4. Do not wrap in quotes or markdown.`;

        try {
            return await askAI(prompt, DEFAULT_MODEL);
        } catch (err) {
            console.error('[Analytics] Failed to generate weekly insight:', err);
            return `You had an amazing week of listening, diving deep into ${stats.topArtistName} and discovering new favorites.`;
        }
    }
}
