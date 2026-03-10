const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const albums = await prisma.album.findMany({
        include: { tracks: { where: { deletedAt: null } }, artist: true }
    });

    for (const album of albums) {
        // Run the endpoint logic
        const siblingAlbums = await prisma.album.findMany({
            where: {
                title: album.title,
                artistId: album.artistId
            },
            select: { id: true }
        });
        const siblingIds = siblingAlbums.map(a => a.id);
        const endpointTracks = await prisma.track.findMany({
            where: {
                albumId: { in: siblingIds },
                deletedAt: null
            }
        });

        // Find tracks that SHOULD be in this album but aren't
        // Tracks that have the same albumTitle but a different albumId/artistId
        // Wait, Track model doesn't have albumTitle directly! It has albumId.

        // Let's just check if ANY album has 0 tracks via endpoint but actually has tracks in the DB with the same album title
        // Because Track -> Album relation has the title.
        const allTracksWithThisTitle = await prisma.track.findMany({
            where: {
                album: { title: album.title },
                deletedAt: null
            },
            include: { album: true }
        });

        if (endpointTracks.length === 0 && allTracksWithThisTitle.length > 0) {
            console.log(`\nALBUM: ${album.title} (ID: ${album.id})`);
            console.log(`Endpoint returned 0 tracks.`);
            console.log(`BUT there are ${allTracksWithThisTitle.length} tracks with this album title in the DB!`);
            console.log(`These tracks have albumIds:`, [...new Set(allTracksWithThisTitle.map(t => t.albumId))]);
            console.log(`And artists:`, [...new Set(allTracksWithThisTitle.map(t => t.artistId))]);
            console.log(`Original album artistId: ${album.artistId}`);
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
