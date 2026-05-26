
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const tracks = await prisma.track.findMany({
        where: { deletedAt: null },
        select: { title: true, coverUrl: true }
    });
    console.log('--- TRACKS WITH LOCAL OR NULL URLS ---');
    tracks.forEach(t => {
        if (!t.coverUrl || !t.coverUrl.startsWith('http')) {
            console.log(`[${t.title}]: ${t.coverUrl}`);
        }
    });
    await prisma.$disconnect();
}

main();
