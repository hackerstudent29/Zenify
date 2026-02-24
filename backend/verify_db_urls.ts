
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('--- TRACKS CHECK ---');
    const tracks = await prisma.track.findMany({
        take: 10,
        select: { id: true, title: true, coverUrl: true, audioUrl: true }
    });
    console.log(JSON.stringify(tracks, null, 2));

    console.log('\n--- ALBUMS CHECK ---');
    const albums = await prisma.album.findMany({
        take: 5,
        select: { id: true, title: true, coverUrl: true }
    });
    console.log(JSON.stringify(albums, null, 2));

    console.log('\n--- PLAYLISTS CHECK ---');
    const playlists = await prisma.playlist.findMany({
        take: 5,
        select: { id: true, name: true, coverUrl: true }
    });
    console.log(JSON.stringify(playlists, null, 2));

    await prisma.$disconnect();
}

main();
