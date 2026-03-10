const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const emptyAlbum = await prisma.album.findUnique({
        where: { id: 'f10edb47-5052-4621-900f-f2dc133aef1f' },
        include: { tracks: true }
    });
    console.log("Empty Album Title:", emptyAlbum.title);
    console.log("Total tracks directly linked:", emptyAlbum.tracks.length);

    // Check deleted tracks
    const allTracksDirectlyLinked = await prisma.track.findMany({
        where: { albumId: emptyAlbum.id },
        select: { id: true, title: true, deletedAt: true }
    });
    console.dir(allTracksDirectlyLinked, { depth: null });

    // Check sibling albums exactly how the endpoint does it
    const siblingAlbums = await prisma.album.findMany({
        where: {
            title: emptyAlbum.title,
            artistId: emptyAlbum.artistId
        },
        select: { id: true }
    });
    const siblingIds = siblingAlbums.map(a => a.id);
    console.log('Sibling IDs:', siblingIds);

    const allTracks = await prisma.track.findMany({
        where: {
            albumId: { in: siblingIds },
            deletedAt: null
        }
    });
    console.log('Tracks via endpoint logic:', allTracks.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
