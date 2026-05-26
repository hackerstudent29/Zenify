
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const artist = await prisma.artist.findFirst({
        where: { name: "Dhanush & Anirudh Ravichander" }
    });
    if (artist) {
        const tracks = await prisma.track.findMany({
            where: { artistId: artist.id },
            include: { album: true }
        });
        console.log('TRACKS FOR Dhanush & Anirudh Ravichander:', JSON.stringify(tracks.map(t => ({ title: t.title, album: t.album?.title })), null, 2));
    } else {
        console.log('Artist not found.');
    }
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
