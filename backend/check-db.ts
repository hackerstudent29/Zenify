import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const trackCount = await prisma.track.count();
    const albumCount = await prisma.album.count();
    const artistCount = await prisma.artist.count();

    console.log('--- DB SUMMARY ---');
    console.log('Tracks:', trackCount);
    console.log('Albums:', albumCount);
    console.log('Artists:', artistCount);

    if (trackCount > 0) {
        console.log('\n--- LATEST TRACKS ---');
        const tracks = await prisma.track.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { artist: true, album: true }
        });
        tracks.forEach(t => {
            console.log(`[${t.id}] ${t.title} by ${t.artist?.name} (Album: ${t.album?.title || 'None'})`);
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
