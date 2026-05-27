/**
 * Scheduled Publishing Service
 * 
 * Automatically publishes tracks when their scheduled time arrives
 */

import { prisma } from '../utils/prisma';

export class ScheduledPublishService {
    private static intervalId: NodeJS.Timeout | null = null;
    private static readonly CHECK_INTERVAL = 60 * 1000; // Check every minute

    /**
     * Start the scheduled publishing job
     */
    static start() {
        if (this.intervalId) {
            console.log('[ScheduledPublish] Service already running');
            return;
        }

        console.log('[ScheduledPublish] Starting scheduled publishing service...');
        
        // Run immediately on start
        this.publishScheduledTracks();

        // Then run every minute
        this.intervalId = setInterval(() => {
            this.publishScheduledTracks();
        }, this.CHECK_INTERVAL);

        console.log('[ScheduledPublish] Service started successfully');
    }

    /**
     * Stop the scheduled publishing job
     */
    static stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[ScheduledPublish] Service stopped');
        }
    }

    /**
     * Publish all tracks that are scheduled and past their scheduled time
     */
    static async publishScheduledTracks() {
        try {
            const now = new Date();
            
            // Find all scheduled tracks that should be published
            const tracksToPublish = await prisma.track.findMany({
                where: {
                    releaseStatus: 'SCHEDULED',
                    scheduledAt: {
                        lte: now
                    },
                    deletedAt: null
                },
                include: {
                    artist: true
                }
            });

            if (tracksToPublish.length === 0) {
                return; // No tracks to publish
            }

            console.log(`[ScheduledPublish] Found ${tracksToPublish.length} track(s) ready to publish`);

            // Publish each track
            for (const track of tracksToPublish) {
                try {
                    await prisma.track.update({
                        where: { id: track.id },
                        data: {
                            releaseStatus: 'PUBLISHED'
                        }
                    });

                    console.log(`[ScheduledPublish] ✅ Published: "${track.title}" by ${track.artist.name}`);
                } catch (err: any) {
                    console.error(`[ScheduledPublish] ❌ Failed to publish track ${track.id}:`, err.message);
                }
            }

            console.log(`[ScheduledPublish] Successfully published ${tracksToPublish.length} track(s)`);
        } catch (err: any) {
            console.error('[ScheduledPublish] Error in publishScheduledTracks:', err.message);
        }
    }

    /**
     * Get stats about scheduled tracks
     */
    static async getStats() {
        try {
            const now = new Date();

            const [totalScheduled, readyToPublish, futureScheduled] = await Promise.all([
                prisma.track.count({
                    where: {
                        releaseStatus: 'SCHEDULED',
                        deletedAt: null
                    }
                }),
                prisma.track.count({
                    where: {
                        releaseStatus: 'SCHEDULED',
                        scheduledAt: { lte: now },
                        deletedAt: null
                    }
                }),
                prisma.track.count({
                    where: {
                        releaseStatus: 'SCHEDULED',
                        scheduledAt: { gt: now },
                        deletedAt: null
                    }
                })
            ]);

            return {
                totalScheduled,
                readyToPublish,
                futureScheduled
            };
        } catch (err: any) {
            console.error('[ScheduledPublish] Error getting stats:', err.message);
            return {
                totalScheduled: 0,
                readyToPublish: 0,
                futureScheduled: 0
            };
        }
    }
}
