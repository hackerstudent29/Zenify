import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    try {
        const finalTsQuery = 'hello:*';
        const limit = 15;
        const tracks = await prisma.$queryRawUnsafe(
            `SELECT t."id" FROM "Track" t WHERE t."search_vector" @@ to_tsquery('simple', $1) LIMIT $2`,
            finalTsQuery, Prisma.sql`${limit}`
        );
        console.log(tracks);
    } catch (e: any) {
        console.error('ERROR MESSAGE Unsafe:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
