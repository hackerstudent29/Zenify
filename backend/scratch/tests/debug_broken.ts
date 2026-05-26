
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const tracks = await prisma.track.findMany({
        where: {
            OR: [
                { title: { contains: 'Rain' } },
                { title: { contains: 'Ocean' } },
                { title: { contains: 'Neon' } }
            ]
        },
        select: { title: true, coverUrl: true }
    });
    console.log(JSON.stringify(tracks, null, 2));
    await prisma.$disconnect();
}

main();
