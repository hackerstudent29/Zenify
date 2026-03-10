const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const albums = await prisma.album.findMany({
        include: { _count: { select: { tracks: true } }, tracks: true }
    });

    console.log('Albums > 0 tracks:', albums.filter(a => a._count.tracks > 0).length);
    console.log('Albums === 0 tracks:', albums.filter(a => a._count.tracks === 0).length);

    // Check if any deleted tracks exist for albums where count is 0
    const deletedTracks = await prisma.track.findMany({
        where: { deletedAt: { not: null } }
    });
    console.log('Deleted tracks total:', deletedTracks.length);

    console.log("Details of first 2 albums with 0 tracks:");
    const emptyAlbums = albums.filter(a => a._count.tracks === 0);
    console.dir(emptyAlbums.slice(0, 2), { depth: null });
}
main().catch(console.error).finally(() => prisma.$disconnect());
