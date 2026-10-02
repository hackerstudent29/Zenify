const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tracks = await prisma.track.findMany({
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: { id: true, title: true, audioUrl: true }
    });
    console.log(JSON.stringify(tracks, null, 2));
}

main().finally(() => prisma.$disconnect());
