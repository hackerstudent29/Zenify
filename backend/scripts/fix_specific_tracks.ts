import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

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

async function isUrlBroken(url: string): Promise<boolean> {
    if (!url) return true;
    if (!url.startsWith('http')) return true;
    try {
        const res = await axios.head(url, { timeout: 4000 });
        return res.status !== 200;
    } catch {
        return true;
    }
}

async function main() {
    // Find all tracks whose title contains 'Static', 'Deep', or 'Rain'
    const tracks = await prisma.track.findMany({
        where: {
            deletedAt: null,
            OR: [
                { title: { contains: 'Static', mode: 'insensitive' } },
                { title: { contains: 'Deep', mode: 'insensitive' } },
                { title: { contains: 'Rain', mode: 'insensitive' } },
            ]
        },
        select: { id: true, title: true, coverUrl: true }
    });

    console.log(`Found ${tracks.length} matching tracks:`);
    tracks.forEach(t => console.log(` - [${t.title}]: ${t.coverUrl}`));

    let fixed = 0;
    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const broken = await isUrlBroken(track.coverUrl || '');
        if (broken) {
            const newUrl = RELIABLE_PLACEHOLDERS[i % RELIABLE_PLACEHOLDERS.length];
            await prisma.track.update({
                where: { id: track.id },
                data: { coverUrl: newUrl }
            });
            console.log(`✓ Fixed [${track.title}] → ${newUrl}`);
            fixed++;
        } else {
            console.log(`✓ OK   [${track.title}]`);
        }
    }

    console.log(`\nDone. Fixed ${fixed} tracks.`);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
