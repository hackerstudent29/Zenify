import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * CINEMATIC REAL-WORLD DARK AESTHETIC
 * Curated high-definition REAL photography (No 3D renders, no drawings).
 */
const DARK_REAL_WORLD_THEMES = {
    // 🏙️ NIGHT CITY (Cyber / Pulse / Pop) - Real neon, real streets
    URBAN_NIGHT: [
        "https://images.unsplash.com/photo-1514933651103-005eec06c04b", // Restaurant neon at night
        "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05", // Misty forest night
        "https://images.unsplash.com/photo-1493246507139-91e8bef99c02", // Night mountain lake
        "https://images.unsplash.com/photo-1519681393784-d120267933ba"  // Starry mountains real
    ],
    // 🌧️ MOODY RAIN & TEXTURE (Rain / Lo-Fi / Chill) - Real wet surfaces
    MOODY_RAIN: [
        "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0", // Real rainy window
        "https://images.unsplash.com/photo-1496307361252-ee31b05f60cd", // Real rainy street lights
        "https://images.unsplash.com/photo-1534271057030-a4b92bd693ff", // Puddle reflection real
        "https://images.unsplash.com/photo-1527489377706-5bf97e608852"  // Dark stormy clouds
    ],
    // 🌑 DEEP NATURE & ETERNAL (Eternal / Deep / Static) - Real landscapes
    DEEP_NATURE: [
        "https://images.unsplash.com/photo-1502134249126-9f3755a50d78", // Real Milky Way night
        "https://images.unsplash.com/photo-1534067783941-51c9c23ecefd", // Real night mountain peaks
        "https://images.unsplash.com/photo-1444703686981-d3abbc9d260e", // Deep forest canopy dark
        "https://images.unsplash.com/photo-1511300636408-a63a89df3482"  // Dark ocean waves real
    ],
    // 🎸 STUDIO & INSTRUMENTS (Minimal / Focus) - Real close-ups
    STUDIO_CLOSEUP: [
        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4", // Real mic in shadows
        "https://images.unsplash.com/photo-1470225620780-dba8ba36b745", // Real DJ deck lights
        "https://images.unsplash.com/photo-1493225255756-d9584f8606e9", // Real guitar in low light
        "https://images.unsplash.com/photo-1510915361894-db8b60106cb1"  // Real piano keys dark
    ]
};

async function main() {
    console.log('🌑 Synchronizing Real-World Dark Aesthetics...');

    const tracks = await prisma.track.findMany({
        select: { id: true, title: true, coverUrl: true, audioUrl: true, genre: true }
    });

    let updatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];

        // RESTRICTION: Never overwrite user uploads
        const isUserFile = (track.coverUrl?.includes('/public/music/')) ||
            (track.audioUrl?.includes('/public/music/'));

        if (isUserFile) {
            skippedCount++;
            continue;
        }

        const titleLower = track.title.toLowerCase();
        const genreLower = (track.genre || "").toLowerCase();

        let pool: string[] = DARK_REAL_WORLD_THEMES.STUDIO_CLOSEUP;

        if (titleLower.includes('rain') || genreLower.includes('chill')) {
            pool = DARK_REAL_WORLD_THEMES.MOODY_RAIN;
        } else if (titleLower.includes('cyber') || titleLower.includes('neon') || genreLower.includes('pop')) {
            pool = DARK_REAL_WORLD_THEMES.URBAN_NIGHT;
        } else if (titleLower.includes('eternal') || titleLower.includes('deep') || genreLower.includes('ambient')) {
            pool = DARK_REAL_WORLD_THEMES.DEEP_NATURE;
        }

        const selectedUrl = pool[i % pool.length];

        await prisma.track.update({
            where: { id: track.id },
            data: {
                coverUrl: `${selectedUrl}?w=1200&q=100&fit=crop&auto=format&fm=webp`
            }
        });
        updatedCount++;
    }

    // Update artists with real-world low-key portraits
    const artistRealPhotos = [
        "https://images.unsplash.com/photo-1514525253361-b83f859b73c0",
        "https://images.unsplash.com/photo-1520859325812-70659392e27b",
        "https://images.unsplash.com/photo-1542131082-973aee2f4477",
        "https://images.unsplash.com/photo-1526218626217-dc65a29bb444"
    ];

    const artists = await prisma.artist.findMany();
    for (let i = 0; i < artists.length; i++) {
        await prisma.artist.update({
            where: { id: artists[i].id },
            data: { imageUrl: `${artistRealPhotos[i % artistRealPhotos.length]}?w=600&q=80&fit=crop` }
        });
    }

    console.log(`✅ Real-World Rebranding complete.`);
    console.log(`📸 Upgraded to Cinematic Photography: ${updatedCount}`);
    console.log(`🛡️ Preserved Custom Content: ${skippedCount}`);
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
