const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const allTracks = await prisma.track.findMany({
        where: { deletedAt: null },
        include: { album: true, artist: true }
    });

    console.log(`There are ${allTracks.length} tracks not deleted.`);
    allTracks.forEach(t => {
        console.log(`- ${t.title} [Artist: ${t.artist.name}] [AlbumId: ${t.albumId}] [AlbumTitle: ${t.album?.title}]`);
    });
}
main().catch(console.error).finally(() => prisma.$disconnect());
