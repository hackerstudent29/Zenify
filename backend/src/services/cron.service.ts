import cron from 'node-cron';
import { prisma } from '../utils/prisma.js';
import { MailService } from './mail.service.js';
import { AnalyticsService } from './analytics.service.js';

export class CronService {
    static init() {
        // Run every Monday at 9:00 AM
        cron.schedule('0 9 * * 1', async () => {
            console.log('[Cron] Starting Weekly Summary Emails job...');
            await CronService.sendWeeklySummaries();
        });
        console.log('[Cron] Cron jobs initialized.');
    }

    static async sendWeeklySummaries() {
        try {
            console.log('[Cron] Starting Weekly Summary Emails job...');
            // Find users who have weekly summary enabled
            const users = await prisma.user.findMany({
                where: {
                    preferences: {
                        weeklySummaryEmail: true
                    }
                },
                include: { preferences: true }
            });

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const now = new Date();

            for (const user of users) {
                if (!user.email || !user.name) continue;

                // 1. Total listening time (minutes) from UserDailyStat
                const dailyStats = await prisma.userDailyStat.findMany({
                    where: { userId: user.id, date: { gte: sevenDaysAgo } }
                });
                const totalDuration = dailyStats.reduce((sum, stat) => sum + stat.minutesListened, 0);

                // 2. Fetch history records in the last 7 days
                const historyLastWeek = await prisma.history.findMany({
                    where: { userId: user.id, playedAt: { gte: sevenDaysAgo } },
                    orderBy: { playedAt: 'asc' },
                    include: { track: { select: { duration: true, title: true, coverUrl: true, artistId: true } } }
                });

                const totalStreams = historyLastWeek.length;
                const uniqueTracksHeard = new Set(historyLastWeek.map(h => h.trackId)).size;

                // 3. New songs discovered (played for first time ever in last 7 days)
                const recentTrackIds = Array.from(new Set(historyLastWeek.map(h => h.trackId)));
                let newSongsDiscovered = 0;
                for (const trackId of recentTrackIds) {
                    const playBefore = await prisma.history.findFirst({
                        where: {
                            userId: user.id,
                            trackId,
                            playedAt: { lt: sevenDaysAgo }
                        }
                    });
                    if (!playBefore) {
                        newSongsDiscovered++;
                    }
                }

                // 4. Favorites count (liked in last 7 days)
                const favoritesCount = await prisma.like.count({
                    where: { userId: user.id, createdAt: { gte: sevenDaysAgo } }
                });

                // 5. Longest session calculation
                let longestSessionDuration = 0; // in seconds
                let longestSessionDay = '';
                if (historyLastWeek.length > 0) {
                    let currentSessionDuration = historyLastWeek[0].track.duration || 180;
                    let currentSessionStart = historyLastWeek[0].playedAt;
                    let lastPlayTime = historyLastWeek[0].playedAt.getTime() + (currentSessionDuration * 1000);

                    for (let i = 1; i < historyLastWeek.length; i++) {
                        const play = historyLastWeek[i];
                        const playTime = play.playedAt.getTime();
                        const dur = play.track.duration || 180;

                        // Session continues if gap is less than 30 mins
                        if (playTime - lastPlayTime < 30 * 60 * 1000) {
                            currentSessionDuration += dur;
                            lastPlayTime = playTime + (dur * 1000);
                        } else {
                            if (currentSessionDuration > longestSessionDuration) {
                                longestSessionDuration = currentSessionDuration;
                                longestSessionDay = currentSessionStart.toLocaleDateString('en-IN', { weekday: 'long' });
                            }
                            currentSessionDuration = dur;
                            currentSessionStart = play.playedAt;
                            lastPlayTime = playTime + (dur * 1000);
                        }
                    }
                    if (currentSessionDuration > longestSessionDuration) {
                        longestSessionDuration = currentSessionDuration;
                        longestSessionDay = currentSessionStart.toLocaleDateString('en-IN', { weekday: 'long' });
                    }
                }
                const sessionHours = Math.floor(longestSessionDuration / 3600);
                const sessionMins = Math.floor((longestSessionDuration % 3600) / 60);
                const longestSessionStr = longestSessionDuration > 0
                    ? (sessionHours > 0 ? `${sessionHours} hrs ${sessionMins} mins on ${longestSessionDay}` : `${sessionMins} mins on ${longestSessionDay}`)
                    : 'N/A';

                // 6. Top 5 Most Played This Week
                const trackPlays: Record<string, { count: number; duration: number; trackId: string }> = {};
                for (const h of historyLastWeek) {
                    if (!trackPlays[h.trackId]) {
                        trackPlays[h.trackId] = { count: 0, duration: 0, trackId: h.trackId };
                    }
                    trackPlays[h.trackId].count++;
                    trackPlays[h.trackId].duration += h.track.duration || 180;
                }
                const top5TrackData = Object.values(trackPlays)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);

                const top5Tracks = [];
                for (const item of top5TrackData) {
                    const fullTrack = await prisma.track.findUnique({
                        where: { id: item.trackId },
                        include: { artist: true }
                    });
                    if (fullTrack) {
                        top5Tracks.push({
                            title: fullTrack.title,
                            coverUrl: fullTrack.coverUrl,
                            artistName: fullTrack.artist?.name || 'Unknown Artist',
                            playCount: item.count,
                            durationMins: Math.round(item.duration / 60)
                        });
                    }
                }

                // 7. Top 3 Artists This Week
                const artistPlays: Record<string, { count: number; duration: number; artistId: string }> = {};
                for (const h of historyLastWeek) {
                    const artistId = h.track.artistId;
                    if (artistId) {
                        if (!artistPlays[artistId]) {
                            artistPlays[artistId] = { count: 0, duration: 0, artistId };
                        }
                        artistPlays[artistId].count++;
                        artistPlays[artistId].duration += h.track.duration || 180;
                    }
                }
                const top3ArtistData = Object.values(artistPlays)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3);

                const top3Artists = [];
                for (const item of top3ArtistData) {
                    const artist = await prisma.artist.findUnique({ where: { id: item.artistId } });
                    if (artist) {
                        top3Artists.push({
                            name: artist.name,
                            imageUrl: artist.imageUrl || '',
                            playCount: item.count,
                            durationMins: Math.round(item.duration / 60)
                        });
                    }
                }

                // 8. New Favorites List
                const newLikes = await prisma.like.findMany({
                    where: { userId: user.id, createdAt: { gte: sevenDaysAgo } },
                    include: { track: { include: { artist: true } } },
                    orderBy: { createdAt: 'desc' }
                });
                const newFavourites = newLikes.map(like => ({
                    title: like.track.title,
                    coverUrl: like.track.coverUrl || '',
                    artistName: like.track.artist?.name || 'Unknown Artist',
                    addedAt: like.createdAt
                }));

                // 9. User released songs this week
                const releasedSongs = await prisma.track.findMany({
                    where: {
                        userId: user.id,
                        releaseStatus: 'PUBLISHED',
                        createdAt: { gte: sevenDaysAgo },
                        deletedAt: null
                    },
                    select: { id: true, title: true, createdAt: true }
                });

                // 10. User scheduled releases
                const scheduledSongs = await prisma.track.findMany({
                    where: {
                        userId: user.id,
                        releaseStatus: 'SCHEDULED',
                        scheduledAt: { gt: now },
                        deletedAt: null
                    },
                    select: { id: true, title: true, scheduledAt: true }
                });

                // 11. Subscriptions
                const subscription = await prisma.subscription.findUnique({
                    where: { userId: user.id }
                });

                // 12. New Releases from Followed Artists
                const userTrackStats = await prisma.userTrackStat.findMany({
                    where: { userId: user.id },
                    select: { track: { select: { artistId: true } } }
                });
                const listenedArtistIds = Array.from(new Set(userTrackStats.map(s => s.track?.artistId).filter(Boolean)));
                const newReleasesFromFollowed = await prisma.track.findMany({
                    where: {
                        artistId: { in: listenedArtistIds as string[] },
                        releaseStatus: 'PUBLISHED',
                        createdAt: { gte: sevenDaysAgo },
                        deletedAt: null
                    },
                    include: { artist: true },
                    orderBy: { createdAt: 'desc' },
                    take: 5
                });

                // If completely inactive, skip
                if (totalDuration === 0 && totalStreams === 0 && favoritesCount === 0 && releasedSongs.length === 0 && scheduledSongs.length === 0) {
                    continue;
                }

                const topTrackObj = top5Tracks.length > 0 ? top5Tracks[0] : null;
                const topArtistObj = top3Artists.length > 0 ? top3Artists[0] : null;

                // 13. Generate AI Insight
                const insight = await AnalyticsService.generateWeeklyInsight(user.name, {
                    totalDuration,
                    topTrackName: topTrackObj?.title || 'Unknown',
                    topArtistName: topArtistObj?.name || 'Unknown',
                    totalStreams
                });

                // 14. Send email
                await MailService.sendWeeklySummary(user.email, user.name, {
                    totalDuration,
                    topTrack: topTrackObj,
                    topArtist: topArtistObj,
                    totalStreams,
                    insight,
                    favoritesCount,
                    releasedSongsCount: releasedSongs.length,
                    uniqueTracksHeard,
                    newSongsDiscovered,
                    longestSessionStr,
                    top5Tracks,
                    top3Artists,
                    newFavourites,
                    releasedSongs,
                    scheduledSongs,
                    newReleasesFromFollowed,
                    subscription
                });
            }
            console.log('[Cron] Weekly Summary Emails job completed successfully.');
        } catch (error) {
            console.error('[Cron] Error running Weekly Summary Emails job:', error);
        }
    }
}
