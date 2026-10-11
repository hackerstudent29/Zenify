import { prisma } from '../utils/prisma';

export interface RawActivityEvent {
  eventType: string; // 'play' | 'skip' | 'complete' | 'replay' | 'like' | 'save_album' | 'create_playlist' | 'download' | 'search' | 'search_click' | 'onboarding'
  eventData: Record<string, any>;
}

export class ActivityService {
  /**
   * Ingest a single activity event
   */
  static async logEvent(userId: string, eventType: string, eventData: Record<string, any> = {}) {
    try {
      return await prisma.userActivityEvent.create({
        data: {
          userId,
          eventType,
          eventData: eventData || {}
        }
      });
    } catch (err: any) {
      console.error('[ActivityService] Failed to record event:', err.message);
      return null;
    }
  }

  /**
   * Ingest a batch of activity events (authenticated and transactional)
   */
  static async logBatch(userId: string, events: RawActivityEvent[]) {
    if (!events || events.length === 0) return { count: 0 };

    try {
      const records = events.slice(0, 50).map(e => ({
        userId,
        eventType: e.eventType,
        eventData: e.eventData || {}
      }));

      const result = await prisma.userActivityEvent.createMany({
        data: records
      });

      return { count: result.count };
    } catch (err: any) {
      console.error('[ActivityService] Failed to batch log events:', err.message);
      return { count: 0, error: err.message };
    }
  }

  /**
   * Cleanup raw activity events older than 90 days (called nightly by cron)
   */
  static async cleanOldActivityEvents(): Promise<number> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
      const res = await prisma.userActivityEvent.deleteMany({
        where: {
          createdAt: { lt: ninetyDaysAgo }
        }
      });
      console.log(`[ActivityService] Cleaned ${res.count} raw events older than 90 days.`);
      return res.count;
    } catch (err: any) {
      console.error('[ActivityService] Error cleaning old activity events:', err.message);
      return 0;
    }
  }

  /**
   * Reset all personalization data for a user (Section 11: Privacy)
   */
  static async resetPersonalization(userId: string) {
    try {
      await Promise.all([
        prisma.userActivityEvent.deleteMany({ where: { userId } }),
        prisma.userInterestProfile.deleteMany({ where: { userId } }),
        prisma.analysisRun.deleteMany({ where: { userId } })
      ]);
      console.log(`[ActivityService] Reset personalization for user ${userId}`);
      return { success: true, message: 'Personalization profile and activity history have been completely reset.' };
    } catch (err: any) {
      console.error('[ActivityService] Failed to reset personalization:', err.message);
      throw err;
    }
  }
}
