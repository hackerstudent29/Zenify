const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const albums = await prisma.album.findMany({
        include: { tracks: { where: { deletedAt: null } } }
    });

    // We want to simulate GET /albums/:id exactly
    for (const album of albums) {
        const siblingAlbums = await prisma.album.findMany({
            where: {
                title: album.title,
                artistId: album.artistId
            },
            select: { id: true }
        });
        const siblingIds = siblingAlbums.map(a => a.id);
        const allTracks = await prisma.track.findMany({
            where: {
                albumId: { in: siblingIds },
                deletedAt: null
            }
        });

        // Let's also find ANY tracks that belong to an album with this EXACT title, regardless of the artistId
        const anyTracksByTitle = await prisma.track.findMany({
            where: { album: { title: album.title }, deletedAt: null },
            include: { artist: true, album: true }
        });

        if (allTracks.length === 0 && anyTracksByTitle.length > 0) {
            console.log(`\nALBUM ID: ${album.id} ("${album.title}")`);
            console.log(`Endpoint gives 0 tracks because artistId (${album.artistId}) doesn't match tracks' artists!`);
            console.log(`Tracks in DB with this album title:`, anyTracksByTitle.map(t => `${t.title} (Artist ID: ${t.artistId}, Album Artist ID: ${t.album.artistId})`));
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
