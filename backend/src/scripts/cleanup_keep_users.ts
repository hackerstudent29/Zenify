import { prisma } from '../utils/prisma.js';
import Redis from 'ioredis';
import { config } from '../config/env.js';

async function main() {
    console.log('--- STARTING CLEANUP: SAVING ONLY USER DETAILS ---');

    // 1. Delete dependent & non-user data
    console.log('1. Clearing non-user tables...');
    const dPlaylistTracks = await prisma.playlistTrack.deleteMany();
    const dPlaylists = await prisma.playlist.deleteMany();
    const dLikes = await prisma.like.deleteMany();
    const dHistory = await prisma.history.deleteMany();
    const dPurchases = await prisma.purchase.deleteMany();
    const dRatings = await prisma.rating.deleteMany();
    const dUserTrackStats = await prisma.userTrackStat.deleteMany();
    const dUserDailyStats = await prisma.userDailyStat.deleteMany();
    const dUserActivityEvents = await prisma.userActivityEvent.deleteMany();
    const dUserInterestProfiles = await prisma.userInterestProfile.deleteMany();
    const dAnalysisRuns = await prisma.analysisRun.deleteMany();
    const dNotifications = await prisma.notification.deleteMany();
    const dTrackAnalytics = await prisma.trackAnalytics.deleteMany();
    const dTrackVibeProfiles = await prisma.trackVibeProfile.deleteMany();
    const dLyricEnrichmentJobs = await prisma.lyricEnrichmentJob.deleteMany();
    const dFeaturedContent = await prisma.featuredContent.deleteMany();
    const dTracks = await prisma.track.deleteMany();
    const dAlbums = await prisma.album.deleteMany();
    const dArtists = await prisma.artist.deleteMany();

    console.log(`Deleted:
    - ${dNotifications.count} Notifications
    - ${dArtists.count} Artists
    - ${dAlbums.count} Albums
    - ${dTracks.count} Tracks
    - ${dPlaylists.count} Playlists
    - ${dUserActivityEvents.count} UserActivityEvents`);

    // 2. Keep and update all users: turn all email options OFF
    console.log('2. Updating all users email options to OFF...');
    const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true, preferences: true }
    });
    console.log(`Found ${users.length} users to preserve.`);

    for (const u of users) {
        await prisma.userPreferences.upsert({
            where: { userId: u.id },
            create: {
                userId: u.id,
                emailNotifications: false,
                newReleaseAlerts: false,
                playlistUpdates: false,
                weeklySummaryEmail: false,
            },
            update: {
                emailNotifications: false,
                newReleaseAlerts: false,
                playlistUpdates: false,
                weeklySummaryEmail: false,
            }
        });
        console.log(`User [${u.email}]: All email notification options set to OFF.`);
    }

    // 3. Clear Redis Cache (if Redis is running)
    console.log('3. Flushing Redis and external caches...');
    if (config.REDIS_URL) {
        try {
            const redis = new Redis(config.REDIS_URL, { connectTimeout: 3000, maxRetriesPerRequest: 1 });
            await redis.flushall();
            await redis.quit();
            console.log('Redis cache flushed completely (flushall).');
        } catch (err: any) {
            console.warn('Could not flush remote Redis:', err.message);
        }
    } else {
        console.log('No remote REDIS_URL configured; local in-memory caches will start clean on restart.');
    }

    console.log('--- CLEANUP COMPLETE: ONLY USER DETAILS PRESERVED, ALL EMAIL NOTIFICATIONS OFF ---');
}

main()
    .catch((err) => {
        console.error('Cleanup error:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
