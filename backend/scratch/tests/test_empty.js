const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const emptyAlbum = await prisma.album.findUnique({
        where: { id: 'f10edb47-5052-4621-900f-f2dc133aef1f' }
    });
    console.log("Empty Album Title:", emptyAlbum.title);

    // Check if there are tracks with same albumTitle but missing albumId or diff albumId
    const tracksWithTitle = await prisma.track.findMany({
        where: { albumTitle: emptyAlbum.title }
    });
    console.log(`Tracks with albumTitle = "${emptyAlbum.title}":`, tracksWithTitle.length);
    if (tracksWithTitle.length > 0) {
        console.log("Sample track albumId:", tracksWithTitle[0].albumId);
    }

    // Check sibling albums
    const siblingAlbums = await prisma.album.findMany({
        where: { title: emptyAlbum.title }
    });
    console.log(`Sibling albums with same title:`, siblingAlbums.map(s => s.id));

    // Tracks belonging to sibling albums
    const siblingTracks = await prisma.track.findMany({
        where: { albumId: { in: siblingAlbums.map(s => s.id) } }
    });
    console.log(`Tracks in sibling albums:`, siblingTracks.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
