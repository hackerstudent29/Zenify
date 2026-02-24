
import { PrismaClient } from '@prisma/client'
import axios from 'axios'

const prisma = new PrismaClient()

async function main() {
    const tracks = await prisma.track.findMany({
        where: { deletedAt: null },
    });

    console.log(`Checking ${tracks.length} tracks...`);

    for (const track of tracks) {
        if (!track.coverUrl) {
            console.log(`[${track.title}] - No coverUrl`);
            continue;
        }

        if (track.coverUrl.startsWith('http')) {
            try {
                await axios.head(track.coverUrl, { timeout: 5000 });
                // console.log(`[${track.title}] - OK`);
            } catch (error) {
                console.log(`[${track.title}] - BROKEN External URL: ${track.coverUrl}`);
            }
        } else {
            // Local URL
            // We can't easily check with axios here unless we know the full URL
            console.log(`[${track.title}] - Local URL: ${track.coverUrl}`);
        }
    }

    await prisma.$disconnect();
}

main();
