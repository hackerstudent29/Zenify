import { prisma } from '../utils/prisma';

export interface ReplayData {
  year: number;
  totalMinutes: number;
  totalTracksListened: number;
  totalCompletedTracks: number;
  longestStreakDays: number;
  persona: {
    title: string;
    description: string;
    badge: string;
  };
  topTracks: Array<{
    id: string;
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    minutes: number;
    playCount: number;
  }>;
  topArtists: Array<{
    name: string;
    minutes: number;
    playCount: number;
    coverUrl?: string;
  }>;
  hourlyDistribution: number[]; // 24 entries
  dayOfWeekDistribution: Array<{
    day: string;
    minutes: number;
    plays: number;
  }>;
  generatedAt: string;
}

export class ReplayAggregatorService {
  /**
   * Aggregate or fetch cached replay for a user & year
   */
  static async getReplay(userId: string, year: number, forceRefresh = false): Promise<{ enabled: boolean; replay?: ReplayData; message?: string }> {
    // 1. Check user personalization preferences
    const preferences = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (preferences && preferences.personalizationEnabled === false) {
      return {
        enabled: false,
        message: 'Personalization is disabled in your account settings. Turn on personalization to view your Replay.',
      };
    }

    // 2. Check for fresh cached snapshot (< 24 hours old) unless forceRefresh is true
    if (!forceRefresh) {
      const cached = await prisma.replaySnapshot.findUnique({
        where: {
          userId_year: {
            userId,
            year,
          },
        },
      });

      if (cached && cached.data) {
        const ageHours = (Date.now() - new Date(cached.generatedAt).getTime()) / (1000 * 60 * 60);
        if (ageHours < 24) {
          return { enabled: true, replay: cached.data as unknown as ReplayData };
        }
      }
    }

    // 3. Compute aggregation
    const replay = await this.computeReplay(userId, year);

    // 4. Save/update cached snapshot
    await prisma.replaySnapshot.upsert({
      where: {
        userId_year: {
          userId,
          year,
        },
      },
      update: {
        data: replay as any,
        generatedAt: new Date(),
      },
      create: {
        userId,
        year,
        data: replay as any,
        generatedAt: new Date(),
      },
    });

    return { enabled: true, replay };
  }

  /**
   * Compute full SQL/in-memory aggregation of ListenEvents for the target year
   */
  static async computeReplay(userId: string, year: number): Promise<ReplayData> {
    const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

    // Fetch all listen events for the year
    const events = await prisma.listenEvent.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        track: {
          select: {
            id: true,
            title: true,
            primaryArtists: true,
            coverUrl: true,
            duration: true,
            artist: {
              select: {
                name: true,
                imageUrl: true,
              },
            },
            album: {
              select: {
                title: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (events.length === 0) {
      return {
        year,
        totalMinutes: 0,
        totalTracksListened: 0,
        totalCompletedTracks: 0,
        longestStreakDays: 0,
        persona: {
          title: 'The Newcomer',
          description: 'Ready to embark on an incredible musical adventure.',
          badge: '🌱',
        },
        topTracks: [],
        topArtists: [],
        hourlyDistribution: new Array(24).fill(0),
        dayOfWeekDistribution: [
          { day: 'Sun', minutes: 0, plays: 0 },
          { day: 'Mon', minutes: 0, plays: 0 },
          { day: 'Tue', minutes: 0, plays: 0 },
          { day: 'Wed', minutes: 0, plays: 0 },
          { day: 'Thu', minutes: 0, plays: 0 },
          { day: 'Fri', minutes: 0, plays: 0 },
          { day: 'Sat', minutes: 0, plays: 0 },
        ],
        generatedAt: new Date().toISOString(),
      };
    }

    let totalMs = 0;
    let totalCompleted = 0;
    const hourly = new Array(24).fill(0);
    const dayOfWeek = [
      { day: 'Sun', minutes: 0, plays: 0 },
      { day: 'Mon', minutes: 0, plays: 0 },
      { day: 'Tue', minutes: 0, plays: 0 },
      { day: 'Wed', minutes: 0, plays: 0 },
      { day: 'Thu', minutes: 0, plays: 0 },
      { day: 'Fri', minutes: 0, plays: 0 },
      { day: 'Sat', minutes: 0, plays: 0 },
    ];

    const trackAgg = new Map<string, { track: any; minutes: number; plays: number }>();
    const artistAgg = new Map<string, { name: string; minutes: number; plays: number; coverUrl?: string }>();
    const activeDates = new Set<string>();

    for (const evt of events) {
      const ms = evt.msPlayed || 0;
      const mins = ms / 60000;
      totalMs += ms;

      if (evt.completed) totalCompleted++;

      // Hour & Day
      const date = new Date(evt.createdAt);
      const h = evt.hour !== null && evt.hour !== undefined ? evt.hour : date.getUTCHours();
      if (h >= 0 && h < 24) {
        hourly[h] += Math.round(mins);
      }

      const dow = date.getUTCDay();
      dayOfWeek[dow].minutes += Math.round(mins);
      dayOfWeek[dow].plays += 1;

      // Track Aggregation
      const tid = evt.trackId;
      const trk = evt.track;
      if (tid && trk) {
        const existing = trackAgg.get(tid) || { track: trk, minutes: 0, plays: 0 };
        existing.minutes += mins;
        existing.plays += 1;
        trackAgg.set(tid, existing);

        // Artist Aggregation
        const artistName = trk.artist?.name || trk.primaryArtists || 'Unknown Artist';
        const artistCover = trk.artist?.imageUrl || trk.coverUrl || undefined;
        const existingArtist = artistAgg.get(artistName) || {
          name: artistName,
          minutes: 0,
          plays: 0,
          coverUrl: artistCover,
        };
        existingArtist.minutes += mins;
        existingArtist.plays += 1;
        artistAgg.set(artistName, existingArtist);
      }

      // Date for streak
      if (ms >= 30000 || evt.completed) {
        const dateKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
        activeDates.add(dateKey);
      }
    }

    // Longest streak calculation
    const sortedDates = Array.from(activeDates).sort();
    let longestStreak = 0;
    let currentStreak = 0;
    let prevTime = 0;

    for (const dStr of sortedDates) {
      const curTime = new Date(dStr).getTime();
      if (prevTime === 0) {
        currentStreak = 1;
      } else {
        const diffDays = Math.round((curTime - prevTime) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          currentStreak++;
        } else if (diffDays > 1) {
          currentStreak = 1;
        }
      }
      prevTime = curTime;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    }

    // Top 5 Tracks
    const topTracks = Array.from(trackAgg.values())
      .sort((a, b) => b.minutes - a.minutes || b.plays - a.plays)
      .slice(0, 5)
      .map((item) => ({
        id: item.track.id,
        title: item.track.title,
        artist: item.track.artist?.name || item.track.primaryArtists || 'Unknown Artist',
        album: item.track.album?.title || undefined,
        coverUrl: item.track.coverUrl || undefined,
        minutes: Math.round(item.minutes),
        playCount: item.plays,
      }));

    // Top 5 Artists
    const topArtists = Array.from(artistAgg.values())
      .sort((a, b) => b.minutes - a.minutes || b.plays - a.plays)
      .slice(0, 5)
      .map((item) => ({
        name: item.name,
        minutes: Math.round(item.minutes),
        playCount: item.plays,
        coverUrl: item.coverUrl,
      }));

    // Listener Persona Logic
    const lateNightMins = (hourly[22] || 0) + (hourly[23] || 0) + (hourly[0] || 0) + (hourly[1] || 0) + (hourly[2] || 0) + (hourly[3] || 0) + (hourly[4] || 0);
    const morningMins = (hourly[5] || 0) + (hourly[6] || 0) + (hourly[7] || 0) + (hourly[8] || 0) + (hourly[9] || 0) + (hourly[10] || 0);
    const totalMinutes = Math.round(totalMs / 60000);
    const topArtistMinutes = topArtists[0]?.minutes || 0;
    const topArtistRatio = totalMinutes > 0 ? topArtistMinutes / totalMinutes : 0;

    let persona = {
      title: 'The Connoisseur',
      description: 'A balanced, refined ear with a soundtrack curated for every nuance of your day.',
      badge: '✨',
    };

    if (totalMinutes > 0) {
      if (lateNightMins / totalMinutes > 0.35) {
        persona = {
          title: 'Night Owl',
          description: 'Your best thoughts and favorite tunes happen under the neon lights and stars.',
          badge: '🦉',
        };
      } else if (morningMins / totalMinutes > 0.35) {
        persona = {
          title: 'Early Riser',
          description: 'Starting every sunrise with rhythm, focus, and unstoppable positive momentum.',
          badge: '🌅',
        };
      } else if (topArtistRatio > 0.45) {
        persona = {
          title: 'The Devotee',
          description: `When you love an artist like ${topArtists[0]?.name || 'your favorite'}, they become the pulse of your year.`,
          badge: '💎',
        };
      } else if (artistAgg.size > 20 && topArtistRatio < 0.2) {
        persona = {
          title: 'Sonic Explorer',
          description: 'Always on the hunt for new rhythms, traversing genres, borders, and uncharted sounds.',
          badge: '🚀',
        };
      }
    }

    return {
      year,
      totalMinutes,
      totalTracksListened: trackAgg.size,
      totalCompletedTracks: totalCompleted,
      longestStreakDays: longestStreak,
      persona,
      topTracks,
      topArtists,
      hourlyDistribution: hourly,
      dayOfWeekDistribution: dayOfWeek,
      generatedAt: new Date().toISOString(),
    };
  }
}
