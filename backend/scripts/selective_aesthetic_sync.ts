import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Curated list of "Album Art" style images
const ALBUM_ART_THEMES = [
    // THE DARK / ETERNAL / DEEP
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe",
    "https://images.unsplash.com/photo-1604871000636-074fa5117945",
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853",
    "https://images.unsplash.com/photo-1614850523296-d8c1af93d400",

    // THE CYBER / NEON / PULSE
    "https://images.unsplash.com/photo-1633167606207-d840b5070fc2",
    "https://images.unsplash.com/photo-1618556450991-2f1af64e8191",
    "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e",
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f",

    // THE RAIN / STATIC / MINIMAL
    "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986",
    "https://images.unsplash.com/photo-1502691876148-a84978e59af8",
    "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0",
    "https://images.unsplash.com/photo-1519750783826-e2420f4d6871",

    // ARTISTIC / AVANT-GARDE
    "https://images.unsplash.com/photo-1541701494587-cb58502866ab",
    "https://images.unsplash.com/photo-1549490349-8643362247b5",
    "https://images.unsplash.com/photo-1574169208507-84376144848b",
    "https://images.unsplash.com/photo-1557672172-298e090bd0f1",
];

async function main() {
    console.log('🛡️ Executing Selective Aesthetic Sync...');

    const tracks = await prisma.track.findMany();
    let updatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const title = track.title.toLowerCase();

        // CAREFUL CHECK:
        // We only replace if the coverUrl is clearly NOT a user upload.
        // User uploads in this app always start with '/public/music/'
        const isUserUpload = track.coverUrl?.startsWith('/public/music/');

        if (!isUserUpload) {
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
        } else {
            console.log(`Preserving User Upload for: ${track.title} (${track.coverUrl})`);
            skippedCount++;
        }
    }

    console.log(`✅ Update complete.`);
    console.log(`✨ Tracks Updated (Placeholders -> Album Art): ${updatedCount}`);
    console.log(`🛡️ Tracks Preserved (User Uploads): ${skippedCount}`);
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
