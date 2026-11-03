import { prisma } from '../utils/prisma.js';

export interface AffinityConfig {
  halfLifeDays: number;
  halfLifeMs: number;
  decayLambda: number;
  scoreCompleted: number;
  scoreReplay: number;
  scoreLike: number;
  scorePlaylistAdd: number;
  scoreSkipShort: number;
  scoreRepeatedSkipArtist: number;
}

export const DEFAULT_AFFINITY_CONFIG: AffinityConfig = {
  halfLifeDays: 30,
  halfLifeMs: 30 * 24 * 60 * 60 * 1000,
  decayLambda: Math.LN2 / (30 * 24 * 60 * 60 * 1000),
  scoreCompleted: 1.0,
  scoreReplay: 2.0,
  scoreLike: 3.0,
  scorePlaylistAdd: 3.0,
  scoreSkipShort: -1.0,
  scoreRepeatedSkipArtist: -2.5,
};

export class AffinityDecayService {
  private static config: AffinityConfig = { ...DEFAULT_AFFINITY_CONFIG };

  public static setConfig(custom: Partial<AffinityConfig>) {
    this.config = { ...this.config, ...custom };
    if (custom.halfLifeDays && !custom.decayLambda) {
      this.config.halfLifeMs = custom.halfLifeDays * 24 * 60 * 60 * 1000;
      this.config.decayLambda = Math.LN2 / this.config.halfLifeMs;
    }
  }

  public static getConfig(): AffinityConfig {
    return this.config;
  }

  /**
   * Apply exponential decay to a score given elapsed time in milliseconds
   */
  public static calculateDecayedScore(currentScore: number, lastUpdatedAt: Date, now: Date = new Date()): number {
    const elapsedMs = Math.max(0, now.getTime() - lastUpdatedAt.getTime());
    if (elapsedMs === 0) return currentScore;
    const decayed = currentScore * Math.exp(-this.config.decayLambda * elapsedMs);
    // Round to 4 decimal places
    return Math.round(decayed * 10000) / 10000;
  }

  /**
   * Upsert an affinity score with exponential decay
   */
  public static async recordAffinityDelta(
    userId: string,
    kind: 'artist' | 'language' | 'album' | 'genre',
    key: string,
    deltaScore: number,
    now: Date = new Date()
  ): Promise<number> {
    if (!userId || !kind || !key) return 0;
    const cleanKey = key.trim();
    if (!cleanKey) return 0;

    try {
      const existing = await prisma.userAffinity.findUnique({
        where: {
          userId_kind_key: {
            userId,
            kind,
            key: cleanKey,
          },
        },
      });

      let newScore = deltaScore;
      if (existing) {
        const decayed = this.calculateDecayedScore(existing.score, existing.updatedAt, now);
        newScore = Math.max(0, decayed + deltaScore);
      } else {
        newScore = Math.max(0, deltaScore);
      }

      newScore = Math.round(newScore * 10000) / 10000;

      await prisma.userAffinity.upsert({
        where: {
          userId_kind_key: {
            userId,
            kind,
            key: cleanKey,
          },
        },
        create: {
          userId,
          kind,
          key: cleanKey,
          score: newScore,
          updatedAt: now,
        },
        update: {
          score: newScore,
          updatedAt: now,
        },
      });

      return newScore;
    } catch (error) {
      console.error(`[AffinityDecayService] Error updating affinity for ${userId} (${kind}:${key}):`, error);
      return 0;
    }
  }

  /**
   * Batch apply affinity deltas from a listen event
   */
  public static async applyListenEventAffinities(params: {
    userId: string;
    artistIds?: string[];
    albumId?: string | null;
    language?: string | null;
    completed?: boolean;
    skipped?: boolean;
    msPlayed?: number;
    durationMs?: number;
  }): Promise<void> {
    const { userId, artistIds, albumId, language, completed, skipped, msPlayed = 0, durationMs = 0 } = params;
    if (!userId) return;

    // Check if user has personalization enabled
    const userPrefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { personalizationEnabled: true },
    });
    if (userPrefs && userPrefs.personalizationEnabled === false) {
      return; // Respect privacy: turn off personalization
    }

    const now = new Date();
    let delta = 0;

    if (completed) {
      delta = this.config.scoreCompleted;
    } else if (skipped && msPlayed < 30000) {
      delta = this.config.scoreSkipShort;
    } else if (msPlayed >= 30000) {
      // Partial play over 30 seconds
      delta = 0.5;
    }

    if (delta === 0) return;

    const updates: Promise<any>[] = [];

    // Artists
    if (Array.isArray(artistIds) && artistIds.length > 0) {
      for (const artistId of artistIds) {
        if (artistId) {
          updates.push(this.recordAffinityDelta(userId, 'artist', artistId, delta, now));
        }
      }
    }

    // Language
    if (language) {
      const cleanLang = language.toLowerCase().trim();
      updates.push(this.recordAffinityDelta(userId, 'language', cleanLang, Math.max(0.1, delta), now));
    }

    // Album
    if (albumId) {
      updates.push(this.recordAffinityDelta(userId, 'album', albumId, delta, now));
    }

    await Promise.allSettled(updates);
  }

  /**
   * Get top affinities for a user decayed to the current moment
   */
  public static async getTopAffinities(
    userId: string,
    kind: 'artist' | 'language' | 'album' | 'genre',
    limit: number = 20
  ): Promise<Array<{ key: string; score: number }>> {
    const rows = await prisma.userAffinity.findMany({
      where: { userId, kind },
      orderBy: { score: 'desc' },
      take: limit * 2,
    });

    const now = new Date();
    const decayed = rows
      .map((r: any) => ({
        key: r.key,
        score: this.calculateDecayedScore(r.score, r.updatedAt, now),
      }))
      .filter((r: any) => r.score > 0.05)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit);

    return decayed;
  }

  /**
   * Clear all affinities for a user (Privacy: "Clear listening history" or account deletion)
   */
  public static async clearAffinities(userId: string): Promise<{ count: number }> {
    const result = await prisma.userAffinity.deleteMany({
      where: { userId },
    });
    return { count: result.count };
  }
}
