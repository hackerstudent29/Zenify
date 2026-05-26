
import { prisma } from './src/utils/prisma';

async function checkArtists() {
    const artists = await prisma.artist.findMany({
        select: { name: true, bio: true, birthDate: true, imageUrl: true }
    });
    console.log(JSON.stringify(artists, null, 2));
}

checkArtists().catch(console.error);
