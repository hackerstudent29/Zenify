import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkTrack() {
    try {
        console.log('--- DB AUDIT START ---');
        const counts = {
            tracks: await prisma.track.count(),
            artists: await prisma.artist.count(),
            users: await prisma.user.count(),
        };
        console.log('DATABASE_COUNTS:', JSON.stringify(counts, null, 2));

        const search = await prisma.track.findMany({
            where: {
                OR: [
                    { title: { contains: 'mutta', mode: 'insensitive' } },
                    { title: { contains: 'kalaki', mode: 'insensitive' } }
                ]
            },
            include: { artist: true }
        });

        if (search.length > 0) {
            console.log('SEARCH_RESULTS_FOUND:', JSON.stringify(search, null, 2));
        } else {
            console.log('SEARCH_RESULTS_EMPTY');
            const lastTracks = await prisma.track.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' }
            });
            console.log('LATEST_10_TRACKS:', JSON.stringify(lastTracks.map(t => t.title), null, 2));
        }
        console.log('--- DB AUDIT END ---');
    } catch (e) {
        console.error('ERROR during check:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkTrack();
