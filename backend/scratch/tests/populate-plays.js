const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Populating meaningful playback data...');

    const tracks = await prisma.track.findMany({ take: 20 });
    if (tracks.length === 0) {
        console.log('No tracks found to populate.');
        process.exit(0);
    }

    const users = await prisma.user.findMany({ take: 5 });
    const userId = users[0]?.id || null;

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        // Give each track a different number of plays to differentiate "Most Played"
        const plays = (20 - i) * 5 + Math.floor(Math.random() * 10);

        await prisma.track.update({
            where: { id: track.id },
            data: {
                plays: plays,
                isTrending: i < 5, // Mark first 5 as trending
                engagement_score: plays * 0.5 + Math.random() * 10
            }
        });

        if (userId) {
            // Add some history for trending logic
            for (let j = 0; j < Math.min(plays, 5); j++) {
                await prisma.history.create({
                    data: {
                        userId,
                        trackId: track.id,
                        playedAt: new Date(Date.now() - Math.random() * 48 * 60 * 60 * 1000) // Within last 48h
                    }
                });
            }
        }
    }

    console.log('Database populated with sample play data.');
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
