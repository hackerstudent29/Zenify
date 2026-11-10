// backend/src/services/listening.service.ts
import { prisma } from '../utils/prisma';
import {
  isQualifiedPlay,
  isSkip,
  clampListenedMs,
  isDuplicateEvent,
  getLocalTimeBuckets,
  normalizeHeatmap,
  calculateDelta,
  groupIntoSessions,
  deriveMusicPersonality,
  AnalyticsEvent,
  LISTENING_CONFIG,
} from './listening-analytics';

export interface IngestArtist {
  artistKey: string;
  artistName: string;
  artistImage?: string;
  isPrimary?: boolean;
}

export interface IngestListeningEvent {
  eventId: string;
  startedAt: string; // ISO8601
  endedAt: string; // ISO8601
  tzOffsetMin: number;
  listenedMs: number;
  trackDurationMs: number;
  endReason: string; // completed, skipped, error, paused_timeout, app_killed, queue_replaced
  trackSource?: string;
  trackId: string;
  trackTitle: string;
  trackAlbum?: string;
  language?: string;
  genre?: string;
  contextType?: string;
  contextId?: string;
  offline?: boolean;
  quality?: number;
  deviceId?: string;
  artists?: IngestArtist[];
}

// In-memory cache for fast 5-minute TTL responses
const insightsCache = new Map<string, { data: any; expiresAt: number }>();

export class ListeningService {
  /**
   * Batch ingest listen events with deduplication, validation, and aggregate updates
   */
  static async recordBatch(userId: string, events: IngestListeningEvent[]) {
    if (!events || events.length === 0) {
      return { accepted: 0, duplicates: 0, skipped: 0 };
    }

    // 1. Check user privacy preference
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { saveListeningHistory: true },
    });

    if (prefs?.saveListeningHistory === false) {
      return { accepted: 0, duplicates: 0, skipped: events.length, reason: 'privacy_disabled' };
    }

    let accepted = 0;
    let duplicates = 0;

    // 2. Batch deduplication check in one query
    const incomingIds = events.map((e) => e.eventId).filter(Boolean);
    const existingEvents = await prisma.listeningEvent.findMany({
      where: {
        userId,
        eventId: { in: incomingIds },
      },
      select: { eventId: true },
    });
    const existingIdSet = new Set(existingEvents.map((e) => e.eventId));

    for (const ev of events) {
      if (!ev.eventId || !ev.trackId || !ev.startedAt || !ev.endedAt) continue;

      if (existingIdSet.has(ev.eventId)) {
        duplicates++;
        continue;
      }

      const startedAtDate = new Date(ev.startedAt);
      const endedAtDate = new Date(ev.endedAt);

      // 3. Pure Analytics Rules: clamp duration, check qualified play, check skip
      const rawListenedMs = Math.max(0, ev.listenedMs || 0);
      const trackDurationMs = Math.max(0, ev.trackDurationMs || 0);
      const listenedMs = clampListenedMs(rawListenedMs, trackDurationMs);
      const qualified = isQualifiedPlay(listenedMs, trackDurationMs);
      const skip = isSkip(rawListenedMs, ev.endReason);
      const completed = ev.endReason === 'completed' || (trackDurationMs > 0 && listenedMs >= trackDurationMs * 0.95);

      // 4. Save raw event
      await prisma.listeningEvent.create({
        data: {
          userId,
          eventId: ev.eventId,
          startedAt: startedAtDate,
          endedAt: endedAtDate,
          tzOffsetMin: ev.tzOffsetMin ?? 0,
          listenedMs,
          trackDurationMs,
          endReason: ev.endReason || 'completed',
          trackSource: ev.trackSource || 'youtube',
          trackId: ev.trackId,
          trackTitle: ev.trackTitle || 'Unknown Title',
          trackAlbum: ev.trackAlbum || null,
          language: ev.language || null,
          genre: ev.genre || null,
          contextType: ev.contextType || null,
          contextId: ev.contextId || null,
          offline: ev.offline ?? false,
          quality: ev.quality ?? 256,
          deviceId: ev.deviceId || null,
          qualified,
          isSkip: skip,
          completed,
        },
      }).catch(() => null);

      // 5. Save multi-artist relations
      const artists = ev.artists && ev.artists.length > 0
        ? ev.artists
        : [{ artistKey: 'unknown', artistName: 'Unknown Artist', isPrimary: true }];

      for (const art of artists) {
        const artistKey = art.artistKey.trim() || 'unknown';
        const artistName = art.artistName.trim() || 'Unknown Artist';

        await prisma.listeningEventArtist.create({
          data: {
            userId,
            eventId: ev.eventId,
            artistKey,
            artistName,
            isPrimary: art.isPrimary ?? true,
          },
        }).catch(() => null);
      }

      // 6. Update pre-aggregates if qualified
      if (qualified) {
        // Rollup: UserArtistStat
        for (const art of artists) {
          const artistKey = art.artistKey.trim() || 'unknown';
          const artistName = art.artistName.trim() || 'Unknown Artist';

          await prisma.userArtistStat.upsert({
            where: {
              userId_artistKey: { userId, artistKey },
            },
            create: {
              userId,
              artistKey,
              artistName,
              artistImage: art.artistImage || null,
              plays: 1,
              listenedMs: BigInt(listenedMs),
              firstPlayed: startedAtDate,
              lastPlayed: endedAtDate,
            },
            update: {
              plays: { increment: 1 },
              listenedMs: { increment: BigInt(listenedMs) },
              lastPlayed: endedAtDate,
              artistName,
              ...(art.artistImage ? { artistImage: art.artistImage } : {}),
            },
          }).catch(() => null);
        }

        // Rollup: UserHourlyStat (Local timezone bucketing)
        const { dow, hour } = getLocalTimeBuckets(startedAtDate, ev.tzOffsetMin ?? 0);

        await prisma.userHourlyStat.upsert({
          where: {
            userId_dow_hour: { userId, dow, hour },
          },
          create: {
            userId,
            dow,
            hour,
            listenedMs: BigInt(listenedMs),
          },
          update: {
            listenedMs: { increment: BigInt(listenedMs) },
          },
        }).catch(() => null);
      }

      accepted++;
    }

    // Invalidate cache on new events
    ListeningService._invalidateCache(userId);

    // Evaluate achievements asynchronously
    ListeningService._evaluateAchievements(userId).catch(() => null);

    return { accepted, duplicates, skipped: 0 };
  }

  /**
   * Invalidate cached insights for a user
   */
  private static _invalidateCache(userId: string) {
    for (const key of insightsCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        insightsCache.delete(key);
      }
    }
  }

  /**
   * Aggregates insights for Apple Music Replay style view with comparisons and percentiles
   */
  static async getInsights(userId: string, range: 'week' | 'month' | 'year' | 'all' = 'all') {
    const cacheKey = `${userId}:${range}`;
    const cached = insightsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const now = new Date();
    let startDate: Date | null = null;
    let prevStartDate: Date | null = null;
    let prevEndDate: Date | null = null;

    if (range === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      prevEndDate = startDate;
    } else if (range === 'month') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      prevEndDate = startDate;
    } else if (range === 'year') {
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      prevStartDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
      prevEndDate = startDate;
    }

    // 1. Fetch current period qualified events
    const whereCurrent: any = { userId, qualified: true };
    if (startDate) whereCurrent.startedAt = { gte: startDate };

    const currentEvents = await prisma.listeningEvent.findMany({
      where: whereCurrent,
      orderBy: { startedAt: 'desc' },
      take: 3000,
    });

    // 2. Fetch previous period for delta calculations
    let prevEvents: any[] = [];
    if (prevStartDate && prevEndDate) {
      prevEvents = await prisma.listeningEvent.findMany({
        where: {
          userId,
          qualified: true,
          startedAt: { gte: prevStartDate, lt: prevEndDate },
        },
        select: { listenedMs: true, trackId: true },
      });
    }

    const totalPlays = currentEvents.length;
    let totalListeningMs = 0;
    const trackMap = new Map<string, { trackId: string; trackTitle: string; trackAlbum?: string; plays: number; listenedMs: number }>();
    const genreMap = new Map<string, number>();
    const languageMap = new Map<string, number>();
    const activeDaysSet = new Set<string>();

    let totalSkips = 0;
    let totalNightPlays = 0;
    let totalMorningPlays = 0;

    // Timeline buckets: daily minutes
    const timelineMap = new Map<string, number>();

    // 24x7 local time heatmap minutes
    const heatmapMinutes: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    for (const ev of currentEvents) {
      totalListeningMs += ev.listenedMs;
      if (ev.isSkip) totalSkips++;

      // Track bucketing
      const t = trackMap.get(ev.trackId) || {
        trackId: ev.trackId,
        trackTitle: ev.trackTitle,
        trackAlbum: ev.trackAlbum || undefined,
        plays: 0,
        listenedMs: 0,
      };
      t.plays += 1;
      t.listenedMs += ev.listenedMs;
      trackMap.set(ev.trackId, t);

      // Genre & Language
      if (ev.genre) genreMap.set(ev.genre, (genreMap.get(ev.genre) || 0) + 1);
      if (ev.language) languageMap.set(ev.language, (languageMap.get(ev.language) || 0) + 1);

      // Local timezone day and hour
      const { dow, hour, localDateStr } = getLocalTimeBuckets(ev.startedAt, ev.tzOffsetMin || 0);
      activeDaysSet.add(localDateStr);
      heatmapMinutes[dow][hour] += Math.round(ev.listenedMs / 60000);

      // Timeline aggregation
      timelineMap.set(localDateStr, (timelineMap.get(localDateStr) || 0) + Math.round(ev.listenedMs / 60000));

      if (hour >= 22 || hour <= 4) totalNightPlays++;
      if (hour >= 5 && hour <= 11) totalMorningPlays++;
    }

    // 3. Compute Streak
    let streakDays = 0;
    const checkDate = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(checkDate.getTime() - i * 86400000);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (activeDaysSet.has(dateKey)) {
        streakDays++;
      } else {
        if (i === 0) continue;
        break;
      }
    }

    // 4. Top Tracks
    const topTracks = Array.from(trackMap.values())
      .sort((a, b) => b.plays - a.plays || b.listenedMs - a.listenedMs)
      .slice(0, 10)
      .map((t, idx) => ({ rank: idx + 1, ...t }));

    // 5. Top Artists
    const eventIds = currentEvents.map((e) => e.eventId);
    let topArtists: Array<{
      rank: number;
      artistKey: string;
      artistName: string;
      artistImage: string | null;
      plays: number;
      listenedMs: number;
      percentage: number;
    }> = [];

    if (range === 'all' && eventIds.length === 0) {
      const stats = await prisma.userArtistStat.findMany({
        where: { userId },
        orderBy: [{ plays: 'desc' }, { listenedMs: 'desc' }],
        take: 10,
      });
      topArtists = stats.map((st, idx) => ({
        rank: idx + 1,
        artistKey: st.artistKey,
        artistName: st.artistName,
        artistImage: st.artistImage,
        plays: st.plays,
        listenedMs: Number(st.listenedMs),
        percentage: totalListeningMs > 0 ? Math.min(100, Math.round((Number(st.listenedMs) / totalListeningMs) * 100)) : 0,
      }));
    } else if (eventIds.length > 0) {
      const artistLinks = await prisma.listeningEventArtist.findMany({
        where: { userId, eventId: { in: eventIds } },
      });
      const artMap = new Map<string, { artistKey: string; artistName: string; plays: number; listenedMs: number }>();
      const eventMsMap = new Map(currentEvents.map((e) => [e.eventId, e.listenedMs]));

      for (const l of artistLinks) {
        const a = artMap.get(l.artistKey) || {
          artistKey: l.artistKey,
          artistName: l.artistName,
          plays: 0,
          listenedMs: 0,
        };
        a.plays += 1;
        a.listenedMs += eventMsMap.get(l.eventId) || 0;
        artMap.set(l.artistKey, a);
      }

      topArtists = Array.from(artMap.values())
        .sort((a, b) => b.plays - a.plays || b.listenedMs - a.listenedMs)
        .slice(0, 10)
        .map((a, idx) => ({
          rank: idx + 1,
          artistKey: a.artistKey,
          artistName: a.artistName,
          artistImage: null,
          plays: a.plays,
          listenedMs: a.listenedMs,
          percentage: totalListeningMs > 0 ? Math.min(100, Math.round((a.listenedMs / totalListeningMs) * 100)) : 0,
        }));
    }

    // 6. Heatmap Percentile Normalization (0-4)
    const heatmapAnalysis = normalizeHeatmap(heatmapMinutes);

    // 7. Comparisons & Deltas
    const prevListeningMs = prevEvents.reduce((s, e) => s + e.listenedMs, 0);
    const prevPlays = prevEvents.length;

    const timeDelta = calculateDelta(Math.round(totalListeningMs / 60000), Math.round(prevListeningMs / 60000));
    const playsDelta = calculateDelta(totalPlays, prevPlays);

    // 8. Discoveries: artists never heard before this period
    let discoveriesCount = 0;
    if (startDate) {
      const existingBeforePeriod = await prisma.userArtistStat.findMany({
        where: {
          userId,
          firstPlayed: { lt: startDate },
        },
        select: { artistKey: true },
      });
      const oldKeys = new Set(existingBeforePeriod.map((a) => a.artistKey));
      for (const art of topArtists) {
        if (!oldKeys.has(art.artistKey)) discoveriesCount++;
      }
    }

    // 9. Music Personality
    const topArtistSharePct = topArtists[0]?.percentage || 0;
    const topTrackSharePct = totalPlays > 0 && topTracks[0] ? Math.round((topTracks[0].plays / totalPlays) * 100) : 0;
    const skipRatePct = totalPlays > 0 ? Math.round((totalSkips / totalPlays) * 100) : 0;
    const discoveryRatePct = topArtists.length > 0 ? Math.round((discoveriesCount / topArtists.length) * 100) : 25;

    const musicPersonality = deriveMusicPersonality({
      totalPlays,
      nightPlays: totalNightPlays,
      morningPlays: totalMorningPlays,
      topArtistSharePct,
      topTrackSharePct,
      discoveryRatePct,
      skipRatePct,
      topArtistName: topArtists[0]?.artistName,
    });

    // 10. Timeline formatting (last 14 days or matching range)
    const timelineDays: Array<{ date: string; minutes: number }> = [];
    const timelineLength = range === 'week' ? 7 : range === 'month' ? 30 : 14;
    for (let i = timelineLength - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      timelineDays.push({
        date: k,
        minutes: timelineMap.get(k) || 0,
      });
    }

    const result = {
      range,
      totalListeningMs,
      totalListeningMinutes: Math.round(totalListeningMs / 60000),
      totalPlays,
      uniqueTracks: trackMap.size,
      uniqueArtists: topArtists.length,
      streakDays,
      activeDays: activeDaysSet.size,
      skipRatePct,
      comparisons: {
        time: timeDelta,
        plays: playsDelta,
        headline: typeof timeDelta.deltaPct === 'number'
          ? (timeDelta.deltaPct >= 0 ? `+${timeDelta.deltaPct}% more listening than last period` : `${timeDelta.deltaPct}% listening vs last period`)
          : 'First period insights recorded',
      },
      topArtists,
      topTracks,
      timeOfDayHeatmap: heatmapMinutes,
      heatmapNormalized: heatmapAnalysis.normalized,
      peakDay: heatmapAnalysis.peakDay,
      peakHour: heatmapAnalysis.peakHour,
      heatmapInsight: heatmapAnalysis.insight,
      timeline: timelineDays,
      discoveriesCount,
      musicPersonality,
      topGenres: Array.from(genreMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([genre, count]) => ({ genre, count })),
      topLanguages: Array.from(languageMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([language, count]) => ({ language, count })),
    };

    // Cache result with 5-minute TTL
    insightsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 5 * 60 * 1000 });

    return result;
  }

  /**
   * Chronological History grouped by session and day
   */
  static async getHistory(
    userId: string,
    options: {
      cursor?: string;
      limit?: number;
      search?: string;
      source?: string;
      dateRange?: 'today' | '7d' | '30d' | 'all';
    } = {}
  ) {
    const limit = Math.min(100, options.limit || 50);
    const where: any = { userId };

    if (options.search && options.search.trim().length > 0) {
      const q = options.search.trim();
      where.OR = [
        { trackTitle: { contains: q, mode: 'insensitive' } },
        { trackAlbum: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (options.source) {
      where.trackSource = options.source;
    }

    if (options.dateRange && options.dateRange !== 'all') {
      const now = new Date();
      if (options.dateRange === 'today') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        where.startedAt = { gte: todayStart };
      } else if (options.dateRange === '7d') {
        where.startedAt = { gte: new Date(now.getTime() - 7 * 86400000) };
      } else if (options.dateRange === '30d') {
        where.startedAt = { gte: new Date(now.getTime() - 30 * 86400000) };
      }
    }

    if (options.cursor) {
      where.startedAt = { lt: new Date(options.cursor) };
    }

    const events = await prisma.listeningEvent.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    const eventIds = events.map((e) => e.eventId);
    const artists = await prisma.listeningEventArtist.findMany({
      where: { userId, eventId: { in: eventIds } },
    });
    const artistByEvent = new Map<string, string>();
    for (const a of artists) {
      if (!artistByEvent.has(a.eventId) || a.isPrimary) {
        artistByEvent.set(a.eventId, a.artistName);
      }
    }

    const analyticsEvents: AnalyticsEvent[] = events.map((e) => ({
      eventId: e.eventId,
      userId: e.userId,
      trackId: e.trackId,
      trackTitle: e.trackTitle,
      trackAlbum: e.trackAlbum,
      artistName: artistByEvent.get(e.eventId) || 'Unknown Artist',
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      listenedMs: e.listenedMs,
      trackDurationMs: e.trackDurationMs,
      tzOffsetMin: e.tzOffsetMin,
      endReason: e.endReason,
      trackSource: e.trackSource,
      language: e.language,
      genre: e.genre,
      contextType: e.contextType,
      contextId: e.contextId,
      isSkip: e.isSkip,
      qualified: e.qualified,
      completed: e.completed,
    }));

    const sessions = groupIntoSessions(analyticsEvents);
    const nextCursor = events.length === limit ? events[events.length - 1].startedAt.toISOString() : null;

    return {
      sessions,
      events: analyticsEvents,
      totalCount: events.length,
      nextCursor,
    };
  }

  /**
   * Delete single listening event and adjust aggregates
   */
  static async deleteEvent(userId: string, eventId: string) {
    const ev = await prisma.listeningEvent.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (!ev) return { success: false, reason: 'not_found' };

    await prisma.$transaction(async (tx) => {
      // Delete artists
      await tx.listeningEventArtist.deleteMany({ where: { userId, eventId } });
      // Delete event
      await tx.listeningEvent.delete({ where: { userId_eventId: { userId, eventId } } });

      // If it was qualified, adjust rollups
      if (ev.qualified) {
        const { dow, hour } = getLocalTimeBuckets(ev.startedAt, ev.tzOffsetMin);
        const hourly = await tx.userHourlyStat.findUnique({
          where: { userId_dow_hour: { userId, dow, hour } },
        });
        if (hourly && hourly.listenedMs > BigInt(ev.listenedMs)) {
          await tx.userHourlyStat.update({
            where: { userId_dow_hour: { userId, dow, hour } },
            data: { listenedMs: { decrement: BigInt(ev.listenedMs) } },
          });
        }
      }
    });

    ListeningService._invalidateCache(userId);
    return { success: true, deletedEventId: eventId };
  }

  /**
   * Delete history range or all history and clear aggregates
   */
  static async deleteHistory(userId: string, options: { from?: Date; to?: Date; all?: boolean }) {
    if (options.all) {
      await prisma.$transaction([
        prisma.listeningEventArtist.deleteMany({ where: { userId } }),
        prisma.listeningEvent.deleteMany({ where: { userId } }),
        prisma.userArtistStat.deleteMany({ where: { userId } }),
        prisma.userHourlyStat.deleteMany({ where: { userId } }),
      ]);
      ListeningService._invalidateCache(userId);
      return { success: true, clearedAll: true };
    }

    const where: any = { userId };
    if (options.from || options.to) {
      where.startedAt = {};
      if (options.from) where.startedAt.gte = options.from;
      if (options.to) where.startedAt.lte = options.to;
    }

    const eventsToDelete = await prisma.listeningEvent.findMany({
      where,
      select: { eventId: true },
    });
    const ids = eventsToDelete.map((e) => e.eventId);

    if (ids.length > 0) {
      await prisma.$transaction([
        prisma.listeningEventArtist.deleteMany({ where: { userId, eventId: { in: ids } } }),
        prisma.listeningEvent.deleteMany({ where: { userId, eventId: { in: ids } } }),
      ]);
    }

    ListeningService._invalidateCache(userId);
    return { success: true, deletedCount: ids.length };
  }

  /**
   * Evaluates user milestone achievements
   */
  private static async _evaluateAchievements(userId: string) {
    const playCount = await prisma.listeningEvent.count({
      where: { userId, qualified: true },
    });
    if (playCount >= 1) {
      await prisma.userAchievement.upsert({
        where: { userId_badgeId: { userId, badgeId: 'first_play' } },
        create: { userId, badgeId: 'first_play', title: 'First Note' },
        update: {},
      }).catch(() => null);
    }
    if (playCount >= 50) {
      await prisma.userAchievement.upsert({
        where: { userId_badgeId: { userId, badgeId: 'plays_50' } },
        create: { userId, badgeId: 'plays_50', title: 'Club 50' },
        update: {},
      }).catch(() => null);
    }
  }

  /**
   * Fetches user achievements
   */
  static async getAchievements(userId: string) {
    return prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'desc' },
    });
  }
}
