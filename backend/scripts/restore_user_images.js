const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Restoring User Uploaded Images (JS Version)...');

    const recoveryMap = [
        { audioSuffix: '1771773039217-882345246.mp3', image: '/public/music/1771773039618-729008042.jpg' },
        { audioSuffix: '1771772165287-943725921.mp3', image: '/public/music/1771772165941-447446616.jpg' },
        { audioSuffix: '1771739582861-472400592.mp3', image: '/public/music/1771739583770-720358787.jpg' }
    ];

    const tracks = await prisma.track.findMany();
    let restoredCount = 0;

    for (const track of tracks) {
        const audioFile = track.audioUrl.split('/').pop();
        const match = recoveryMap.find(m => m.audioSuffix === audioFile);

        if (match) {
            console.log(`✅ Restoring original image for: ${track.title}`);
            await prisma.track.update({
                where: { id: track.id },
                data: { coverUrl: match.image }
            });
            restoredCount++;
        }
    }

    console.log(`✨ Restoration Complete. Fixed ${restoredCount} track(s).`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
