import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Verifying statuses of 'Thaniye', 'Yathe Yathe', and 'Vairam'...");
    
    const tracks = await prisma.track.findMany({
        where: {
            OR: [
                { title: { contains: 'thaniye', mode: 'insensitive' } },
                { title: { contains: 'yathe', mode: 'insensitive' } },
                { title: { contains: 'vairam', mode: 'insensitive' } }
            ]
        },
        include: {
            artist: true
        }
    });

    console.log(JSON.stringify(tracks.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist?.name,
        audioUrl: t.audioUrl,
        releaseStatus: t.releaseStatus,
        createdAt: t.createdAt
    })), null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
