
import { PrismaClient } from '@prisma/client'
import axios from 'axios'

const prisma = new PrismaClient()

const ARTIST_PLACEHOLDERS = [
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=800",
    "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=800",
    "https://images.unsplash.com/photo-1514525253344-99a42999aa2e?q=80&w=800",
    "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=800",
    "https://images.unsplash.com/photo-1470225620353-fb4b183b523e?q=80&w=800"
];

async function main() {
    const artists = await prisma.artist.findMany();
    console.log(`Checking ${artists.length} artists...`);

    let fixedCount = 0;
    for (let i = 0; i < artists.length; i++) {
        const artist = artists[i];
        let isBroken = false;
        if (!artist.imageUrl) isBroken = true;
        else if (artist.imageUrl.startsWith('http')) {
            try { await axios.head(artist.imageUrl, { timeout: 3000 }); } catch (e) { isBroken = true; }
        }

        if (isBroken) {
            const newUrl = ARTIST_PLACEHOLDERS[i % ARTIST_PLACEHOLDERS.length];
            await prisma.artist.update({
                where: { id: artist.id },
                data: { imageUrl: newUrl }
            });
            console.log(`Fixed Artist [${artist.name}]: Replaced broken URL`);
            fixedCount++;
        }
    }

    console.log(`Total artists fixed: ${fixedCount}`);
    await prisma.$disconnect();
}

main();
