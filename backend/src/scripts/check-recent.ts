import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Checking for recently added albums (last 24 hours)...");
    
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    const albums = await prisma.album.findMany({
        where: {
            createdAt: { gte: yesterday }
        },
        include: {
            artist: true
        }
    });

    console.log(`Found ${albums.length} recent albums:`);
    console.log(JSON.stringify(albums.map(a => ({ title: a.title, artist: a.artist?.name, createdAt: a.createdAt })), null, 2));

    const tracks = await prisma.track.findMany({
        where: {
            createdAt: { gte: yesterday }
        },
        include: {
            artist: true
        }
    });

    console.log(`\nFound ${tracks.length} recent tracks:`);
    console.log(JSON.stringify(tracks.map(t => ({ title: t.title, artist: t.artist?.name, createdAt: t.createdAt })), null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
