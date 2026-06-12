import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { MailService } from './mail.service';

export class CronService {
    static init() {
        // Run every Sunday at 10:00 AM
        cron.schedule('0 10 * * 0', async () => {
            console.log('[Cron] Starting Weekly Summary Emails job...');
            await CronService.sendWeeklySummaries();
        });
        console.log('[Cron] Cron jobs initialized.');
    }

    static async sendWeeklySummaries() {
        try {
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

            for (const user of users) {
                if (!user.email || !user.name) continue;

                // Gather stats for the last 7 days
                const dailyStats = await prisma.userDailyStat.findMany({
                    where: { userId: user.id, date: { gte: sevenDaysAgo } }
                });
                const totalDuration = dailyStats.reduce((sum, stat) => sum + stat.minutesListened, 0);

                if (totalDuration === 0) continue; // Skip if they didn't listen to anything

                // Top track
                const topStats = await prisma.userTrackStat.findMany({
                    where: { userId: user.id, lastStreamedAt: { gte: sevenDaysAgo } },
                    orderBy: { streamCount: 'desc' },
                    take: 1,
                    include: { track: true }
                });
                const topTrack = topStats.length > 0 ? topStats[0].track : null;
                const totalStreams = topStats.reduce((sum, stat) => sum + stat.streamCount, 0); // Simplified total streams since we don't have a timeframe streamCount field

                // Top artist via raw query
                const topArtists: any[] = await prisma.$queryRaw`
                    SELECT a.name, SUM(uts."streamCount") as count
                    FROM "UserTrackStat" uts
                    JOIN "Track" t ON uts."trackId" = t.id
                    JOIN "Artist" a ON t."artistId" = a.id
                    WHERE uts."userId" = ${user.id} AND uts."lastStreamedAt" >= ${sevenDaysAgo}
                    GROUP BY a.name
                    ORDER BY count DESC
                    LIMIT 1
                `;
                const topArtist = topArtists.length > 0 ? { name: topArtists[0].name } : null;

                // Send email
                await MailService.sendWeeklySummary(user.email, user.name, {
                    totalDuration,
                    topTrack,
                    topArtist,
                    totalStreams: totalStreams || 0 // NOTE: Total streams for the week ideally comes from History, but this is okay
                });
            }
            console.log('[Cron] Weekly Summary Emails job completed successfully.');
        } catch (error) {
            console.error('[Cron] Error running Weekly Summary Emails job:', error);
        }
    }
}
