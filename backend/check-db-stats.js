const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const tracks = await prisma.track.count();
    const history = await prisma.history.count();
    const recentHistory = await prisma.history.count({
        where: { playedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } }
    });
    const recentTracks = await prisma.track.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
    });
    const artists = await prisma.artist.count();

    console.log({
        totalTracks: tracks,
        totalHistory: history,
        recentHistory48h: recentHistory,
        recentTracks30d: recentTracks,
        totalArtists: artists
    });

    const topStreams = await prisma.track.findMany({
        orderBy: { streams: 'desc' },
        take: 5,
        select: { title: true, streams: true }
    });
    console.log('Top Streams:', topStreams);

    process.exit(0);
}

check();
