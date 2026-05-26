const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tracks = await prisma.track.findMany({
        include: { artist: true }
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
