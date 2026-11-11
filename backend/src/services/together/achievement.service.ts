import { prisma } from '../../utils/prisma';

export interface AchievementUpdateInput {
  userId: string;
  isGuest?: boolean;
  roomsDelta?: number;
  listeningSecondsDelta?: number;
  nightListeningSecondsDelta?: number;
  hostMinutesWith3PlusDelta?: number;
  crowdPleaserDelta?: number;
  tracksPlayedDelta?: number;
  bookmarksDelta?: number;
  voiceRoomsDelta?: number;
  tastemakerDelta?: number;
}

export class AchievementService {
  private static readonly DEFS_CACHE_TTL_MS = 5 * 60 * 1000;
  private static defsCache: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    tier: string;
    threshold: number;
    category: string;
  }> | null = null;
  private static defsCachedAt = 0;

  static async getDefinitions() {
    if (this.defsCache && Date.now() - this.defsCachedAt < this.DEFS_CACHE_TTL_MS) {
      return this.defsCache;
    }
    const defs = await prisma.togetherAchievementDef.findMany({
      orderBy: [{ category: 'asc' }, { threshold: 'asc' }],
    });
    this.defsCache = defs;
    this.defsCachedAt = Date.now();
    return defs;
  }

  /**
   * Lists all achievements with progress & unlock status for a user.
   */
  static async listForUser(userId: string) {
    const [defs, rows] = await Promise.all([
      this.getDefinitions(),
      userId.startsWith('guest_')
        ? Promise.resolve([])
        : prisma.togetherUserAchievement.findMany({ where: { userId } }),
    ]);

    const progressMap = new Map(rows.map((r) => [r.achievementId, r]));

    return defs.map((d) => {
      const row = progressMap.get(d.id);
      const progress = row?.progress ?? 0;
      const unlocked = row?.unlockedAt != null || progress >= d.threshold;
      return {
        id: d.id,
        title: d.name,
        name: d.name,
        description: d.description,
        icon: d.icon,
        tier: d.tier,
        category: d.category,
        progress,
        target: d.threshold,
        threshold: d.threshold,
        unlocked,
        unlockedMs: row?.unlockedAt ? row.unlockedAt.getTime() : null,
      };
    });
  }

  /**
   * Idempotently advances achievement progress counters and unlocks badges once threshold is met.
   */
  static async recordProgress(input: AchievementUpdateInput): Promise<string[]> {
    if (!input.userId || input.isGuest || input.userId.startsWith('guest_')) {
      return [];
    }

    const increments: Array<[string, number]> = [];
    if (input.roomsDelta && input.roomsDelta > 0) {
      increments.push(['FIRST_ROOM', input.roomsDelta]);
      increments.push(['ROOM_REGULAR', input.roomsDelta]);
    }
    if (input.listeningSecondsDelta && input.listeningSecondsDelta > 0) {
      increments.push(['MARATHONER', input.listeningSecondsDelta]);
    }
    if (input.nightListeningSecondsDelta && input.nightListeningSecondsDelta > 0) {
      increments.push(['NIGHT_OWL', input.nightListeningSecondsDelta]);
    }
    if (input.hostMinutesWith3PlusDelta && input.hostMinutesWith3PlusDelta > 0) {
      increments.push(['DJ_OF_THE_HOUR', input.hostMinutesWith3PlusDelta]);
    }
    if (input.crowdPleaserDelta && input.crowdPleaserDelta > 0) {
      increments.push(['CROWD_PLEASER', input.crowdPleaserDelta]);
    }
    if (input.tracksPlayedDelta && input.tracksPlayedDelta > 0) {
      increments.push(['CENTURION', input.tracksPlayedDelta]);
    }
    if (input.bookmarksDelta && input.bookmarksDelta > 0) {
      increments.push(['BOOKMARK_KEEPER', input.bookmarksDelta]);
    }
    if (input.voiceRoomsDelta && input.voiceRoomsDelta > 0) {
      increments.push(['VOICE_HOST', input.voiceRoomsDelta]);
    }
    if (input.tastemakerDelta && input.tastemakerDelta > 0) {
      increments.push(['TASTEMAKER', input.tastemakerDelta]);
    }

    if (increments.length === 0) return [];

    const defs = await this.getDefinitions();
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const newlyUnlocked: string[] = [];

    for (const [achievementId, delta] of increments) {
      const def = defMap.get(achievementId);
      if (!def) continue;

      const existing = await prisma.togetherUserAchievement.findUnique({
        where: { userId_achievementId: { userId: input.userId, achievementId } },
      });

      const nextProgress = Math.min(
        def.threshold * 10,
        (existing?.progress ?? 0) + Math.max(0, Math.floor(delta))
      );
      const reached = nextProgress >= def.threshold;
      const unlockedAt = existing?.unlockedAt ?? (reached ? new Date() : null);

      await prisma.togetherUserAchievement.upsert({
        where: { userId_achievementId: { userId: input.userId, achievementId } },
        create: {
          userId: input.userId,
          achievementId,
          progress: nextProgress,
          unlockedAt,
        },
        update: {
          progress: nextProgress,
          unlockedAt,
        },
      });

      if (!existing?.unlockedAt && unlockedAt) {
        newlyUnlocked.push(achievementId);
      }
    }

    return newlyUnlocked;
  }
}

