import { prisma } from '../utils/prisma';
import { WebPushService } from '../services/web-push.service';

export class ArtistReleaseScannerJob {
  private static isRunning = false;

  /**
   * Scans followed artists for new releases, persists to ArtistRelease,
   * creates in-app notifications and sends web push notifications.
   */
  static async runScan(): Promise<{ releasesFound: number; notificationsSent: number }> {
    if (this.isRunning) {
      console.log('[ReleaseScanner] Scanner already running, skipping.');
      return { releasesFound: 0, notificationsSent: 0 };
    }

    this.isRunning = true;
    let releasesFound = 0;
    let notificationsSent = 0;

    try {
      console.log('[ReleaseScanner] Starting 6-hour followed artist release scan...');

      // 1. Get all unique followed artists
      const follows = await prisma.artistFollow.findMany({
        select: {
          artistProviderId: true,
          artistName: true,
          userId: true,
        },
      });

      if (follows.length === 0) {
        console.log('[ReleaseScanner] No followed artists found in database.');
        return { releasesFound: 0, notificationsSent: 0 };
      }

      // Group followers by artistProviderId
      const followersByArtist = new Map<string, Array<{ userId: string; artistName: string }>>();
      for (const f of follows) {
        if (!followersByArtist.has(f.artistProviderId)) {
          followersByArtist.set(f.artistProviderId, []);
        }
        followersByArtist.get(f.artistProviderId)!.push(f);
      }

      // 2. Scan each artist for recent albums in the catalog
      for (const [artistProviderId, followers] of followersByArtist.entries()) {
        const artistName = followers[0]?.artistName || 'Artist';

        // Find albums matching artistId or artistProviderId
        const albums = await prisma.album.findMany({
          where: {
            OR: [
              { artistId: artistProviderId },
              { providerId: artistProviderId },
              { artist: { name: { equals: artistName, mode: 'insensitive' } } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        for (const album of albums) {
          const albumProviderId = album.providerId || album.id;

          // Check if already recorded in ArtistRelease
          const existing = await prisma.artistRelease.findUnique({
            where: {
              artistProviderId_albumProviderId: {
                artistProviderId,
                albumProviderId,
              },
            },
          });

          if (!existing) {
            // New release discovered!
            releasesFound++;
            await prisma.artistRelease.create({
              data: {
                artistProviderId,
                albumProviderId,
                title: album.title,
                coverUrl: album.coverUrl,
                releaseDate: album.releaseDate,
                firstSeenAt: new Date(),
              },
            });

            console.log(`[ReleaseScanner] New release recorded: "${album.title}" by ${artistName}`);

            // Notify each follower
            for (const follower of followers) {
              try {
                // In-app Notification
                await prisma.notification.create({
                  data: {
                    userId: follower.userId,
                    type: 'new_release',
                    title: `New Release from ${artistName}`,
                    message: `"${album.title}" is out now on Zenify. Stream in lossless audio.`,
                    metadata: {
                      albumId: album.id,
                      artistProviderId,
                      coverUrl: album.coverUrl,
                    },
                  },
                });

                // Web Push Notification (capped at 3/day per user)
                await WebPushService.sendNotification(follower.userId, {
                  title: `New Music: ${artistName}`,
                  body: `"${album.title}" is out now on Zenify.`,
                  icon: album.coverUrl || undefined,
                  url: `/album/${album.id}`,
                });

                notificationsSent++;
              } catch (notifyErr: any) {
                console.warn(`[ReleaseScanner] Failed to notify user ${follower.userId}:`, notifyErr.message);
              }
            }
          }
        }
      }

      console.log(`[ReleaseScanner] Scan completed. Releases found: ${releasesFound}, Notifications dispatched: ${notificationsSent}`);
    } catch (err: any) {
      console.error('[ReleaseScanner] Scan encountered error:', err);
    } finally {
      this.isRunning = false;
    }

    return { releasesFound, notificationsSent };
  }
}

