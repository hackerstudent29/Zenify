
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const counts = {
        tracks: await prisma.track.count(),
        albums: await prisma.album.count(),
        artists: await prisma.artist.count()
    };
    console.log('COUNTS:', JSON.stringify(counts, null, 2));

    const sampleTracks = await prisma.track.findMany({ take: 5, select: { title: true } });
    console.log('SAMPLE TRACKS:', JSON.stringify(sampleTracks, null, 2));
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
