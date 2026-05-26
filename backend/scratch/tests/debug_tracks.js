const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tracks = await prisma.track.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(tracks, null, 2));
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
