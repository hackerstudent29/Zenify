import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const searchSchema = z.object({
    q: z.string().min(1),
    type: z.enum(['track', 'artist', 'album', 'playlist', 'all']).default('all'),
    limit: z.coerce.number().default(10),
});

/** Merge priority (startsWith) + secondary (contains) results up to `limit` */
function mergeResults(priority: any[], secondary: any[], limit: number): any[] {
    const seen = new Set(priority.map((r: any) => r.id));
    const result = [...priority];
    for (const item of secondary) {
        if (result.length >= limit) break;
        if (!seen.has(item.id)) {
            seen.add(item.id);
            result.push(item);
        }
    }
    return result;
}

export async function searchRoutes(server: FastifyInstance) {
    server.get('/', {
        schema: { querystring: searchSchema }
    }, async (req: FastifyRequest<{ Querystring: z.infer<typeof searchSchema> }>, reply: FastifyReply) => {
        const { q, type, limit } = req.query;

        const wantTracks = type === 'all' || type === 'track';
        const wantArtists = type === 'all' || type === 'artist';
        const wantAlbums = type === 'all' || type === 'album';
        const wantPlaylists = type === 'all' || type === 'playlist';

        // Run ALL 8 priority + fallback queries in parallel simultaneously
        const [
            trackSW, trackContains,
            artistSW, artistContains,
            albumSW, albumContains,
            playlistSW, playlistContains,
        ] = await Promise.all([

            // ── TRACKS: starts-with title ──────────────────────────────────────
            wantTracks ? prisma.track.findMany({
                where: {
                    deletedAt: null,
                    title: { startsWith: q, mode: 'insensitive' },
                },
                include: { artist: true, album: true },
                take: limit,
            }) : Promise.resolve([]),

            // ── TRACKS: contains anywhere (title / artist / genre / album) ─────
            wantTracks ? prisma.track.findMany({
                where: {
                    deletedAt: null,
                    NOT: { title: { startsWith: q, mode: 'insensitive' } },
                    OR: [
                        { title: { contains: q, mode: 'insensitive' } },
                        { artist: { name: { contains: q, mode: 'insensitive' } } },
                        { genre: { contains: q, mode: 'insensitive' } },
                        { album: { title: { contains: q, mode: 'insensitive' } } },
                    ],
                },
                include: { artist: true, album: true },
                take: limit,
            }) : Promise.resolve([]),

            // ── ARTISTS: starts-with ───────────────────────────────────────────
            wantArtists ? prisma.artist.findMany({
                where: { name: { startsWith: q, mode: 'insensitive' } },
                take: limit,
            }) : Promise.resolve([]),

            // ── ARTISTS: contains ──────────────────────────────────────────────
            wantArtists ? prisma.artist.findMany({
                where: {
                    name: { contains: q, mode: 'insensitive' },
                    NOT: { name: { startsWith: q, mode: 'insensitive' } },
                },
                take: limit,
            }) : Promise.resolve([]),

            // ── ALBUMS: starts-with ────────────────────────────────────────────
            wantAlbums ? prisma.album.findMany({
                where: { title: { startsWith: q, mode: 'insensitive' } },
                include: { artist: true },
                take: limit,
            }) : Promise.resolve([]),

            // ── ALBUMS: contains ───────────────────────────────────────────────
            wantAlbums ? prisma.album.findMany({
                where: {
                    NOT: { title: { startsWith: q, mode: 'insensitive' } },
                    OR: [
                        { title: { contains: q, mode: 'insensitive' } },
                        { artist: { name: { contains: q, mode: 'insensitive' } } },
                    ],
                },
                include: { artist: true },
                take: limit,
            }) : Promise.resolve([]),

            // ── PLAYLISTS: starts-with ─────────────────────────────────────────
            wantPlaylists ? prisma.playlist.findMany({
                where: { isPublic: true, name: { startsWith: q, mode: 'insensitive' } },
                take: limit,
            }) : Promise.resolve([]),

            // ── PLAYLISTS: contains ────────────────────────────────────────────
            wantPlaylists ? prisma.playlist.findMany({
                where: {
                    isPublic: true,
                    NOT: { name: { startsWith: q, mode: 'insensitive' } },
                    name: { contains: q, mode: 'insensitive' },
                },
                take: limit,
            }) : Promise.resolve([]),
        ]);

        // Merge priority-first, then deduplicate albums by title
        const rawAlbums = mergeResults(albumSW as any[], albumContains as any[], limit);
        const seenTitles = new Set<string>();
        const deduplicatedAlbums = rawAlbums.filter((a: any) => {
            if (seenTitles.has(a.title)) return false;
            seenTitles.add(a.title);
            return true;
        });

        return {
            tracks: mergeResults(trackSW as any[], trackContains as any[], limit),
            artists: mergeResults(artistSW as any[], artistContains as any[], limit),
            albums: deduplicatedAlbums,
            playlists: mergeResults(playlistSW as any[], playlistContains as any[], limit),
        };
    });
}
