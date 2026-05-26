const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // get all albums
    const albums = await prisma.album.findMany({ include: { artist: true } });

    for (const album of albums) {
        // simulate album logic
        const siblingAlbums = await prisma.album.findMany({
            where: { title: album.title, artistId: album.artistId },
            select: { id: true }
        });
        const siblingIds = siblingAlbums.map(a => a.id);
        const allTracks = await prisma.track.findMany({
            where: { albumId: { in: siblingIds }, deletedAt: null }
        });

        if (allTracks.length === 0) {
            console.log(`Album ${album.title} (ID: ${album.id}) shows 0 tracks.`);
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
