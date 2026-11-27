import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { JioSaavnCatalogService } from '../services/jiosaavn-catalog.service';
import { rateLimit } from '../security/rateLimit';

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

export interface ReplayRoutesOptions {
  /** Optional strict preHandler that rejects unauthenticated callers. */
  authenticate?: (req: any, reply: any) => Promise<unknown> | unknown;
  /** Optional non-blocking authenticator to identify signed-in users for rate-limit keys. */
  optionalAuthenticate?: (req: any, reply: any) => Promise<unknown> | unknown;
}

export async function replayRoutes(server: FastifyInstance, opts: ReplayRoutesOptions = {}) {
  const saavnService = new JioSaavnCatalogService();
  const strictAuth = opts.authenticate;
  const optAuth = opts.optionalAuthenticate ?? (server as any).optionalAuthenticate;
  const authHook = strictAuth ?? optAuth;
  const limit = rateLimit({ windowMs: 60_000, max: 20 });

  server.post('/enrich-tracks', {
    preHandler: authHook ? [authHook, limit] : [limit],
    schema: {
      body: z.object({
        // bounded ids (video ids / provider ids): no free-form strings reach the DB or the catalog
        trackIds: z.array(z.string().min(1).max(64).regex(/^[\w\-:.]+$/)).min(1).max(100),
      }).strict(),
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
    // Resolve in small parallel batches (bounded) instead of up to 100 sequential calls.
    const resolveOne = async (rid: string): Promise<TrackMetaResponse | null> => {
      try {
        const saavnTrack = await saavnService.getTrack(rid);
        if (!saavnTrack) return null;
        const composers = saavnTrack.artists
          .filter((a) => a.role === 'music')
          .map((a) => a.name);
        const singers = saavnTrack.artists
          .filter((a) => a.role === 'singer' || a.role === 'primary' || a.role === 'featured')
          .map((a) => a.name);
        return {
          trackId: rid,
          language: saavnTrack.language || 'Unknown', // never guess a language
          composers: composers.length > 0 ? composers : [saavnTrack.primaryArtist?.name || 'Unknown'],
          singers: singers.length > 0 ? singers : [saavnTrack.primaryArtist?.name || 'Unknown'],
          movie: saavnTrack.albumTitle || null,
          country: 'IN',
          year: saavnTrack.year || (saavnTrack.releaseDate ? saavnTrack.releaseDate.getFullYear() : null),
          genres: saavnTrack.genre ? [saavnTrack.genre] : ['Soundtrack'],
          albumId: saavnTrack.albumId || null,
          durationMs: saavnTrack.duration ? saavnTrack.duration * 1000 : null,
          fetchedAt: new Date().toISOString(),
        };
      } catch {
        return null; // unresolved ids are simply skipped
      }
    };
    for (let i = 0; i < remainingIds.length; i += 5) {
      const batch = await Promise.all(remainingIds.slice(i, i + 5).map(resolveOne));
      for (const r of batch) if (r) results.push(r);
    }

    return reply.send({ tracks: results });
  });

  // Match & Gift endpoints now live in social.routes.ts (authenticated, validated,
  // persistent). Mount them with: server.register(socialRoutes({ store, auth, publicBaseUrl })).
}
