import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const q = 'ethir';
    const limit = 5;
    const prefixPattern = `${q}%`;
    const pattern = `%${q}%`;
    console.log("Searching for:", pattern);
    
    try {
        const [tracks, artists, albums, playlists] = await Promise.all([
            prisma.$queryRawUnsafe(`
                SELECT 
                    t."id", t."title", t."genre", t."streams", t."like_count", t."duration", t."audioUrl", t."coverUrl",
                    json_build_object('name', a."name", 'id', a."id", 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as "artist",
                    json_build_object('title', al."title") as "album"
                FROM "Track" t
                LEFT JOIN "Artist" a ON t."artistId" = a."id"
                LEFT JOIN "Album" al ON t."albumId" = al."id"
                WHERE (t."title" ILIKE $1 OR t."title" ILIKE $2 OR a."name" ILIKE $1 OR a."name" ILIKE $2) AND t."deletedAt" IS NULL
                ORDER BY t."streams" DESC
                LIMIT $3
            `, prefixPattern, pattern, limit),
            prisma.$queryRawUnsafe(`
                SELECT 
                    a."id", a."name", a."follower_count", a."verified", a."imageUrl",
                    (SELECT COUNT(*) FROM "Track" t WHERE t."artistId" = a."id" AND t."deletedAt" IS NULL) as track_count
                FROM "Artist" a
                WHERE a."name" ILIKE $1 OR a."name" ILIKE $2
                ORDER BY a."follower_count" DESC
                LIMIT $3
            `, prefixPattern, pattern, limit),
            prisma.$queryRawUnsafe(`
                SELECT 
                    al."id", al."title", al."coverUrl",
                    json_build_object('name', a."name") as "artist"
                FROM "Album" al
                LEFT JOIN "Artist" a ON al."artistId" = a."id"
                WHERE (al."title" ILIKE $1 OR al."title" ILIKE $2 OR a."name" ILIKE $1 OR a."name" ILIKE $2)
                  AND EXISTS (
                      SELECT 1 FROM "Track" t 
                      WHERE t."albumId" = al."id" 
                      AND t."deletedAt" IS NULL
                  )
                ORDER BY al."title" ASC
                LIMIT $3
            `, prefixPattern, pattern, limit),
            prisma.$queryRawUnsafe(`
                SELECT 
                    "id", "name", "coverUrl", "follower_count"
                FROM "Playlist"
                WHERE ("name" ILIKE $1 OR "name" ILIKE $2) AND "isPublic" = true
                ORDER BY "follower_count" DESC
                LIMIT $3
            `, prefixPattern, pattern, limit)
        ]);

        console.log("Tracks:", tracks.length);
        console.log("Artists:", artists.length);
        console.log("Albums:", albums.length);
        console.log("Playlists:", playlists.length);
    } catch(e) {
        console.error("Error:", e);
    }
}
main().finally(() => prisma.$disconnect());
