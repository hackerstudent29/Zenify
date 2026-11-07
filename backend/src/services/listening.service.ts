import { prisma } from '../utils/prisma';

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

export class ListeningService {
  /**
   * Batch ingest listen events from device journal with deduplication and rollup updates
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

    for (const ev of events) {
      if (!ev.eventId || !ev.trackId || !ev.startedAt || !ev.endedAt) continue;

      // 2. Check deduplication
      const existing = await prisma.listeningEvent.findUnique({
        where: {
          userId_eventId: {
            userId,
            eventId: ev.eventId,
          },
        },
        select: { eventId: true },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      // 3. Determine if qualified play
      const listenedMs = Math.max(0, ev.listenedMs || 0);
      const trackDurationMs = Math.max(0, ev.trackDurationMs || 0);
      const qualified =
        listenedMs >= 30000 || (trackDurationMs > 0 && trackDurationMs < 60000 && listenedMs * 2 >= trackDurationMs);

      const startedAtDate = new Date(ev.startedAt);
      const endedAtDate = new Date(ev.endedAt);

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
        },
      });

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
        }).catch(() => null); // Ignore unique conflicts safely
      }

      // 6. Update rollups if play was qualified
      if (qualified) {
        // Rollup: UserArtistStat
        for (const art of artists) {
          const artistKey = art.artistKey.trim() || 'unknown';
          const artistName = art.artistName.trim() || 'Unknown Artist';

          const existingStat = await prisma.userArtistStat.findUnique({
            where: {
              userId_artistKey: {
                userId,
                artistKey,
              },
            },
          });

          if (existingStat) {
            await prisma.userArtistStat.update({
              where: {
                userId_artistKey: {
                  userId,
                  artistKey,
                },
              },
              data: {
                plays: { increment: 1 },
                listenedMs: { increment: BigInt(listenedMs) },
                lastPlayed: endedAtDate,
                artistName,
                artistImage: art.artistImage || existingStat.artistImage,
              },
            });
          } else {
            await prisma.userArtistStat.create({
              data: {
                userId,
                artistKey,
                artistName,
                artistImage: art.artistImage || null,
                plays: 1,
                listenedMs: BigInt(listenedMs),
                firstPlayed: startedAtDate,
                lastPlayed: endedAtDate,
              },
            }).catch(() => null);
          }
        }

        // Rollup: UserHourlyStat (Day of week 0-6: dow, Hour 0-23: hour in user's local timezone)
        const localTimestampMs = startedAtDate.getTime() + (ev.tzOffsetMin ?? 0) * 60 * 1000;
        const localDate = new Date(localTimestampMs);
        const dow = localDate.getUTCDay();
        const hour = localDate.getUTCHours();

        const existingHourly = await prisma.userHourlyStat.findUnique({
          where: {
            userId_dow_hour: {
              userId,
              dow,
              hour,
            },
          },
        });

        if (existingHourly) {
          await prisma.userHourlyStat.update({
            where: {
              userId_dow_hour: {
                userId,
                dow,
                hour,
              },
            },
            data: {
              listenedMs: { increment: BigInt(listenedMs) },
            },
          });
        } else {
          await prisma.userHourlyStat.create({
            data: {
              userId,
              dow,
              hour,
              listenedMs: BigInt(listenedMs),
            },
          }).catch(() => null);
        }
      }

      accepted++;
    }

    return { accepted, duplicates, skipped: 0 };
  }

  /**
   * Aggregate insights for Apple Music Replay style view
   */
  static async getInsights(userId: string, range: 'week' | 'month' | 'year' | 'all' = 'all') {
    const now = new Date();
    let startDate: Date | null = null;

    if (range === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === 'month') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === 'year') {
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    }

    const whereClause: any = {
      userId,
      qualified: true,
    };

    if (startDate) {
      whereClause.startedAt = { gte: startDate };
    }

    // 1. Fetch qualified events in range
    const events = await prisma.listeningEvent.findMany({
      where: whereClause,
      select: {
        eventId: true,
        trackId: true,
        trackTitle: true,
        trackAlbum: true,
        listenedMs: true,
        startedAt: true,
        tzOffsetMin: true,
        genre: true,
        language: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 2000,
    });

    const totalPlays = events.length;
    let totalListeningMs = 0;
    const trackMap = new Map<string, { trackId: string; trackTitle: string; trackAlbum?: string; plays: number; listenedMs: number }>();
    const genreMap = new Map<string, number>();
    const languageMap = new Map<string, number>();
    const activeDaysSet = new Set<string>();

    for (const ev of events) {
      totalListeningMs += ev.listenedMs;

      // Group tracks
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

      // Group genres & languages
      if (ev.genre) {
        genreMap.set(ev.genre, (genreMap.get(ev.genre) || 0) + 1);
      }
      if (ev.language) {
        languageMap.set(ev.language, (languageMap.get(ev.language) || 0) + 1);
      }

      // Track streak days
      const localTime = new Date(ev.startedAt.getTime() + (ev.tzOffsetMin || 0) * 60000);
      const dateKey = `${localTime.getUTCFullYear()}-${String(localTime.getUTCMonth() + 1).padStart(2, '0')}-${String(localTime.getUTCDate()).padStart(2, '0')}`;
      activeDaysSet.add(dateKey);
    }

    // 2. Compute streak (consecutive days leading up to today or yesterday)
    let streakDays = 0;
    const checkDate = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(checkDate.getTime() - i * 86400000);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (activeDaysSet.has(dateKey)) {
        streakDays++;
      } else {
        if (i === 0) {
          // Today hasn't had a listen yet, check if yesterday was active
          continue;
        }
        break;
      }
    }

    // 3. Top tracks sorted by plays then listenedMs
    const topTracks = Array.from(trackMap.values())
      .sort((a, b) => b.plays - a.plays || b.listenedMs - a.listenedMs)
      .slice(0, 10)
      .map((t, idx) => ({
        rank: idx + 1,
        ...t,
      }));

    // 4. Top Artists: if 'all', we can use pre-aggregated UserArtistStat for maximum performance
    let topArtists: Array<{
      rank: number;
      artistKey: string;
      artistName: string;
      artistImage: string | null;
      plays: number;
      listenedMs: number;
      percentage: number;
    }> = [];

    if (range === 'all') {
      const artistStats = await prisma.userArtistStat.findMany({
        where: { userId },
        orderBy: [{ plays: 'desc' }, { listenedMs: 'desc' }],
        take: 10,
      });

      topArtists = artistStats.map((st, idx) => ({
        rank: idx + 1,
        artistKey: st.artistKey,
        artistName: st.artistName,
        artistImage: st.artistImage,
        plays: st.plays,
        listenedMs: Number(st.listenedMs),
        percentage: totalListeningMs > 0 ? Math.min(100, Math.round((Number(st.listenedMs) / totalListeningMs) * 100)) : 0,
      }));
    } else {
      // Range-filtered artist query
      const eventIds = events.map(e => e.eventId);
      if (eventIds.length > 0) {
        const artistLinks = await prisma.listeningEventArtist.findMany({
          where: {
            userId,
            eventId: { in: eventIds },
          },
        });

        const artMap = new Map<string, { artistKey: string; artistName: string; plays: number; listenedMs: number }>();
        const eventMsMap = new Map(events.map(e => [e.eventId, e.listenedMs]));

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
    }

    // 5. 24x7 Time-of-Day Heatmap
    // 7 days (0: Sun to 6: Sat), 24 hours (0 to 23)
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    if (range === 'all') {
      const hourlyStats = await prisma.userHourlyStat.findMany({
        where: { userId },
      });
      for (const h of hourlyStats) {
        if (h.dow >= 0 && h.dow <= 6 && h.hour >= 0 && h.hour <= 23) {
          // Heatmap shows listening minutes
          heatmap[h.dow][h.hour] = Math.round(Number(h.listenedMs) / 60000);
        }
      }
    } else {
      for (const ev of events) {
        const localTime = new Date(ev.startedAt.getTime() + (ev.tzOffsetMin || 0) * 60000);
        const day = localTime.getUTCDay();
        const hr = localTime.getUTCHours();
        heatmap[day][hr] += Math.round(ev.listenedMs / 60000);
      }
    }

    // 6. Music Personality / Persona derivation
    let nightPlays = 0;
    let morningPlays = 0;
    let totalHeatmapPlays = 0;

    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const count = heatmap[d][h];
        totalHeatmapPlays += count;
        if (h >= 22 || h <= 4) nightPlays += count;
        if (h >= 5 && h <= 11) morningPlays += count;
      }
    }

    let persona = 'Eclectic Harmonizer';
    let personaSubtitle = 'You enjoy a wide musical spectrum across all hours of the day.';

    if (totalHeatmapPlays > 5) {
      if (nightPlays / totalHeatmapPlays > 0.45) {
        persona = 'Night Owl Melophile';
        personaSubtitle = 'Your music comes alive after midnight under the neon lights.';
      } else if (morningPlays / totalHeatmapPlays > 0.45) {
        persona = 'Daybreak Enthusiast';
        personaSubtitle = 'You power your mornings with energetic rhythms and inspiring melodies.';
      } else if (topArtists.length > 0 && topArtists[0].percentage > 45) {
        persona = 'Devoted Loyalist';
        personaSubtitle = `You have an unbreakable bond with ${topArtists[0].artistName}.`;
      } else if (topTracks.length > 0 && topTracks[0].plays > totalPlays * 0.3) {
        persona = 'Track Looper';
        personaSubtitle = 'When you find a masterpiece, you keep it spinning on repeat.';
      } else {
        persona = 'Sonic Explorer';
        personaSubtitle = 'Constantly seeking fresh vibrations and traversing diverse landscapes.';
      }
    }

    // 7. Followed artists count
    const followedCount = await prisma.artistFollow.count({
      where: { userId },
    });

    return {
      range,
      totalListeningMs,
      totalPlays,
      uniqueTracks: trackMap.size,
      uniqueArtists: topArtists.length,
      streakDays,
      topArtists,
      topTracks,
      timeOfDayHeatmap: heatmap,
      musicPersonality: {
        title: persona,
        subtitle: personaSubtitle,
      },
      topGenres: Array.from(genreMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, count]) => ({ genre, count })),
      topLanguages: Array.from(languageMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([language, count]) => ({ language, count })),
      followedArtistsCount: followedCount,
    };
  }
}
