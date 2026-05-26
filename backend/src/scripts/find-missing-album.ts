import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Searching for album 'passo bem belto' or artist 'atlxs'...");
    
    const albums = await prisma.album.findMany({
        where: {
            OR: [
                { title: { contains: 'passo', mode: 'insensitive' } },
                { title: { contains: 'belto', mode: 'insensitive' } },
                { artist: { name: { contains: 'atlxs', mode: 'insensitive' } } }
            ]
        },
        include: {
            artist: true,
            tracks: true
        }
    });

    console.log(`Found ${albums.length} albums:`);
    console.log(JSON.stringify(albums, null, 2));

    const tracks = await prisma.track.findMany({
        where: {
            OR: [
                { title: { contains: 'passo', mode: 'insensitive' } },
                { title: { contains: 'belto', mode: 'insensitive' } },
                { artist: { name: { contains: 'atlxs', mode: 'insensitive' } } }
            ]
        },
        include: {
            artist: true,
            album: true
        }
    });

    console.log(`\nFound ${tracks.length} tracks:`);
    console.log(JSON.stringify(tracks, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
