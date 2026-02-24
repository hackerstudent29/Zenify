
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const tracks = await prisma.track.findMany({
        where: { deletedAt: null },
    });

    console.log(`Total tracks: ${tracks.length}`);
    const noCover = tracks.filter(t => !t.coverUrl);
    console.log(`Tracks with no coverUrl: ${noCover.length}`);

    const localCover = tracks.filter(t => t.coverUrl && !t.coverUrl.startsWith('http'));
    console.log(`Tracks with local coverUrl: ${localCover.length}`);
    localCover.forEach(t => console.log(` - [${t.title}]: ${t.coverUrl}`));

    const artists = await prisma.artist.findMany();
    console.log(`Total artists: ${artists.length}`);
    const noArtistImage = artists.filter(a => !a.imageUrl);
    console.log(`Artists with no imageUrl: ${noArtistImage.length}`);

    await prisma.$disconnect();
}

main();
