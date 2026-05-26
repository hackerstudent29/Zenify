import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ log: ['query'] });

async function profileQueries() {
    console.time('mostPlayed');
    await prisma.track.findMany({
        where: { deletedAt: null, releaseStatus: 'PUBLISHED', isUnlisted: false },
        select: { id: true, title: true, plays: true },
        orderBy: { plays: 'desc' },
        take: 20,
    });
    console.timeEnd('mostPlayed');

    console.time('newReleases');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.track.findMany({
        where: {
            deletedAt: null,
            releaseStatus: 'PUBLISHED',
            isUnlisted: false,
            createdAt: { gte: thirtyDaysAgo },
        },
        select: { id: true, createdAt: true, engagement_score: true, like_count: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
    });
    console.timeEnd('newReleases');

    console.time('trendingGroup');
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await prisma.history.groupBy({
        by: ['trackId'],
        where: { playedAt: { gte: twoDaysAgo } },
        _count: { trackId: true },
        orderBy: { _count: { trackId: 'desc' } },
        take: 30,
    });
    console.timeEnd('trendingGroup');
}

profileQueries()
    .then(() => console.log('Done'))
    .finally(() => prisma.$disconnect());
