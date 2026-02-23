import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * PREMIUM DARK AESTHETIC ALBUM ART SYSTEM
 * Curated high-concept images for specific music moods/genres.
 */
const DARK_AESTHETIC_THEMES = {
    // 🎵 DARK LO-FI / RAIN / CHILL (Moody, Blurry, Nightly)
    LO_FI: [
        "https://images.unsplash.com/photo-1514525253361-b83f859b73c0", // Dark purple stage/smoke
        "https://images.unsplash.com/photo-1542131082-973aee2f4477", // Dark silhouette
        "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0", // Deep red/black aesthetics
        "https://images.unsplash.com/photo-1519750783826-e2420f4d6871", // Soft dark pastel blur
    ],
    // ⚡ CYBER / TECHNO / PULSE (Neon on Black)
    CYBER: [
        "https://images.unsplash.com/photo-1633167606207-d840b5070fc2", // Electric neon abstract
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe", // Dark 3D fluid
        "https://images.unsplash.com/photo-1550745165-9bc0b252726f", // Dark retro tech
        "https://images.unsplash.com/photo-1604871000636-074fa5117945", // Deep red abstract art
    ],
    // 🌑 ETERNAL / AMBIENT / SPACE (Black & White or Monochromatic Deep Space)
    AMBIENT: [
        "https://images.unsplash.com/photo-1464802686167-b939a67e0524", // Cosmic dark dust
        "https://images.unsplash.com/photo-1502134249126-9f3755a50d78", // Nebula deep space
        "https://images.unsplash.com/photo-1614850523296-d8c1af93d400", // Soft smoke/fluid
        "https://images.unsplash.com/photo-1557672172-298e090bd0f1", // Dark paper texture abstract
    ],
    // 🎹 CLASSIC / FOCUS (Minimalist instruments in shadows)
    MINIMAL: [
        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4", // Microphone dark
        "https://images.unsplash.com/photo-1507838595010-3841120056", // Headphones in dark
        "https://images.unsplash.com/photo-1510915361894-db8b60106cb1", // DJ deck low light
        "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04", // Studio shadows
    ]
};

async function main() {
    console.log('🌑 Executing Dark Mode Multi-Genre Aesthetic Sync...');

    const tracks = await prisma.track.findMany({
        select: { id: true, title: true, coverUrl: true, audioUrl: true, genre: true }
    });

    let updatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];

        // PROTECTION: Do not overwrite user-uploaded files
        const isUserFile = (track.coverUrl?.includes('/public/music/')) ||
            (track.audioUrl?.includes('/public/music/'));

        if (isUserFile) {
            console.log(`🛡️ Preserving custom upload: ${track.title}`);
            skippedCount++;
            continue;
        }

        const titleLower = track.title.toLowerCase();
        const genreLower = (track.genre || "").toLowerCase();

        let pool: string[] = DARK_AESTHETIC_THEMES.MINIMAL; // Default

        // Intelligent Genre Mapping
        if (genreLower.includes('lo-fi') || genreLower.includes('chill') || titleLower.includes('rain') || titleLower.includes('static')) {
            pool = DARK_AESTHETIC_THEMES.LO_FI;
        } else if (genreLower.includes('tech') || genreLower.includes('cyber') || genreLower.includes('pop') || titleLower.includes('neon') || titleLower.includes('pulse')) {
            pool = DARK_AESTHETIC_THEMES.CYBER;
        } else if (genreLower.includes('ambient') || genreLower.includes('focus') || titleLower.includes('eternal') || titleLower.includes('deep')) {
            pool = DARK_AESTHETIC_THEMES.AMBIENT;
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

    // Also update Playlists covers to match the dark aesthetic
    const playlists = await prisma.playlist.findMany();
    for (let i = 0; i < playlists.length; i++) {
        const selectedUrl = DARK_AESTHETIC_THEMES.CYBER[(i + 1) % 4];
        await prisma.playlist.update({
            where: { id: playlists[i].id },
            data: { coverUrl: `${selectedUrl}?w=1200&q=100&fit=crop` }
        });
    }

    console.log(`✅ Dark Aesthetic Branding Complete.`);
    console.log(`✨ System Content Rebranded: ${updatedCount}`);
    console.log(`🛡️ User Content Preserved: ${skippedCount}`);
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
