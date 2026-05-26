
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const artists = await prisma.artist.findMany({
        where: { name: { contains: 'Maari', mode: 'insensitive' } }
    });
    console.log('ARTISTS:', JSON.stringify(artists, null, 2));

    const allArtists = await prisma.artist.findMany({ select: { name: true }, take: 20 });
    console.log('ALL ARTISTS (first 20):', JSON.stringify(allArtists.map(a => a.name), null, 2));
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
