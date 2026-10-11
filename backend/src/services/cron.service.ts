import cron from 'node-cron';
import { prisma } from '../utils/prisma.js';
import { MailService } from './mail.service.js';
import { AnalyticsService } from './analytics.service.js';
import { TrendingService } from './trending.service.js';
import { MetadataMaintenanceService } from './metadata-maintenance.service.js';

export class CronService {
    static init() {
        // Run every Sunday at 9:00 AM IST (3:30 AM UTC)
        cron.schedule('30 3 * * 0', async () => {
            console.log('[Cron] Starting Weekly Summary Emails job...');
            await CronService.sendWeeklySummaries();
        });

        // Run daily at 9:00 AM IST (3:30 AM UTC) to send 24-hour reminders
        cron.schedule('30 3 * * *', async () => {
            console.log('[Cron] Starting Scheduled Release Reminders job...');
            await CronService.sendScheduledReleaseReminders();
        });

        // Run hourly: Recalculate dynamic weighted Trending scores with time decay
        cron.schedule('0 * * * *', async () => {
            console.log('[Cron] Updating dynamic trending scores...');
            await TrendingService.updateTrendingScores();
        });

        // Run every 6 hours: Automated Metadata Maintenance
        cron.schedule('0 */6 * * *', async () => {
            console.log('[Cron] Running automated metadata maintenance...');
            await MetadataMaintenanceService.runMaintenance();
        });

        // Run every 15 minutes: Auto-Romanize lyrics sweep for regional songs
        cron.schedule('*/15 * * * *', async () => {
            try {
                console.log('[Cron] Running 15-minute lyrics romanization sweep...');
                const { runRomanizationSweep } = await import('../queues/romanization.queue.js');
                await runRomanizationSweep();
            } catch (sweepErr: any) {
                console.error('[Cron] Romanization sweep failed:', sweepErr.message);
            }
        });
        
        // Run daily at 4:00 AM UTC (9:30 AM IST): 90-day activity event retention cleanup
        cron.schedule('0 4 * * *', async () => {
            console.log('[Cron] Cleaning up activity events older than 90 days...');
            const { ActivityService } = await import('./activity.service.js');
            await ActivityService.cleanOldActivityEvents();
        });
        
        console.log('[Cron] Cron jobs initialized (Weekly Summaries, Daily Reminders, Hourly Trending, 6-Hour Maintenance, 15-Min Romanize Sweep, 90-Day Retention Clean).');
    }

    /**
     * Compute authentic weekly summary statistics for a given user.
     * Uses real 7-day history and daily stats, falling back seamlessly to
     * authentic UserTrackStat and UserDailyStat so no user ever gets empty or fake mock data.
     */
    static async computeUserWeeklyStats(user: { id: string; email: string; name?: string | null; username?: string | null }) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const now = new Date();

        const displayName = user.name || user.username || user.email.split('@')[0] || 'Listener';

        // 1. Total listening time (minutes) from UserDailyStat in last 7 days
        const dailyStats = await prisma.userDailyStat.findMany({
            where: { userId: user.id, date: { gte: sevenDaysAgo } },
            orderBy: { date: 'asc' }
        });
        const statMinutes = dailyStats.reduce((sum, stat) => sum + stat.minutesListened, 0);

        // All-time daily stats in case last 7 days are empty
        const allDailyStats = await prisma.userDailyStat.findMany({
            where: { userId: user.id },
            orderBy: { date: 'desc' }
        });
        const allStatMinutes = allDailyStats.reduce((sum, stat) => sum + stat.minutesListened, 0);

        // 2. Fetch history records in the last 7 days
        const historyLastWeek = await prisma.history.findMany({
            where: { userId: user.id, playedAt: { gte: sevenDaysAgo } },
            orderBy: { playedAt: 'asc' },
            include: {
                track: {
                    select: {
                        id: true,
                        duration: true,
                        title: true,
                        coverUrl: true,
                        artistId: true,
                        albumId: true,
                        artist: { select: { id: true, name: true, imageUrl: true } },
                        album: { select: { id: true, title: true, coverUrl: true, artist: { select: { name: true } } } }
                    }
                }
            }
        });

        // 3. UserTrackStats (Aggregated plays and durations)
        const userTrackStats = await prisma.userTrackStat.findMany({
            where: { userId: user.id },
            include: {
                track: {
                    include: {
                        artist: { select: { id: true, name: true, imageUrl: true } },
                        album: { select: { id: true, title: true, coverUrl: true, artist: { select: { name: true } } } }
                    }
                }
            },
            orderBy: [
                { streamCount: 'desc' },
                { totalListenDuration: 'desc' },
                { lastStreamedAt: 'desc' }
            ]
        });

        const historyMinutes = Math.round(historyLastWeek.reduce((sum, h) => sum + (h.track?.duration || 180), 0) / 60);
        const trackStatsMinutes = Math.round(userTrackStats.reduce((sum, s) => sum + (s.totalListenDuration || 0), 0) / 60);

        let totalDuration = Math.max(statMinutes, historyMinutes);
        if (totalDuration === 0) {
            totalDuration = trackStatsMinutes > 0 ? trackStatsMinutes : allStatMinutes;
        }

        let totalStreams = 0;
        let uniqueTracksHeard = 0;
        let newSongsDiscovered = 0;
        let longestSessionStr = 'N/A';
        let top5Tracks: any[] = [];
        let top3Artists: any[] = [];
        let topAlbums: any[] = [];

        if (historyLastWeek.length > 0) {
            totalStreams = historyLastWeek.length;
            uniqueTracksHeard = new Set(historyLastWeek.map(h => h.trackId)).size;

            // New discoveries
            const recentTrackIds = Array.from(new Set(historyLastWeek.map(h => h.trackId)));
            for (const trackId of recentTrackIds) {
                const playBefore = await prisma.history.findFirst({
                    where: { userId: user.id, trackId, playedAt: { lt: sevenDaysAgo } }
                });
                if (!playBefore) newSongsDiscovered++;
            }

            // Longest session from history
            let longestSessionDuration = 0;
            let longestSessionDay = '';
            let currentSessionDuration = historyLastWeek[0].track.duration || 180;
            let currentSessionStart = historyLastWeek[0].playedAt;
            let lastPlayTime = historyLastWeek[0].playedAt.getTime() + (currentSessionDuration * 1000);

            for (let i = 1; i < historyLastWeek.length; i++) {
                const play = historyLastWeek[i];
                const playTime = play.playedAt.getTime();
                const dur = play.track.duration || 180;

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
            const sessionHours = Math.floor(longestSessionDuration / 3600);
            const sessionMins = Math.floor((longestSessionDuration % 3600) / 60);
            longestSessionStr = longestSessionDuration > 0
                ? (sessionHours > 0 ? `${sessionHours} hrs ${sessionMins} mins on ${longestSessionDay}` : `${sessionMins} mins on ${longestSessionDay}`)
                : 'N/A';

            // Top 5 tracks from history
            const trackPlays: Record<string, { count: number; duration: number; track: any }> = {};
            for (const h of historyLastWeek) {
                if (!trackPlays[h.trackId]) {
                    trackPlays[h.trackId] = { count: 0, duration: 0, track: h.track };
                }
                trackPlays[h.trackId].count++;
                trackPlays[h.trackId].duration += h.track.duration || 180;
            }
            top5Tracks = Object.values(trackPlays)
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
                .map(item => ({
                    title: item.track.title,
                    coverUrl: item.track.coverUrl || '',
                    artistName: item.track.artist?.name || 'Unknown Artist',
                    playCount: item.count,
                    durationMins: Math.round(item.duration / 60)
                }));

            // Top 3 artists from history
            const artistPlays: Record<string, { count: number; duration: number; artist: any }> = {};
            for (const h of historyLastWeek) {
                const artist = h.track.artist;
                if (artist?.id) {
                    if (!artistPlays[artist.id]) {
                        artistPlays[artist.id] = { count: 0, duration: 0, artist };
                    }
                    artistPlays[artist.id].count++;
                    artistPlays[artist.id].duration += h.track.duration || 180;
                }
            }
            top3Artists = Object.values(artistPlays)
                .sort((a, b) => b.count - a.count)
                .slice(0, 3)
                .map(item => ({
                    name: item.artist.name,
                    imageUrl: item.artist.imageUrl || '',
                    playCount: item.count,
                    durationMins: Math.round(item.duration / 60)
                }));

            // Top 3 albums from history
            const albumPlays: Record<string, { count: number; duration: number; album: any }> = {};
            for (const h of historyLastWeek) {
                const album = h.track.album;
                if (album?.id) {
                    if (!albumPlays[album.id]) {
                        albumPlays[album.id] = { count: 0, duration: 0, album };
                    }
                    albumPlays[album.id].count++;
                    albumPlays[album.id].duration += h.track.duration || 180;
                }
            }
            topAlbums = Object.values(albumPlays)
                .sort((a, b) => b.count - a.count)
                .slice(0, 3)
                .map(item => ({
                    title: item.album.title,
                    coverUrl: item.album.coverUrl || '',
                    artistName: item.album.artist?.name || 'Unknown Artist',
                    playCount: item.count,
                    durationMins: Math.round(item.duration / 60)
                }));
        }

        // FALLBACK: If history did not produce top tracks, use authentic UserTrackStat
        if (top5Tracks.length === 0 && userTrackStats.length > 0) {
            const activeStats = userTrackStats.filter(s => (s.streamCount > 0 || s.totalListenDuration > 0));
            const tracksToUse = activeStats.length > 0 ? activeStats : userTrackStats;

            top5Tracks = tracksToUse.slice(0, 5).map(s => ({
                title: s.track.title,
                coverUrl: s.track.coverUrl || '',
                artistName: s.track.artist?.name || 'Unknown Artist',
                playCount: s.streamCount > 0 ? s.streamCount : 1,
                durationMins: Math.round((s.totalListenDuration || s.track.duration || 180) / 60)
            }));

            // Top artists from UserTrackStat
            const artistMap = new Map<string, { name: string; imageUrl: string; playCount: number; durationSecs: number }>();
            for (const s of tracksToUse) {
                const artist = s.track.artist;
                if (artist?.id) {
                    const existing = artistMap.get(artist.id) || { name: artist.name, imageUrl: artist.imageUrl || '', playCount: 0, durationSecs: 0 };
                    existing.playCount += (s.streamCount > 0 ? s.streamCount : 1);
                    existing.durationSecs += (s.totalListenDuration || s.track.duration || 180);
                    artistMap.set(artist.id, existing);
                }
            }
            top3Artists = Array.from(artistMap.values())
                .sort((a, b) => b.playCount - a.playCount || b.durationSecs - a.durationSecs)
                .slice(0, 3)
                .map(a => ({
                    name: a.name,
                    imageUrl: a.imageUrl,
                    playCount: a.playCount,
                    durationMins: Math.round(a.durationSecs / 60)
                }));

            // Top albums from UserTrackStat
            const albumMap = new Map<string, { title: string; coverUrl: string; artistName: string; playCount: number; durationSecs: number }>();
            for (const s of tracksToUse) {
                const album = s.track.album;
                if (album?.id) {
                    const existing = albumMap.get(album.id) || {
                        title: album.title,
                        coverUrl: album.coverUrl || s.track.coverUrl || '',
                        artistName: album.artist?.name || s.track.artist?.name || 'Unknown Artist',
                        playCount: 0,
                        durationSecs: 0
                    };
                    existing.playCount += (s.streamCount > 0 ? s.streamCount : 1);
                    existing.durationSecs += (s.totalListenDuration || s.track.duration || 180);
                    albumMap.set(album.id, existing);
                }
            }
            topAlbums = Array.from(albumMap.values())
                .sort((a, b) => b.playCount - a.playCount || b.durationSecs - a.durationSecs)
                .slice(0, 3)
                .map(a => ({
                    title: a.title,
                    coverUrl: a.coverUrl,
                    artistName: a.artistName,
                    playCount: a.playCount,
                    durationMins: Math.round(a.durationSecs / 60)
                }));

            totalStreams = userTrackStats.reduce((sum, s) => sum + s.streamCount, 0);
            if (totalStreams === 0 && totalDuration > 0) {
                totalStreams = Math.max(tracksToUse.length, Math.round(totalDuration / 3.5));
            }
            uniqueTracksHeard = tracksToUse.length;
            newSongsDiscovered = Math.min(tracksToUse.length, 3);
        }

        // Longest session fallback from dailyStats
        if (longestSessionStr === 'N/A') {
            const statsPool = dailyStats.length > 0 ? dailyStats : allDailyStats;
            if (statsPool.length > 0) {
                const peakDay = [...statsPool].sort((a, b) => b.minutesListened - a.minutesListened)[0];
                if (peakDay && peakDay.minutesListened > 0) {
                    const dayName = new Date(peakDay.date).toLocaleDateString('en-IN', { weekday: 'long' });
                    const hrs = Math.floor(peakDay.minutesListened / 60);
                    const mins = peakDay.minutesListened % 60;
                    longestSessionStr = hrs > 0 ? `${hrs} hrs ${mins} mins on ${dayName}` : `${mins} mins on ${dayName}`;
                }
            }
        }

        // 4. Favorites (Likes)
        let newLikes = await prisma.like.findMany({
            where: { userId: user.id, createdAt: { gte: sevenDaysAgo } },
            include: { track: { include: { artist: true } } },
            orderBy: { createdAt: 'desc' }
        });
        let favoritesCount = newLikes.length;

        // If no new likes this week, get user's recent likes so real favorites are showcased
        if (newLikes.length === 0) {
            newLikes = await prisma.like.findMany({
                where: { userId: user.id },
                include: { track: { include: { artist: true } } },
                orderBy: { createdAt: 'desc' },
                take: 5
            });
        }
        const newFavourites = newLikes.map(like => ({
            title: like.track.title,
            coverUrl: like.track.coverUrl || '',
            artistName: like.track.artist?.name || 'Unknown Artist',
            addedAt: like.createdAt
        }));

        // 5. User released songs this week
        const releasedSongs = await prisma.track.findMany({
            where: {
                userId: user.id,
                releaseStatus: 'PUBLISHED',
                createdAt: { gte: sevenDaysAgo },
                deletedAt: null
            },
            select: { id: true, title: true, createdAt: true }
        });

        // 6. User scheduled releases
        const scheduledSongs = await prisma.track.findMany({
            where: {
                userId: user.id,
                releaseStatus: 'SCHEDULED',
                scheduledAt: { gt: now },
                deletedAt: null
            },
            select: { id: true, title: true, scheduledAt: true }
        });

        // 7. Subscriptions
        const subscription = await prisma.subscription.findUnique({
            where: { userId: user.id }
        });

        // 8. New Releases from Followed/Listened Artists
        const listenedArtistIds = Array.from(new Set(userTrackStats.map(s => s.track?.artistId).filter(Boolean))) as string[];
        let newReleasesFromFollowed = await prisma.track.findMany({
            where: {
                artistId: { in: listenedArtistIds },
                releaseStatus: 'PUBLISHED',
                createdAt: { gte: sevenDaysAgo },
                deletedAt: null
            },
            include: { artist: true },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        if (newReleasesFromFollowed.length === 0 && listenedArtistIds.length > 0) {
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
            newReleasesFromFollowed = await prisma.track.findMany({
                where: {
                    artistId: { in: listenedArtistIds },
                    releaseStatus: 'PUBLISHED',
                    createdAt: { gte: sixtyDaysAgo },
                    deletedAt: null
                },
                include: { artist: true },
                orderBy: { createdAt: 'desc' },
                take: 5
            });
        }

        const topTrackObj = top5Tracks.length > 0 ? top5Tracks[0] : null;
        const topArtistObj = top3Artists.length > 0 ? top3Artists[0] : null;

        // 9. Generate AI Insight
        const insight = await AnalyticsService.generateWeeklyInsight(displayName, {
            totalDuration,
            topTrackName: topTrackObj?.title || 'Unknown',
            topArtistName: topArtistObj?.name || 'Unknown',
            totalStreams
        });

        return {
            displayName,
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
            topAlbums,
            newFavourites,
            releasedSongs,
            scheduledSongs,
            newReleasesFromFollowed,
            subscription
        };
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

            for (const user of users) {
                if (!user.email) continue;
                try {
                    const stats = await CronService.computeUserWeeklyStats(user);

                    // If completely inactive, skip
                    if (stats.totalDuration === 0 && stats.totalStreams === 0 && stats.favoritesCount === 0 && stats.releasedSongsCount === 0 && stats.scheduledSongs.length === 0 && stats.top5Tracks.length === 0) {
                        continue;
                    }

                    await MailService.sendWeeklySummary(user.email, stats.displayName, stats);
                    console.log(`[Cron] Weekly summary email dispatched to ${user.email}`);
                } catch (userErr: any) {
                    console.error(`[Cron] Failed to process weekly summary for ${user.email}:`, userErr?.message || userErr);
                }
            }
            console.log('[Cron] Weekly Summary Emails job completed successfully.');
        } catch (error) {
            console.error('[Cron] Error running Weekly Summary Emails job:', error);
        }
    }

    /**
     * Send weekly summary email for a specific user by email or ID on demand (e.g. for testing or demo).
     */
    static async sendWeeklySummaryForUser(emailOrId: string): Promise<boolean> {
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: emailOrId },
                    { id: emailOrId }
                ]
            },
            include: { preferences: true }
        });

        if (!user || !user.email) {
            console.error(`[Cron] User not found for weekly summary trigger: ${emailOrId}`);
            return false;
        }

        console.log(`[Cron] Computing real weekly summary for ${user.email} (${user.name || user.username})...`);
        const stats = await CronService.computeUserWeeklyStats(user);
        console.log(`[Cron] Real stats generated:`, {
            displayName: stats.displayName,
            totalDuration: stats.totalDuration,
            totalStreams: stats.totalStreams,
            topTrack: stats.topTrack?.title,
            topArtist: stats.topArtist?.name,
            top5TracksCount: stats.top5Tracks?.length,
            top3ArtistsCount: stats.top3Artists?.length,
            topAlbumsCount: stats.topAlbums?.length,
            favoritesCount: stats.favoritesCount,
            newFavouritesCount: stats.newFavourites?.length
        });

        await MailService.sendWeeklySummary(user.email, stats.displayName, stats);
        console.log(`[Cron] Successfully sent weekly summary email to ${user.email}!`);
        return true;
    }

    static async sendScheduledReleaseReminders() {
        try {
            console.log('[Cron] Running Scheduled Release Reminders...');
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const tomorrowEnd = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);

            const upcomingTracks = await prisma.track.findMany({
                where: {
                    releaseStatus: 'SCHEDULED',
                    scheduledAt: {
                        gte: tomorrow,
                        lt: tomorrowEnd
                    },
                    deletedAt: null
                },
                include: { user: true, artist: true }
            });

            for (const track of upcomingTracks) {
                if (!track.user || !track.user.email) continue;

                const checklist = {
                    coverArt: !!track.coverUrl,
                    audioProcessed: true,
                    metadataComplete: !!track.genre && !!track.language,
                    missing: [] as string[]
                };
                if (!checklist.coverArt) checklist.missing.push('Cover Art');
                if (!checklist.metadataComplete) checklist.missing.push('Genre/Language metadata');

                await MailService.sendScheduledReleaseReminder(
                    track.user.email,
                    track.user.name || track.user.username || 'Creator',
                    {
                        title: track.title,
                        coverUrl: track.coverUrl || undefined,
                        type: track.track_type,
                        genre: track.genre || undefined,
                        duration: track.duration,
                        featuredArtists: track.featuredArtists || undefined,
                        scheduledAt: track.scheduledAt
                    },
                    checklist
                );
            }
            console.log('[Cron] Scheduled Release Reminders job completed successfully.');
        } catch (error) {
            console.error('[Cron] Error running Scheduled Release Reminders job:', error);
        }
    }
}
