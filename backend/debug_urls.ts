
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const tracks = await prisma.track.findMany({
        where: { deletedAt: null },
        select: { title: true, coverUrl: true }
    });
    console.log('--- ALL TRACK URLS ---');
    tracks.forEach(t => {
        console.log(`[${t.title}]: ${t.coverUrl}`);
    });
    await prisma.$disconnect();
}

main();
