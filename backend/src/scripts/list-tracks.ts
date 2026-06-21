import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Listing the 20 most recent tracks in the database...");
    
    const tracks = await prisma.track.findMany({
        orderBy: {
            createdAt: 'desc'
        },
        take: 20,
        include: {
            artist: true
        }
    });

    console.log(`Total tracks in DB: ${await prisma.track.count()}`);
    console.log(JSON.stringify(tracks.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist?.name,
        releaseStatus: t.releaseStatus,
        createdAt: t.createdAt
    })), null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
