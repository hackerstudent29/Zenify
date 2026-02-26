
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    console.log('--- LATEST 10 ALBUMS ---');
    const albums = await prisma.album.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { artist: true }
    });
    console.log(JSON.stringify(albums.map(a => ({ id: a.id, title: a.title, artist: a.artist.name, createdAt: a.createdAt })), null, 2));

    console.log('\n--- LATEST 10 TRACKS ---');
    const tracks = await prisma.track.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { artist: true, album: true }
    });
    console.log(JSON.stringify(tracks.map(t => ({ id: t.id, title: t.title, album: t.album?.title, artist: t.artist.name, createdAt: t.createdAt })), null, 2));
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
