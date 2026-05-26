const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const albums = await prisma.album.findMany({
        include: { tracks: { where: { deletedAt: null } }, artist: true }
    });

    for (const album of albums) {
        const allTracksWithThisTitle = await prisma.track.findMany({
            where: {
                album: { title: album.title },
                deletedAt: null
            }
        });

        if (allTracksWithThisTitle.length === 0) {
            console.log(`\nALBUM: ${album.title} (ID: ${album.id}) has NO DELETED=NULL TRACKS PERIOD!`);
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
