import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Curated list of "Album Art" style images (Abstract, Surreal, High-concept)
const ALBUM_ART_THEMES = [
    // 🌑 THE DARK / ETERNAL / DEEP (Surreal & Galactic)
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe", // Abstract fluid black/gold
    "https://images.unsplash.com/photo-1604871000636-074fa5117945", // Abstract red/black art
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853", // Minimalist geometry
    "https://images.unsplash.com/photo-1614850523296-d8c1af93d400", // Soft fluid gradients

    // ⚡ THE CYBER / NEON / PULSE (Retro-futuristic & Glitch)
    "https://images.unsplash.com/photo-1633167606207-d840b5070fc2", // Neon abstract waves
    "https://images.unsplash.com/photo-1618556450991-2f1af64e8191", // Cyberpunk red portrait mask
    "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e", // Iridescent liquid
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f", // Retro hardware neon glow

    // 🌧️ THE RAIN / STATIC / MINIMAL (Film Grain & Moody)
    "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986", // Moody star cluster grain
    "https://images.unsplash.com/photo-1502691876148-a84978e59af8", // Abstract blurred lights
    "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0", // Deep red moody fog
    "https://images.unsplash.com/photo-1519750783826-e2420f4d6871", // Soft pastel static

    // 🎨 ARTISTIC / AVANT-GARDE (For general "Aesthetic" covers)
    "https://images.unsplash.com/photo-1541701494587-cb58502866ab", // Colorful abstract paint
    "https://images.unsplash.com/photo-1549490349-8643362247b5", // Surreal statue art
    "https://images.unsplash.com/photo-1574169208507-84376144848b", // 3D render abstract
    "https://images.unsplash.com/photo-1557672172-298e090bd0f1", // Paper texture abstract
];

async function main() {
    console.log('🛡️ Reverting to Album Aesthetics (Safe Mode)...');

    const tracks = await prisma.track.findMany({
        select: { id: true, title: true, coverUrl: true, audioUrl: true }
    });

    let updatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];

        // STRICT CHECK:
        // 1. If coverUrl contains '/public/music/', it is a USER or ADMIN upload. NEVER TOUCH.
        // 2. If audioUrl contains '/public/music/', it is a USER or ADMIN upload. NEVER TOUCH.
        const isUserFile = (track.coverUrl?.includes('/public/music/')) ||
            (track.audioUrl?.includes('/public/music/'));

        if (isUserFile) {
            console.log(`🛡️ Preserving custom upload: ${track.title}`);
            skippedCount++;
            continue;
        }

        // It's a placeholder/system track. Apply high-end album art.
        const title = track.title.toLowerCase();
        let selectedUrl = "";

        if (title.includes('rain') || title.includes('static')) {
            selectedUrl = ALBUM_ART_THEMES[8 + (i % 4)];
        } else if (title.includes('cyber') || title.includes('neon') || title.includes('pulse')) {
            selectedUrl = ALBUM_ART_THEMES[4 + (i % 4)];
        } else if (title.includes('eternal') || title.includes('deep') || title.includes('memory') || title.includes('ocean')) {
            selectedUrl = ALBUM_ART_THEMES[0 + (i % 4)];
        } else {
            selectedUrl = ALBUM_ART_THEMES[12 + (i % 4)];
        }

        await prisma.track.update({
            where: { id: track.id },
            data: {
                coverUrl: `${selectedUrl}?w=1000&q=90&fit=crop&auto=format&fm=webp`
            }
        });
        updatedCount++;
    }

    console.log(`✅ Update complete.`);
    console.log(`✨ System Placeholders Upgraded: ${updatedCount}`);
    console.log(`🛡️ User uploads preserved: ${skippedCount}`);
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
