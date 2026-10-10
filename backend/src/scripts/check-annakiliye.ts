import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const t = await prisma.track.findFirst({
        where: { title: { contains: 'Annakiliye', mode: 'insensitive' } },
        include: { artist: true },
    });

    if (!t) {
        console.log('Track Annakiliye not found!');
        return;
    }

    console.log('--- Track Details ---');
    console.log(`ID: ${t.id}`);
    console.log(`Title: ${t.title}`);
    console.log(`Artist: ${t.artist?.name}`);
    console.log(`Duration: ${t.duration}`);
    console.log(`Audio URL: ${t.audioUrl}`);
    console.log(`Status: ${t.status}`);
    console.log(`Sync Source: ${t.sync_source}`);
    console.log(`Lyrics Length: ${t.lyrics?.length || 0}`);
    console.log(`Synced Lyrics Lines: ${Array.isArray(t.synced_lyrics) ? t.synced_lyrics.length : 0}`);

    if (Array.isArray(t.synced_lyrics) && t.synced_lyrics.length > 0) {
        console.log('\n--- First 3 Lines ---');
        console.log(JSON.stringify(t.synced_lyrics.slice(0, 3), null, 2));
        console.log('\n--- Last 5 Lines ---');
        console.log(JSON.stringify(t.synced_lyrics.slice(-5), null, 2));
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
