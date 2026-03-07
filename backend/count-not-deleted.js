const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const notDeletedCount = await prisma.track.count({ where: { deletedAt: null } });
    console.log('Not Deleted Count:', notDeletedCount);
}

main().finally(() => prisma.$disconnect());
