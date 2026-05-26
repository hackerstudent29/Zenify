const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const albums = await prisma.album.findMany({
        include: { tracks: { where: { deletedAt: null } }, artist: true }
    });

    for (const album of albums) {
        console.log(`ALBUM: ${album.title} (Artist: ${album.artist.name})`);

        // Simulating the backend `/albums/:id` endpoint EXACTLY
        const siblingAlbums = await prisma.album.findMany({
            where: {
                title: album.title,
                // The endpoint does NOT lowercase or fuzzy match, it strictly equals
                // AND it checks artistId strictly
                artistId: album.artistId
            },
            select: { id: true }
        });
        const siblingIds = siblingAlbums.map(a => a.id);
        const allTracks = await prisma.track.findMany({
            where: {
                albumId: { in: siblingIds },
                deletedAt: null
            },
            include: { artist: true }
        });

        console.log(`  -> Tracks via endpoint: ${allTracks.length}`);
        if (allTracks.length > 0) {
            allTracks.forEach(t => console.log(`      - ${t.title} [Artist: ${t.artist.name}]`));
        } else {
            console.log(`      !! 0 TRACKS RETURNED BY ENDPOINT !!`);

            // Just for debugging, are there ANY tracks attached via DB `album.tracks`?
            if (album.tracks.length > 0) {
                console.log(`      !! BUT Prism relation has ${album.tracks.length} tracks !! WHY?`);
                // Wait, if album.tracks.length > 0 but allTracks.length === 0, it means sibling logic is broken!
                // But my previous test showed no such albums!
            }
        }

    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
