import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const q = 'vairam';
    const limit = 5;
    const pattern = `%${q}%`;
    const prefixPattern = `${q}%`;

    console.log(`Testing search query for query: "${q}"`);
    
    try {
        const tracks = await prisma.$queryRawUnsafe(`
            SELECT 
                t."id", t."title", t."genre", t."streams", t."like_count", t."duration", t."audioUrl", t."coverUrl", t."palette",
                json_build_object('name', a."name", 'id', a."id", 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as "artist",
                json_build_object('title', al."title", 'palette', al."palette") as "album"
            FROM "Track" t
            LEFT JOIN "Artist" a ON t."artistId" = a."id"
            LEFT JOIN "Album" al ON t."albumId" = al."id"
            WHERE (t."title" ILIKE $1 OR t."title" ILIKE $2 OR a."name" ILIKE $1 OR a."name" ILIKE $2) 
              AND t."deletedAt" IS NULL
              AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
            ORDER BY t."streams" DESC NULLS LAST
            LIMIT $3
        `, prefixPattern, pattern, limit);

        console.log("Search Query Results:", JSON.stringify(tracks, null, 2));
    } catch (err: any) {
        console.error("Search Query Failed:", err.message);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
