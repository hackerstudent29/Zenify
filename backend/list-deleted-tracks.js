const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const deletedTracks = await prisma.track.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, title: true, deletedAt: true }
    });
    console.log(JSON.stringify(deletedTracks, null, 2));
}

main().finally(() => prisma.$disconnect());
