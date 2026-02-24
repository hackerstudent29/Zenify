import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const searchSchema = z.object({
    q: z.string().min(1),
    type: z.enum(['track', 'artist', 'album', 'playlist', 'all']).default('all'),
    limit: z.coerce.number().default(10),
});

/** Sort by earliest position of q in field, then alphabetically within same position */
function rankByPosition<T>(items: T[], getField: (i: T) => string, q: string): T[] {
    const low = q.toLowerCase();
    return items
        .map(item => ({ item, pos: getField(item).toLowerCase().indexOf(low) }))
        .filter(x => x.pos !== -1)
        .sort((a, b) => a.pos !== b.pos ? a.pos - b.pos : getField(a.item).localeCompare(getField(b.item)))
        .map(x => x.item);
}

export async function searchRoutes(server: FastifyInstance) {
    server.get('/', {
        schema: { querystring: searchSchema }
    }, async (req: FastifyRequest<{ Querystring: z.infer<typeof searchSchema> }>, reply: FastifyReply) => {
        const { q, type, limit } = req.query;
        const pool = limit + 5; // Small over-fetch — just enough for positional sort

        const wantTracks = type === 'all' || type === 'track';
        const wantArtists = type === 'all' || type === 'artist';
        const wantAlbums = type === 'all' || type === 'album';
        const wantPlaylists = type === 'all' || type === 'playlist';

        // All 4 queries fire in parallel — each searches ONLY its primary display field for speed
        const [rawTracks, rawArtists, rawAlbums, rawPlaylists] = await Promise.all([

            wantTracks ? prisma.track.findMany({
                where: {
                    deletedAt: null,
                    title: { contains: q, mode: 'insensitive' },
                },
                include: { artist: true, album: true },
                take: pool,
            }) : Promise.resolve([]),

            wantArtists ? prisma.artist.findMany({
                where: { name: { contains: q, mode: 'insensitive' } },
                take: pool,
            }) : Promise.resolve([]),

            wantAlbums ? prisma.album.findMany({
                where: { title: { contains: q, mode: 'insensitive' } },
                include: { artist: true },
                take: pool,
            }) : Promise.resolve([]),

            wantPlaylists ? prisma.playlist.findMany({
                where: { isPublic: true, name: { contains: q, mode: 'insensitive' } },
                take: pool,
            }) : Promise.resolve([]),
        ]);

        // Rank by where q appears in the primary field, slice to limit
        const tracks = rankByPosition(rawTracks as any[], r => r.title, q).slice(0, limit);
        const artists = rankByPosition(rawArtists as any[], r => r.name, q).slice(0, limit);
        const playlists = rankByPosition(rawPlaylists as any[], r => r.name, q).slice(0, limit);

        // Albums: rank then deduplicate by title
        const seen = new Set<string>();
        const albums = rankByPosition(rawAlbums as any[], r => r.title, q)
            .filter((a: any) => seen.has(a.title) ? false : (seen.add(a.title), true))
            .slice(0, limit);

        return { tracks, artists, albums, playlists };
    });
}
