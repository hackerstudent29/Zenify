import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Finding all tracks for artist ATLXS...");
    
    const artist = await prisma.artist.findUnique({
        where: { name: "ATLXS" },
        include: {
            tracks: {
                include: {
                    album: true
                }
            }
        }
    });

    if (!artist) {
        console.log("Artist ATLXS not found.");
        return;
    }

    console.log(`Found artist: ${artist.name} (${artist.id})`);
    console.log(`Tracks (${artist.tracks.length}):`);
    console.log(JSON.stringify(artist.tracks, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
