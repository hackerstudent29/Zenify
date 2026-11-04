import { prisma } from '../utils/prisma';
import { getCacheVal, setCacheVal } from '../utils/cache';

export type DayMixSlot = 'morning' | 'afternoon' | 'evening' | 'late_night';

export interface DayMixSlotMeta {
  slot: DayMixSlot;
  title: string;
  subtitle: string;
  badge: string;
  hoursDescription: string;
  gradient: {
    from: string;
    via?: string;
    to: string;
    accent: string;
  };
}

export const DAY_MIX_SLOTS: Record<DayMixSlot, DayMixSlotMeta> = {
  morning: {
    slot: 'morning',
    title: 'Morning Flow',
    subtitle: 'Energizing rhythms and clean vibes to start your day with clarity and momentum.',
    badge: 'MORNING MIX • FRESH DAILY',
    hoursDescription: '5:00 AM – 11:00 AM',
    gradient: {
      from: '#f59e0b',
      via: '#ea580c',
      to: '#991b1b',
      accent: '#fbbf24',
    },
  },
  afternoon: {
    slot: 'afternoon',
    title: 'Afternoon Momentum',
    subtitle: 'Steady rhythms and upbeat anthems designed for deep work, study, and workouts.',
    badge: 'AFTERNOON MIX • FRESH DAILY',
    hoursDescription: '11:00 AM – 5:00 PM',
    gradient: {
      from: '#0284c7',
      via: '#2563eb',
      to: '#1e1b4b',
      accent: '#38bdf8',
    },
  },
  evening: {
    slot: 'evening',
    title: 'Evening Unwind',
    subtitle: 'Warm acoustic melodies, mellow beats, and smooth sounds to relax and reset.',
    badge: 'EVENING MIX • FRESH DAILY',
    hoursDescription: '5:00 PM – 10:00 PM',
    gradient: {
      from: '#9333ea',
      via: '#e11d48',
      to: '#4c0519',
      accent: '#f43f5e',
    },
  },
  late_night: {
    slot: 'late_night',
    title: 'Late Night Chill',
    subtitle: 'Atmospheric lo-fi, midnight resonance, and quiet reflections under the stars.',
    badge: 'NIGHT MIX • FRESH DAILY',
    hoursDescription: '10:00 PM – 5:00 AM',
    gradient: {
      from: '#312e81',
      via: '#1e1b4b',
      to: '#09090b',
      accent: '#818cf8',
    },
  },
};

const SLIM_TRACK_SELECT = {
  id: true,
  title: true,
  coverUrl: true,
  audioUrl: true,
  duration: true,
  genre: true,
  streams: true,
  engagement_score: true,
  bpm: true,
  language: true,
  aura_color: true,
  aura_vibe: true,
  palette: true,
  artist: {
    select: { id: true, name: true, imageUrl: true },
  },
  album: {
    select: { id: true, title: true, coverUrl: true, palette: true },
  },
};

function formatTrack(t: any) {
  return {
    id: t.id,
    title: t.title,
    coverUrl: t.coverUrl,
    audioUrl: t.audioUrl,
    duration: t.duration,
    genre: t.genre,
    aura_color: t.aura_color,
    aura_vibe: t.aura_vibe,
    artistId: t.artist?.id,
    palette: t.palette,
    artist: {
      id: t.artist?.id || '',
      name: t.artist?.name || 'Unknown Artist',
      imageUrl: t.artist?.imageUrl,
    },
    album: t.album
      ? {
          id: t.album.id,
          title: t.album.title,
          coverUrl: t.album.coverUrl,
          palette: t.album.palette,
        }
      : undefined,
  };
}

export function getUserLocalHour(timezone = 'UTC'): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);
    return isNaN(hour) ? now.getUTCHours() : hour % 24;
  } catch {
    return new Date().getUTCHours();
  }
}

export function getSlotForHour(hour: number): DayMixSlot {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

export class DayMixService {
  /**
   * Return metadata for all 4 slots
   */
  static getSlotsMeta() {
    return Object.values(DAY_MIX_SLOTS);
  }

  /**
   * Get personalized or catalog Day Mix for user & slot
   */
  static async getDayMix(userId: string, requestedSlot?: DayMixSlot) {
    // 1. Fetch user timezone & personalization preference
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        preferences: {
          select: { personalizationEnabled: true },
        },
      },
    });

    const tz = user?.timezone || 'UTC';
    const currentHour = getUserLocalHour(tz);
    const slot: DayMixSlot =
      requestedSlot && DAY_MIX_SLOTS[requestedSlot]
        ? requestedSlot
        : getSlotForHour(currentHour);

    const isPersonalized = user?.preferences?.personalizationEnabled !== false;

    // 2. Cache key (1 hour cache)
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `daymix:${userId}:${slot}:${today}:${isPersonalized ? 'p' : 'np'}`;
    const cached = await getCacheVal<any>(cacheKey);
    if (cached && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
      return cached;
    }

    // 3. Assemble tracks
    const selectedTracks: any[] = [];
    const seenTrackIds = new Set<string>();

    if (isPersonalized) {
      // Slot hour boundaries
      let startH = 5;
      let endH = 11;
      if (slot === 'afternoon') {
        startH = 11;
        endH = 17;
      } else if (slot === 'evening') {
        startH = 17;
        endH = 22;
      } else if (slot === 'late_night') {
        startH = 22;
        endH = 5;
      }

      // 7-day exclusion set
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentListens = await prisma.listenEvent.findMany({
        where: {
          userId,
          createdAt: { gte: sevenDaysAgo },
        },
        select: { trackId: true },
        take: 100,
      });
      const recentlyPlayedIds = new Set(recentListens.map((r) => r.trackId));

      // Part A: Top affinity tracks from user history matching this time slot
      const slotEvents = await prisma.listenEvent.findMany({
        where: {
          userId,
          completed: true,
          ...(slot === 'late_night'
            ? { OR: [{ hour: { gte: 22 } }, { hour: { lt: 5 } }] }
            : { hour: { gte: startH, lt: endH } }),
        },
        select: { trackId: true },
        distinct: ['trackId'],
        take: 30,
      });

      const slotTrackIds = slotEvents
        .map((e) => e.trackId)
        .filter((tid) => !recentlyPlayedIds.has(tid));

      if (slotTrackIds.length > 0) {
        const historyTracks = await prisma.track.findMany({
          where: {
            id: { in: slotTrackIds },
            deletedAt: null,
            audioUrl: { not: '' },
          },
          select: SLIM_TRACK_SELECT,
          take: 14,
        });

        for (const t of historyTracks) {
          if (!seenTrackIds.has(t.id)) {
            seenTrackIds.add(t.id);
            selectedTracks.push(formatTrack(t));
          }
        }
      }

      // Part B: Tracks from user's top affinity artists
      const topArtistAffinities = await prisma.userAffinity.findMany({
        where: {
          userId,
          kind: 'artist',
        },
        orderBy: { score: 'desc' },
        take: 5,
      });

      if (topArtistAffinities.length > 0) {
        const artistNames = topArtistAffinities.map((a) => a.key);
        const artistTracks = await prisma.track.findMany({
          where: {
            artist: { name: { in: artistNames, mode: 'insensitive' } },
            deletedAt: null,
            audioUrl: { not: '' },
          },
          orderBy: { streams: 'desc' },
          select: SLIM_TRACK_SELECT,
          take: 10,
        });

        for (const t of artistTracks) {
          if (!seenTrackIds.has(t.id) && selectedTracks.length < 24) {
            seenTrackIds.add(t.id);
            selectedTracks.push(formatTrack(t));
          }
        }
      }
    }

    // Part C: Pad with high-engagement catalog tracks matching slot vibe
    const needed = Math.max(0, 30 - selectedTracks.length);
    if (needed > 0) {
      const catalogTracks = await prisma.track.findMany({
        where: {
          deletedAt: null,
          audioUrl: { not: '' },
          id: { notIn: Array.from(seenTrackIds) },
        },
        orderBy: [{ engagement_score: 'desc' }, { streams: 'desc' }],
        select: SLIM_TRACK_SELECT,
        take: needed,
      });

      for (const t of catalogTracks) {
        if (!seenTrackIds.has(t.id)) {
          seenTrackIds.add(t.id);
          selectedTracks.push(formatTrack(t));
        }
      }
    }

    const result = {
      slot,
      meta: DAY_MIX_SLOTS[slot],
      tracks: selectedTracks,
      totalDuration: selectedTracks.reduce((acc, t) => acc + (t.duration || 0), 0),
      updatedAt: new Date().toISOString(),
    };

    // Cache in Redis for 1 hour
    await setCacheVal(cacheKey, result, 3600);

    return result;
  }
}

