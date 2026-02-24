
import { PrismaClient } from '@prisma/client'
import axios from 'axios'

const prisma = new PrismaClient()

const RELIABLE_PLACEHOLDERS = [
    "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=800",
    "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=800",
    "https://images.unsplash.com/photo-1470225620353-fb4b183b523e?q=80&w=800",
    "https://images.unsplash.com/photo-1459749411177-042180ce6742?q=80&w=800",
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=800",
    "https://images.unsplash.com/photo-1453090927415-5f453c14d5c5?q=80&w=800",
    "https://images.unsplash.com/photo-1514525253344-99a42999aa2e?q=80&w=800",
    "https://images.unsplash.com/photo-1420161907993-e298aa9ea597?q=80&w=800"
];

async function main() {
    const tracks = await prisma.track.findMany({
        where: { deletedAt: null },
    });

    console.log(`Checking ${tracks.length} tracks...`);

    let fixedCount = 0;

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        let isBroken = false;

        if (!track.coverUrl) {
            isBroken = true;
        } else if (track.coverUrl.startsWith('http')) {
            try {
                // Check if it's reachable
                await axios.head(track.coverUrl, { timeout: 3000 });
            } catch (error) {
                isBroken = true;
            }
        } else {
            // Check if local file exists
            const fs = require('fs');
            const path = require('path');
            const localPath = path.join(__dirname, track.coverUrl.replace(/^\/public/, './public'));
            // Wait, this path mapping might be wrong depending on where we run it.
            // Let's just check if it contains '/public/music/' and if we can find it in backend/public/music
            if (track.coverUrl.includes('/public/music/')) {
                const filename = track.coverUrl.split('/').pop();
                const absolutePath = path.join(__dirname, 'public/music', filename);
                if (!fs.existsSync(absolutePath)) {
                    isBroken = true;
                }
            } else {
                // Other local URLs - assume broken for now if not starting with /public
                isBroken = true;
            }
        }

        if (isBroken) {
            const newUrl = RELIABLE_PLACEHOLDERS[i % RELIABLE_PLACEHOLDERS.length];
            await prisma.track.update({
                where: { id: track.id },
                data: { coverUrl: newUrl }
            });
            console.log(`Fixed [${track.title}]: Replaced broken URL with ${newUrl}`);
            fixedCount++;
        }
    }

    // Also check Albums
    const albums = await prisma.album.findMany();
    console.log(`Checking ${albums.length} albums...`);
    for (let i = 0; i < albums.length; i++) {
        const album = albums[i];
        let isBroken = false;
        if (!album.coverUrl) isBroken = true;
        else if (album.coverUrl.startsWith('http')) {
            try { await axios.head(album.coverUrl, { timeout: 3000 }); } catch (e) { isBroken = true; }
        }

        if (isBroken) {
            const newUrl = RELIABLE_PLACEHOLDERS[(i + 10) % RELIABLE_PLACEHOLDERS.length];
            await prisma.album.update({
                where: { id: album.id },
                data: { coverUrl: newUrl }
            });
            console.log(`Fixed Album [${album.title}]: Replaced broken URL`);
            fixedCount++;
        }
    }

    console.log(`Total items fixed: ${fixedCount}`);
    await prisma.$disconnect();
}

main();
