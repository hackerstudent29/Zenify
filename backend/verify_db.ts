import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const totalWithCover = await prisma.track.count({
        where: { AND: [{ coverUrl: { not: null } }, { coverUrl: { not: '' } }] }
    });
    const totalWithoutCover = await prisma.track.count({
        where: { OR: [{ coverUrl: null }, { coverUrl: '' }] }
    });

    const sample = await prisma.track.findMany({
        take: 20,
        select: { id: true, title: true, coverUrl: true }
    });

    console.log('--- DB SUMMARY ---');
    console.log({ totalWithCover, totalWithoutCover });
    console.log('--- SAMPLE TRACKS ---');
    console.log(JSON.stringify(sample, null, 2));

    await prisma.$disconnect();
}

main();
