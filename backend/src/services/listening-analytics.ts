// backend/src/services/listening-analytics.ts
// Pure analytics functions for Zenify Insights & Replay

export interface AnalyticsEvent {
  eventId: string;
  userId: string;
  trackId: string;
  trackTitle: string;
  trackAlbum?: string | null;
  artistKey?: string;
  artistName?: string;
  startedAt: Date;
  endedAt: Date;
  listenedMs: number;
  trackDurationMs: number;
  tzOffsetMin: number;
  endReason?: string;
  trackSource?: string;
  language?: string | null;
  genre?: string | null;
  contextType?: string | null;
  contextId?: string | null;
  isSkip?: boolean;
  isRepeat?: boolean;
  qualified?: boolean;
  completed?: boolean;
}

export const LISTENING_CONFIG = {
  minQualifiedMs: 30000, // 30 seconds
  minQualifiedRatio: 0.5, // 50% for tracks under 60 seconds
  longTrackQualifiedMs: 240000, // 4 minutes
  skipThresholdMs: 10000, // under 10 seconds is considered a skip
  sessionGapMs: 30 * 60 * 1000, // 30 minutes inactivity divides sessions
  minPlaysForPersonality: 10, // minimum plays to unlock music persona
};

/**
 * Determines whether a listen event constitutes a qualified play
 */
export function isQualifiedPlay(listenedMs: number, trackDurationMs: number): boolean {
  if (listenedMs <= 0) return false;
  if (listenedMs >= LISTENING_CONFIG.longTrackQualifiedMs) return true;
  const threshold = Math.min(
    LISTENING_CONFIG.minQualifiedMs,
    trackDurationMs > 0 ? trackDurationMs * LISTENING_CONFIG.minQualifiedRatio : LISTENING_CONFIG.minQualifiedMs
  );
  return listenedMs >= threshold;
}

/**
 * Determines whether an event was an intentional skip
 */
export function isSkip(listenedMs: number, endReason?: string): boolean {
  if (listenedMs < LISTENING_CONFIG.skipThresholdMs) return true;
  return endReason === 'skipped' && listenedMs < LISTENING_CONFIG.minQualifiedMs;
}

/**
 * Normalizes and clamps real listened time to the track duration
 */
export function clampListenedMs(listenedMs: number, trackDurationMs: number): number {
  const safeListened = Math.max(0, listenedMs || 0);
  if (trackDurationMs > 0) {
    return Math.min(safeListened, trackDurationMs);
  }
  return safeListened;
}

/**
 * Checks if two events are duplicates (same track and started within 2 seconds)
 */
export function isDuplicateEvent(
  a: { trackId: string; startedAt: Date },
  b: { trackId: string; startedAt: Date }
): boolean {
  if (a.trackId !== b.trackId) return false;
  const diffMs = Math.abs(a.startedAt.getTime() - b.startedAt.getTime());
  return diffMs <= 2000;
}

/**
 * Converts a UTC date to the user's local day-of-week and hour using tzOffsetMin
 * tzOffsetMin is the offset in minutes from UTC (e.g., +330 for IST)
 */
export function getLocalTimeBuckets(date: Date, tzOffsetMin: number): { dow: number; hour: number; localDateStr: string } {
  const localEpoch = date.getTime() + tzOffsetMin * 60 * 1000;
  const localDate = new Date(localEpoch);
  const dow = localDate.getUTCDay(); // 0: Sunday ... 6: Saturday
  const hour = localDate.getUTCHours(); // 0 ... 23
  const y = localDate.getUTCFullYear();
  const m = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(localDate.getUTCDate()).padStart(2, '0');
  return { dow, hour, localDateStr: `${y}-${m}-${d}` };
}

/**
 * Computes 0-4 percentile-normalized heatmap levels to prevent single outlier wash-outs
 */
export function normalizeHeatmap(heatmapMinutes: number[][]): {
  matrix: number[][]; // original minutes
  normalized: number[][]; // 0-4 levels
  peakDay: number;
  peakHour: number;
  insight: string;
} {
  const normalized: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const nonZeroValues: number[] = [];
  let maxMinutes = 0;
  let peakDay = 0;
  let peakHour = 12;

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const val = heatmapMinutes[d]?.[h] || 0;
      if (val > 0) nonZeroValues.push(val);
      if (val > maxMinutes) {
        maxMinutes = val;
        peakDay = d;
        peakHour = h;
      }
    }
  }

  if (nonZeroValues.length > 0) {
    nonZeroValues.sort((a, b) => a - b);
    const maxVal = nonZeroValues[nonZeroValues.length - 1];
    const p25 = nonZeroValues[Math.floor(nonZeroValues.length * 0.25)] || 1;
    const p50 = nonZeroValues[Math.floor(nonZeroValues.length * 0.50)] || p25;
    const p75 = nonZeroValues[Math.min(nonZeroValues.length - 1, Math.floor(nonZeroValues.length * 0.75))] || p50;

    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const val = heatmapMinutes[d]?.[h] || 0;
        if (val <= 0) {
          normalized[d][h] = 0;
        } else if (val >= maxVal && maxVal > p50) {
          normalized[d][h] = 4;
        } else if (val <= p25) {
          normalized[d][h] = 1;
        } else if (val <= p50) {
          normalized[d][h] = 2;
        } else if (val <= p75 && p75 < maxVal) {
          normalized[d][h] = 3;
        } else {
          normalized[d][h] = 4;
        }
      }
    }
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[peakDay] || 'Friday';
  let timeOfDay = 'afternoons';
  if (peakHour >= 22 || peakHour < 5) timeOfDay = 'late nights';
  else if (peakHour < 12) timeOfDay = 'mornings';
  else if (peakHour < 17) timeOfDay = 'afternoons';
  else timeOfDay = 'evenings';

  const insight = maxMinutes > 0
    ? `You listen most on ${dayName} ${timeOfDay}.`
    : 'Listen regularly to unlock your listening rhythm heatmap.';

  return {
    matrix: heatmapMinutes,
    normalized,
    peakDay,
    peakHour,
    insight,
  };
}

/**
 * Computes delta percentage between current and previous values
 */
export function calculateDelta(current: number, previous: number): { current: number; previous: number; deltaPct: number | string } {
  if (previous <= 0) {
    return {
      current,
      previous,
      deltaPct: current > 0 ? 'new' : 0,
    };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    current,
    previous,
    deltaPct: pct,
  };
}

/**
 * Groups consecutive events into sessions separated by 30 min of inactivity
 */
export interface ListeningSession {
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  totalDurationMs: number;
  totalMinutes: number;
  trackCount: number;
  dominantArtist: string;
  dominantContext: string;
  events: AnalyticsEvent[];
}

export function groupIntoSessions(events: AnalyticsEvent[]): ListeningSession[] {
  if (!events || events.length === 0) return [];

  // Sort ascending by startedAt
  const sorted = [...events].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const sessions: ListeningSession[] = [];

  let currentBatch: AnalyticsEvent[] = [];

  for (const ev of sorted) {
    if (currentBatch.length === 0) {
      currentBatch.push(ev);
      continue;
    }

    const prev = currentBatch[currentBatch.length - 1];
    const gap = ev.startedAt.getTime() - prev.endedAt.getTime();

    if (gap > LISTENING_CONFIG.sessionGapMs) {
      sessions.push(_buildSession(currentBatch));
      currentBatch = [ev];
    } else {
      currentBatch.push(ev);
    }
  }

  if (currentBatch.length > 0) {
    sessions.push(_buildSession(currentBatch));
  }

  return sessions.reverse(); // Newest sessions first
}

function _buildSession(batch: AnalyticsEvent[]): ListeningSession {
  const startedAt = batch[0].startedAt;
  const endedAt = batch[batch.length - 1].endedAt;
  let totalDurationMs = 0;
  const artistCounts: Record<string, number> = {};
  const contextCounts: Record<string, number> = {};

  for (const ev of batch) {
    totalDurationMs += ev.listenedMs;
    const art = ev.artistName || 'Unknown Artist';
    artistCounts[art] = (artistCounts[art] || 0) + 1;
    const ctx = ev.contextType || 'search';
    contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
  }

  const dominantArtist = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown Artist';
  const dominantContext = Object.entries(contextCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'player';

  return {
    sessionId: `sess_${startedAt.getTime()}_${batch.length}`,
    startedAt,
    endedAt,
    totalDurationMs,
    totalMinutes: Math.round(totalDurationMs / 60000),
    trackCount: batch.length,
    dominantArtist,
    dominantContext,
    events: batch,
  };
}

/**
 * Deterministic rule-based music personality engine
 */
export function deriveMusicPersonality(params: {
  totalPlays: number;
  nightPlays: number;
  morningPlays: number;
  topArtistSharePct: number;
  topTrackSharePct: number;
  discoveryRatePct: number;
  skipRatePct: number;
  topArtistName?: string;
}): {
  title: string;
  subtitle: string;
  archetype: string;
  unlocked: boolean;
  signals: Record<string, any>;
} {
  const {
    totalPlays,
    nightPlays,
    morningPlays,
    topArtistSharePct,
    topTrackSharePct,
    discoveryRatePct,
    skipRatePct,
    topArtistName,
  } = params;

  if (totalPlays < LISTENING_CONFIG.minPlaysForPersonality) {
    return {
      title: 'Sonic Initiate',
      subtitle: `Listen to at least ${LISTENING_CONFIG.minPlaysForPersonality} qualified tracks to reveal your music personality.`,
      archetype: 'initiate',
      unlocked: false,
      signals: { totalPlays, required: LISTENING_CONFIG.minPlaysForPersonality },
    };
  }

  const nightRatio = nightPlays / totalPlays;
  const morningRatio = morningPlays / totalPlays;

  if (nightRatio >= 0.40) {
    return {
      title: 'Night Owl Melophile',
      subtitle: 'Your deepest listening journeys happen under moonlight and neon glow.',
      archetype: 'night_owl',
      unlocked: true,
      signals: { nightRatio: Math.round(nightRatio * 100) },
    };
  }

  if (morningRatio >= 0.40) {
    return {
      title: 'Daybreak Enthusiast',
      subtitle: 'You set the rhythm of your day with invigorating morning melodies.',
      archetype: 'daybreak',
      unlocked: true,
      signals: { morningRatio: Math.round(morningRatio * 100) },
    };
  }

  if (topArtistSharePct >= 40 && topArtistName) {
    return {
      title: 'Devoted Loyalist',
      subtitle: `You have an unshakeable musical devotion to ${topArtistName}.`,
      archetype: 'loyalist',
      unlocked: true,
      signals: { topArtistSharePct, topArtistName },
    };
  }

  if (topTrackSharePct >= 25) {
    return {
      title: 'Track Looper',
      subtitle: 'When an anthem clicks with your soul, you play it on pure repeat.',
      archetype: 'looper',
      unlocked: true,
      signals: { topTrackSharePct },
    };
  }

  if (discoveryRatePct >= 50) {
    return {
      title: 'Sonic Explorer',
      subtitle: 'Constantly charting uncharted musical horizons and discovering new voices.',
      archetype: 'explorer',
      unlocked: true,
      signals: { discoveryRatePct },
    };
  }

  if (skipRatePct <= 10) {
    return {
      title: 'Patient Connoisseur',
      subtitle: 'You savor every track from opening chord to final fade with deep respect.',
      archetype: 'connoisseur',
      unlocked: true,
      signals: { skipRatePct },
    };
  }

  return {
    title: 'Eclectic Harmonizer',
    subtitle: 'Traversing diverse musical landscapes, moods, and vibrations with ease.',
    archetype: 'harmonizer',
    unlocked: true,
    signals: { totalPlays },
  };
}
