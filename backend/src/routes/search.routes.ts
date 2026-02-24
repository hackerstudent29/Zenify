import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const searchSchema = z.object({
    q: z.string().min(1),
    type: z.enum(['track', 'artist', 'album', 'playlist', 'all']).default('all'),
    limit: z.coerce.number().default(10),
});

/**
 * Sort results by position of query in a given field (case-insensitive).
 * Position 0 = starts with query → highest priority.
 * Position 1 = 2nd letter matches, etc.
 * Falls back to full title alphabetical sort within same position group.
 */
function sortByPosition<T>(items: T[], getField: (item: T) => string, q: string): T[] {
    const qLower = q.toLowerCase();
    return [...items].sort((a, b) => {
        const posA = getField(a).toLowerCase().indexOf(qLower);
        const posB = getField(b).toLowerCase().indexOf(qLower);
        // -1 means not found (shouldn't happen for contains results) → push to end
        const rankA = posA === -1 ? 9999 : posA;
        const rankB = posB === -1 ? 9999 : posB;
        if (rankA !== rankB) return rankA - rankB;
        // Same position → alphabetical
        return getField(a).localeCompare(getField(b));
    });
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

        // Fetch a wider pool (3x limit) then positional-sort in JS to get priority order
        const fetchLimit = limit * 3;

        const [rawTracks, rawArtists, rawAlbums, rawPlaylists] = await Promise.all([

            // TRACKS — match title, artist name, genre, or album title
            wantTracks ? prisma.track.findMany({
                where: {
                    deletedAt: null,
                    OR: [
                        { title: { contains: q, mode: 'insensitive' } },
                        { artist: { name: { contains: q, mode: 'insensitive' } } },
                        { genre: { contains: q, mode: 'insensitive' } },
                        { album: { title: { contains: q, mode: 'insensitive' } } },
                    ],
                },
                include: { artist: true, album: true },
                take: fetchLimit,
            }) : Promise.resolve([]),

            // ARTISTS
            wantArtists ? prisma.artist.findMany({
                where: { name: { contains: q, mode: 'insensitive' } },
                take: fetchLimit,
            }) : Promise.resolve([]),

            // ALBUMS
            wantAlbums ? prisma.album.findMany({
                where: {
                    OR: [
                        { title: { contains: q, mode: 'insensitive' } },
                        { artist: { name: { contains: q, mode: 'insensitive' } } },
                    ],
                },
                include: { artist: true },
                take: fetchLimit,
            }) : Promise.resolve([]),

            // PLAYLISTS
            wantPlaylists ? prisma.playlist.findMany({
                where: {
                    isPublic: true,
                    name: { contains: q, mode: 'insensitive' },
                },
                take: fetchLimit,
            }) : Promise.resolve([]),
        ]);

        // Sort each by positional priority, then slice to requested limit
        const tracks = sortByPosition(rawTracks as any[], r => r.title, q).slice(0, limit);
        const artists = sortByPosition(rawArtists as any[], r => r.name, q).slice(0, limit);

        // Albums: sort then deduplicate by title
        const sortedAlbums = sortByPosition(rawAlbums as any[], r => r.title, q);
        const seenTitles = new Set<string>();
        const albums = sortedAlbums.filter((a: any) => {
            if (seenTitles.has(a.title)) return false;
            seenTitles.add(a.title);
            return true;
        }).slice(0, limit);

        const playlists = sortByPosition(rawPlaylists as any[], r => r.name, q).slice(0, limit);

        return { tracks, artists, albums, playlists };
    });
}
