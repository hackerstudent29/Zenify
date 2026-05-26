
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const albums = await prisma.album.findMany({
        where: { title: { contains: 'Maari', mode: 'insensitive' } },
        include: {
            artist: true,
            _count: { select: { tracks: true } }
        }
    });
    console.log('--- ALBUMS MATCHING "Maari" ---');
    console.log(JSON.stringify(albums, null, 2));

    const tracks = await prisma.track.findMany({
        where: {
            OR: [
                { title: { contains: 'Maari', mode: 'insensitive' } },
                { album: { title: { contains: 'Maari', mode: 'insensitive' } } }
            ]
        },
        take: 10,
        include: { artist: true, album: true }
    });
    console.log('\n--- TRACKS MATCHING "Maari" ---');
    console.log(JSON.stringify(tracks.map(t => ({ id: t.id, title: t.title, album: t.album?.title, artist: t.artist.name })), null, 2));
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
