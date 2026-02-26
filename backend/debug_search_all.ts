
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    console.log('--- ALL ALBUM TITLES ---');
    const allAlbums = await prisma.album.findMany({
        select: { title: true }
    });
    console.log(JSON.stringify(allAlbums.map(a => a.title), null, 2));

    console.log('\n--- TRACKS WITH "Maari" (Exact) ---');
    const tracksExact = await prisma.track.findMany({
        where: { title: "Maari" }
    });
    console.log('Tracks named "Maari":', tracksExact.length);

    console.log('\n--- TRACKS WITH TITLE CONTAINING "Maari" ---');
    const tracksLike = await prisma.track.findMany({
        where: { title: { contains: 'Maari', mode: 'insensitive' } }
    });
    console.log(JSON.stringify(tracksLike.map(t => t.title), null, 2));
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
