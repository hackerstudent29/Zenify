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

const ARTIST_ART = [
    "https://images.unsplash.com/photo-1542131082-973aee2f4477", // Stylized silhouette
    "https://images.unsplash.com/photo-1514525253361-b83f859b73c0", // Stage lights blur
    "https://images.unsplash.com/photo-1493225255756-d9584f8606e9", // Minimalist musician
    "https://images.unsplash.com/photo-1526218626217-dc65a29bb444", // Artistic shadow portrait
];

async function main() {
    console.log('✨ Applying Avant-Garde Album Art Overhaul...');

    const tracks = await prisma.track.findMany();
    for (let i = 0; i < tracks.length; i++) {
        const title = tracks[i].title.toLowerCase();
        let selectedUrl = "";

        // Thematic sorting with higher variety
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
            where: { id: tracks[i].id },
            data: {
                coverUrl: `${selectedUrl}?w=1000&q=90&fit=crop&auto=format&fm=webp`
            }
        });
    }
    console.log(`🎨 Transformed ${tracks.length} tracks into aesthetic album covers.`);

    const artists = await prisma.artist.findMany();
    for (let i = 0; i < artists.length; i++) {
        await prisma.artist.update({
            where: { id: artists[i].id },
            data: {
                imageUrl: `${ARTIST_ART[i % ARTIST_ART.length]}?w=600&q=80&fit=crop&auto=format&fm=webp`
            }
        });
    }
    console.log(`👤 Updated ${artists.length} artist profiles with artistic shots.`);

    const playlists = await prisma.playlist.findMany();
    for (let i = 0; i < playlists.length; i++) {
        await prisma.playlist.update({
            where: { id: playlists[i].id },
            data: {
                coverUrl: `${ALBUM_ART_THEMES[(i + 6) % ALBUM_ART_THEMES.length]}?w=1000&q=90&fit=crop&auto=format&fm=webp`
            }
        });
    }

    console.log('🚀 Visual Identity Rebranded to "Elite Aesthetic"!');
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
