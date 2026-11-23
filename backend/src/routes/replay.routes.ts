import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { JioSaavnCatalogService } from '../services/jiosaavn-catalog.service.js';

export interface TrackMetaResponse {
  trackId: string;
  language: string;
  composers: string[];
  singers: string[];
  movie: string | null;
  country: string;
  year: number | null;
  genres: string[];
  albumId: string | null;
  durationMs: number | null;
  fetchedAt: string;
}

export async function replayRoutes(server: FastifyInstance) {
  const saavnService = new JioSaavnCatalogService();

  server.post('/enrich-tracks', {
    schema: {
      body: z.object({
        trackIds: z.array(z.string()).min(1).max(100),
      }),
    },
  }, async (request, reply) => {
    const { trackIds } = request.body as { trackIds: string[] };

    const results: TrackMetaResponse[] = [];
    const foundIds = new Set<string>();

    // 1. Resolve from Prisma Track DB
    try {
      const dbTracks = await prisma.track.findMany({
        where: {
          OR: [
            { id: { in: trackIds } },
            { providerId: { in: trackIds } },
            { youtubeId: { in: trackIds } },
          ],
        },
        include: {
          album: true,
          artist: true,
        },
      });

      for (const t of dbTracks) {
        const composersList = t.composers
          ? t.composers.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];

        const singersList: string[] = [];
        if (t.artist?.name) singersList.push(t.artist.name);
        if (t.primaryArtists) {
          t.primaryArtists.split(',').map((s: string) => s.trim()).forEach((a: string) => {
            if (a && !singersList.includes(a)) singersList.push(a);
          });
        }
        if (t.featuredArtists) {
          t.featuredArtists.split(',').map((s: string) => s.trim()).forEach((a: string) => {
            if (a && !singersList.includes(a)) singersList.push(a);
          });
        }

        const movie = t.album?.title || null;
        const country = t.countryCode || 'IN';
        const year = t.releaseDate ? t.releaseDate.getFullYear() : null;
        const genres = t.genre ? [t.genre] : (t.tags || []);
        const durationMs = t.duration ? t.duration * 1000 : null;

        const responseObj: TrackMetaResponse = {
          trackId: t.id,
          language: t.language || t.languageName || 'Tamil',
          composers: composersList.length > 0 ? composersList : (singersList.slice(0, 1)),
          singers: singersList,
          movie,
          country,
          year,
          genres,
          albumId: t.albumId || null,
          durationMs,
          fetchedAt: new Date().toISOString(),
        };

        results.push(responseObj);
        foundIds.add(t.id);
        if (t.providerId) foundIds.add(t.providerId);
        if (t.youtubeId) foundIds.add(t.youtubeId);
      }
    } catch (err: any) {
      server.log.warn(`[ReplayRoutes] Prisma lookup error: ${err.message}`);
    }

    // 2. For tracks not found in local DB, attempt resolution via JioSaavn catalog
    const remainingIds = trackIds.filter((id) => !foundIds.has(id));
    for (const rid of remainingIds) {
      try {
        const saavnTrack = await saavnService.getTrack(rid);
        if (saavnTrack) {
          const composers = saavnTrack.artists
            .filter((a) => a.role === 'music')
            .map((a) => a.name);
          const singers = saavnTrack.artists
            .filter((a) => a.role === 'singer' || a.role === 'primary' || a.role === 'featured')
            .map((a) => a.name);

          results.push({
            trackId: rid,
            language: saavnTrack.language || 'Tamil',
            composers: composers.length > 0 ? composers : [saavnTrack.primaryArtist?.name || 'Unknown'],
            singers: singers.length > 0 ? singers : [saavnTrack.primaryArtist?.name || 'Unknown'],
            movie: saavnTrack.albumTitle || null,
            country: 'IN',
            year: saavnTrack.year || (saavnTrack.releaseDate ? saavnTrack.releaseDate.getFullYear() : null),
            genres: saavnTrack.genre ? [saavnTrack.genre] : ['Soundtrack'],
            albumId: saavnTrack.albumId || null,
            durationMs: saavnTrack.duration ? saavnTrack.duration * 1000 : null,
            fetchedAt: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        // Silently continue for unresolved IDs
      }
    }

    return reply.send({ tracks: results });
  });

  // ---------------------------------------------------------------------------
  // F17: Replay Match & Musical Battle
  // ---------------------------------------------------------------------------

  interface MatchSnapshotPayload {
    userId?: string;
    displayName: string;
    periodKey: string;
    totalMinutes: number;
    uniqueSongsCount: number;
    uniqueArtistsCount: number;
    discoveryPct: number;
    topArtists: Record<string, number>; // normalized name -> weight (sum ~ 1.0)
    topTracks: string[]; // trackIds
    languageDistribution?: Record<string, number>;
    genreDistribution?: Record<string, number>;
    daypartDistribution: Record<string, number>;
    topGenre?: string;
    topLanguage?: string;
  }

  function weightedJaccard(a: Record<string, number>, b: Record<string, number>): number {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let sumMin = 0;
    let sumMax = 0;
    for (const k of keys) {
      const valA = a[k] || 0;
      const valB = b[k] || 0;
      sumMin += Math.min(valA, valB);
      sumMax += Math.max(valA, valB);
    }
    return sumMax > 0 ? sumMin / sumMax : 0;
  }

  function jaccard(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = new Set([...a, ...b]).size;
    return union > 0 ? intersection / union : 0;
  }

  function distOverlap(a: Record<string, number>, b: Record<string, number>): number {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let diffSum = 0;
    for (const k of keys) {
      diffSum += Math.abs((a[k] || 0) - (b[k] || 0));
    }
    return Math.max(0, 1 - 0.5 * diffSum);
  }

  // Temporary in-memory stores for matches and gifts (with expiration)
  const matchInvites = new Map<string, { snapshot: MatchSnapshotPayload; expiresAt: number }>();
  const giftsStore = new Map<string, {
    token: string;
    trackId: string;
    title: string;
    artist: string;
    coverUrl?: string;
    note: string;
    senderName?: string;
    createdAt: string;
    expiresAt: number;
    openedAt?: string;
  }>();

  server.post('/match/invite', {
    schema: {
      body: z.object({
        snapshot: z.any(),
      }),
    },
  }, async (request, reply) => {
    const { snapshot } = request.body as { snapshot: MatchSnapshotPayload };
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    matchInvites.set(inviteCode, { snapshot, expiresAt });
    return reply.send({
      inviteCode,
      shareUrl: `https://zenify.app/match/${inviteCode}`,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  });

  server.post('/match/calculate', {
    schema: {
      body: z.object({
        snapshotA: z.any(),
        snapshotB: z.any(),
      }),
    },
  }, async (request, reply) => {
    const { snapshotA, snapshotB } = request.body as {
      snapshotA: MatchSnapshotPayload;
      snapshotB: MatchSnapshotPayload;
    };

    const artistOverlap = weightedJaccard(snapshotA.topArtists, snapshotB.topArtists);
    const trackOverlap = jaccard(snapshotA.topTracks, snapshotB.topTracks);
    const daypartOverlap = distOverlap(snapshotA.daypartDistribution, snapshotB.daypartDistribution);

    let weightSum = 0.35 + 0.25 + 0.10;
    let scoreAcc = 0.35 * artistOverlap + 0.25 * trackOverlap + 0.10 * daypartOverlap;

    let languageOverlap: number | null = null;
    if (snapshotA.languageDistribution && snapshotB.languageDistribution) {
      languageOverlap = distOverlap(snapshotA.languageDistribution, snapshotB.languageDistribution);
      scoreAcc += 0.15 * languageOverlap;
      weightSum += 0.15;
    }

    let genreOverlap: number | null = null;
    if (snapshotA.genreDistribution && snapshotB.genreDistribution) {
      genreOverlap = distOverlap(snapshotA.genreDistribution, snapshotB.genreDistribution);
      scoreAcc += 0.15 * genreOverlap;
      weightSum += 0.15;
    }

    const compatibilityScore = Math.round(100 * (scoreAcc / weightSum));

    // Battle score: battleScore(me) = 0.5*h + 0.3*d + 0.2*u
    const totalHoursA = snapshotA.totalMinutes / 60;
    const totalHoursB = snapshotB.totalMinutes / 60;
    const h = (totalHoursA + totalHoursB) > 0 ? totalHoursA / (totalHoursA + totalHoursB) : 0.5;

    const discA = snapshotA.discoveryPct;
    const discB = snapshotB.discoveryPct;
    const d = (discA + discB) > 0 ? discA / (discA + discB) : 0.5;

    const uA = snapshotA.uniqueArtistsCount;
    const uB = snapshotB.uniqueArtistsCount;
    const u = (uA + uB) > 0 ? uA / (uA + uB) : 0.5;

    const battleScoreA = 0.5 * h + 0.3 * d + 0.2 * u;
    const battleScoreB = 1.0 - battleScoreA;

    let winner = 'draw';
    if (battleScoreA > 0.505) winner = 'A';
    else if (battleScoreB > 0.505) winner = 'B';

    // Shared artists & tracks
    const sharedArtists = Object.keys(snapshotA.topArtists).filter((a) => snapshotB.topArtists[a]);
    const sharedTracks = snapshotA.topTracks.filter((t) => snapshotB.topTracks.includes(t));

    return reply.send({
      compatibilityScore,
      artistOverlap: Math.round(artistOverlap * 100) / 100,
      trackOverlap: Math.round(trackOverlap * 100) / 100,
      daypartOverlap: Math.round(daypartOverlap * 100) / 100,
      languageOverlap: languageOverlap !== null ? Math.round(languageOverlap * 100) / 100 : null,
      genreOverlap: genreOverlap !== null ? Math.round(genreOverlap * 100) / 100 : null,
      battleScoreA: Math.round(battleScoreA * 1000) / 1000,
      battleScoreB: Math.round(battleScoreB * 1000) / 1000,
      winner,
      sharedArtists: sharedArtists.slice(0, 5),
      sharedTracks: sharedTracks.slice(0, 5),
    });
  });

  // ---------------------------------------------------------------------------
  // F18: Dedicate / Gift a Song
  // ---------------------------------------------------------------------------

  server.post('/gifts', {
    schema: {
      body: z.object({
        trackId: z.string(),
        title: z.string(),
        artist: z.string(),
        coverUrl: z.string().optional(),
        note: z.string().max(140),
        senderName: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { trackId, title, artist, coverUrl, note, senderName } = request.body as {
      trackId: string;
      title: string;
      artist: string;
      coverUrl?: string;
      note: string;
      senderName?: string;
    };

    const token = Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    const sanitizedNote = note.trim().slice(0, 140);
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    const gift = {
      token,
      trackId,
      title,
      artist,
      coverUrl,
      note: sanitizedNote,
      senderName: senderName || 'A Zenify Friend',
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    giftsStore.set(token, gift);

    return reply.send({
      token,
      giftUrl: `https://zenify.app/gift/${token}`,
      gift,
    });
  });

  server.get('/gifts/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const gift = giftsStore.get(token);

    if (!gift || Date.now() > gift.expiresAt) {
      return reply.status(404).send({
        error: 'Gift not found or has expired.',
      });
    }

    if (!gift.openedAt) {
      gift.openedAt = new Date().toISOString();
    }

    return reply.send({ gift });
  });
}
