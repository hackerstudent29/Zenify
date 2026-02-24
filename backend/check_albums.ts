
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const albums = await prisma.album.findMany({
        include: { artist: true }
    });
    console.log('--- ALBUMS ---');
    console.log(JSON.stringify(albums, null, 2));
    await prisma.$disconnect();
}

main();
