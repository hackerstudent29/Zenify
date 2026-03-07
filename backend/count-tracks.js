const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.track.count({
        where: {
            deletedAt: null,
            releaseStatus: 'PUBLISHED',
            isUnlisted: false
        }
    });
    console.log('Published/NotDeleted/Public Count:', count);

    const allCount = await prisma.track.count();
    console.log('Total Track Count:', allCount);
}

main().finally(() => prisma.$disconnect());
