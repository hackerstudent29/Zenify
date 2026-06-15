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
                            releaseStatus: 'PUBLISHED',
                            createdAt: new Date()
                        }
                    });

                    try {
                        const { invalidateCache } = require('../utils/cache.js');
                        await invalidateCache('new_releases_row');
                        await invalidateCache('trending_row');
                        await invalidateCache('featured_row');
                        await invalidateCache('most_played_row');
                        await invalidateCache('hp:top_artists');
                        await invalidateCache('hp:top_playlists');
                        if (track.albumId) {
                            await invalidateCache('hp:top_albums');
                        }
                    } catch (cacheErr: any) {
                        console.warn('[ScheduledPublish] Failed to invalidate homepage cache:', cacheErr.message);
                    }

                    if (track.userId) {
                        const { NotificationService } = require('./notification.service.js');
                        await NotificationService.createNotification(
                            track.userId,
                            'track_published',
                            'Track Published',
                            `Your scheduled track "${track.title}" is now live!`
                        );
                        
                        // Send Release Live Confirmation to Uploader
                        const uploader = await prisma.user.findUnique({ where: { id: track.userId } });
                        if (uploader && uploader.email) {
                            const { MailService } = require('./mail.service.js');
                            await MailService.sendReleaseLiveConfirmation(
                                uploader.email,
                                uploader.name || uploader.username || 'Creator',
                                {
                                    title: track.title,
                                    coverUrl: track.coverUrl || undefined,
                                    type: track.track_type,
                                    artistName: track.artist.name
                                }
                            );
                        }
                    }

                    // Send New Release Alert to Followers
                    const followers = await prisma.user.findMany({
                        where: {
                            preferences: { newReleaseAlerts: true },
                            stats: {
                                some: { track: { artistId: track.artistId } }
                            }
                        }
                    });
                    
                    if (followers.length > 0) {
                        const { MailService } = require('./mail.service.js');
                        for (const follower of followers) {
                            if (!follower.email) continue;
                            await MailService.sendNewReleaseAlert(
                                follower.email,
                                follower.name || follower.username || 'Listener',
                                {
                                    title: track.title,
                                    artistName: track.artist.name,
                                    coverUrl: track.coverUrl || undefined,
                                    trackId: track.id,
                                    type: track.track_type
                                }
                            );
                        }
                    }

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
