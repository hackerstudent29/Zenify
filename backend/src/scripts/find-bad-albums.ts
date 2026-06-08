import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("=== Checking Tracks and Artists ===");
    const tracks = await prisma.track.findMany({
        select: {
            id: true,
            title: true,
            artistId: true,
            artist: true
        }
    });

    console.log(`Total tracks in database: ${tracks.length}`);
    
    let missingRelation = 0;
    const missingArtistRecords = new Set();
    
    for (const t of tracks) {
        if (!t.artist) {
            missingRelation++;
            missingArtistRecords.add(t.artistId);
        }
    }

    console.log(`Tracks with missing artist relation: ${missingRelation}`);
    if (missingArtistRecords.size > 0) {
        console.log("Missing Artist IDs:", Array.from(missingArtistRecords));
    } else {
        console.log("All tracks have valid artist relations in database.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
