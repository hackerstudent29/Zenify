import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Verified Unsplash photos of musicians/people with instruments
// These use specific photo IDs which are permanent links
const MUSICIAN_IMAGES = [
    // Violinist with instrument
    "https://images.unsplash.com/photo-1465821185615-20b3c2fbf41b?q=80&w=800&auto=format&fit=crop",
    // Guitarist in dramatic light
    "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?q=80&w=800&auto=format&fit=crop",
    // Jazz/sax musician
    "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?q=80&w=800&auto=format&fit=crop",
    // Piano player hands
    "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?q=80&w=800&auto=format&fit=crop",
    // Guitarist closeup
    "https://images.unsplash.com/photo-1507838153414-b4b713384a76?q=80&w=800&auto=format&fit=crop",
    // Drummer
    "https://images.unsplash.com/photo-1524230659092-07f99a75c013?q=80&w=800&auto=format&fit=crop",
    // Bassist
    "https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?q=80&w=800&auto=format&fit=crop",
    // DJ / Producer
    "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=800&auto=format&fit=crop",
];

async function main() {
    // Find all tracks with "rain" or "deep" in their title
    const tracks = await prisma.track.findMany({
        where: {
            deletedAt: null,
            OR: [
                { title: { contains: 'rain', mode: 'insensitive' } },
                { title: { contains: 'deep', mode: 'insensitive' } },
            ]
        },
        select: { id: true, title: true, coverUrl: true }
    });

    console.log(`Found ${tracks.length} matching tracks:`);
    tracks.forEach(t => console.log(` - [${t.title}]: ${t.coverUrl}`));

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const newUrl = MUSICIAN_IMAGES[i % MUSICIAN_IMAGES.length];
        await prisma.track.update({
            where: { id: track.id },
            data: { coverUrl: newUrl }
        });
        console.log(`✓ Updated [${track.title}] → ${newUrl}`);
    }

    console.log('\nAll done!');
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
