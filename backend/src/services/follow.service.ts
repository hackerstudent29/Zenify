import { prisma } from '../utils/prisma';
import { AffinityDecayService } from './affinity-decay.service';

export class FollowService {
  /**
   * Follow an artist and record a +3.0 affinity signal
   */
  static async followArtist(
    userId: string,
    artistProviderId: string,
    artistName: string,
    artistImage?: string
  ) {
    const follow = await prisma.artistFollow.upsert({
      where: {
        userId_artistProviderId: {
          userId,
          artistProviderId,
        },
      },
      update: {
        artistName,
        artistImage: artistImage || undefined,
      },
      create: {
        userId,
        artistProviderId,
        artistName,
        artistImage,
      },
    });

    // Incur strong affinity weight for this artist (+3.0)
    try {
      await AffinityDecayService.recordAffinityDelta(
        userId,
        'artist',
        artistName.toLowerCase().trim(),
        3.0
      );
    } catch (err: any) {
      console.warn(`[FollowService] Affinity update skipped: ${err.message}`);
    }

    return { following: true, follow };
  }

  /**
   * Unfollow an artist
   */
  static async unfollowArtist(userId: string, artistProviderId: string) {
    try {
      await prisma.artistFollow.deleteMany({
        where: {
          userId,
          artistProviderId,
        },
      });
      return { following: false };
    } catch (err: any) {
      return { following: false };
    }
  }

  /**
   * Get paginated list of followed artists
   */
  static async getFollowedArtists(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [artists, total] = await Promise.all([
      prisma.artistFollow.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.artistFollow.count({
        where: { userId },
      }),
    ]);

    return {
      artists,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Bulk check following status
   */
  static async isFollowingBatch(userId: string, artistProviderIds: string[]): Promise<Record<string, boolean>> {
    if (!artistProviderIds || artistProviderIds.length === 0) return {};

    const follows = await prisma.artistFollow.findMany({
      where: {
        userId,
        artistProviderId: { in: artistProviderIds },
      },
      select: { artistProviderId: true },
    });

    const set = new Set(follows.map((f) => f.artistProviderId));
    const result: Record<string, boolean> = {};
    for (const id of artistProviderIds) {
      result[id] = set.has(id);
    }
    return result;
  }

  /**
   * Get chronological releases timeline from followed artists
   */
  static async getNewReleasesTimeline(userId: string, limit = 30) {
    const followed = await prisma.artistFollow.findMany({
      where: { userId },
      select: { artistProviderId: true, artistName: true },
    });

    if (followed.length === 0) return [];

    const artistIds = followed.map((f) => f.artistProviderId);
    const artistNameMap = new Map(followed.map((f) => [f.artistProviderId, f.artistName]));

    const releases = await prisma.artistRelease.findMany({
      where: {
        artistProviderId: { in: artistIds },
      },
      orderBy: { firstSeenAt: 'desc' },
      take: limit,
    });

    return releases.map((r) => ({
      ...r,
      artistName: artistNameMap.get(r.artistProviderId) || 'Artist',
    }));
  }
}
