import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// BigInt serialization fix
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

async function main() {
    console.log("Deep search for 'passo', 'belto', or 'atlxs'...");
    
    const artists = await prisma.artist.findMany({
        where: {
            name: { contains: 'atlxs', mode: 'insensitive' }
        },
        include: {
            albums: true,
            tracks: true
        }
    });

    const albums = await prisma.album.findMany({
        where: {
            OR: [
                { title: { contains: 'passo', mode: 'insensitive' } },
                { title: { contains: 'belto', mode: 'insensitive' } }
            ]
        },
        include: {
            artist: true,
            tracks: true
        }
    });

    const tracks = await prisma.track.findMany({
        where: {
            OR: [
                { title: { contains: 'passo', mode: 'insensitive' } },
                { title: { contains: 'belto', mode: 'insensitive' } },
                { description: { contains: 'passo', mode: 'insensitive' } },
                { description: { contains: 'belto', mode: 'insensitive' } }
            ]
        },
        include: {
            artist: true,
            album: true
        }
    });

    console.log("Artists:", JSON.stringify(artists, null, 2));
    console.log("Albums:", JSON.stringify(albums, null, 2));
    console.log("Tracks:", JSON.stringify(tracks, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
