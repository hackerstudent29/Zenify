const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tracks = await prisma.track.findMany({
        select: {
            id: true,
            title: true,
            releaseStatus: true,
            isUnlisted: true,
            deletedAt: true
        }
    });
    console.log(JSON.stringify(tracks, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
