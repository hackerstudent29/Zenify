const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const albums = await prisma.album.findMany({
        include: {
            tracks: {
                where: { deletedAt: null }
            }
        }
    });

    console.log('Albums > 0 tracks (not deleted):', albums.filter(a => a.tracks.length > 0).length);
    console.log('Albums === 0 tracks (not deleted):', albums.filter(a => a.tracks.length === 0).length);

    console.log("Details of first 2 albums with 0 valid tracks:");
    const emptyAlbums = albums.filter(a => a.tracks.length === 0);
    console.dir(emptyAlbums.slice(0, 2), { depth: null });
}
main().catch(console.error).finally(() => prisma.$disconnect());
