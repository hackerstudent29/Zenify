const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const track = await prisma.track.findFirst({
        where: { title: 'zendrum' },
        orderBy: { createdAt: 'desc' }
    });
    if (track) {
        console.log("TITLE:", track.title);
        console.log("AUDIO:", track.audioUrl);
        console.log("COVER:", track.coverUrl);
    } else {
        console.log("Track not found");
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
