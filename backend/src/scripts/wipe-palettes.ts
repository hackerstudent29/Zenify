import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Wiping all old muddy palettes using raw SQL to bypass timeouts...");
    
    // Use raw SQL for instant wipe instead of Prisma's updateMany which can timeout
    const tracksRes = await prisma.$executeRawUnsafe(`UPDATE "Track" SET "palette" = NULL;`);
    console.log(`Cleared palettes for tracks`);
    
    const albumsRes = await prisma.$executeRawUnsafe(`UPDATE "Album" SET "palette" = NULL;`);
    console.log(`Cleared palettes for albums`);

    console.log("Done wiping DB!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
