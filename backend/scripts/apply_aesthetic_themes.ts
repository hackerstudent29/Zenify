import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const THEMED_PHOTOS = [
    // Rain / Night Rain (Iconic Eternal/Static Rain style)
    "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0", // Rainy window night
    "https://images.unsplash.com/photo-1496307361252-ee31b05f60cd", // Rainy street neon
    "https://images.unsplash.com/photo-1534271057030-a4b92bd693ff", // Puddle reflection rain
    "https://images.unsplash.com/photo-1508873535684-277a3cbcc4e8", // Rain drops on glass

    // Neon / Cyber / Synthwave (Cyber Neon / Pulse style)
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f", // Retro computer neon
    "https://images.unsplash.com/photo-1563089145-599997674d42", // Abstract gradient neon
    "https://images.unsplash.com/photo-1543160732-4d1502476b7e", // Tokyo neon street
    "https://images.unsplash.com/photo-1444703686981-d3abbc9d260e", // Cyberpunk alley

    // Deep / Eternal / Space (Eternal Eternal style)
    "https://images.unsplash.com/photo-1464802686167-b939a67e0524", // Starry galaxy
    "https://images.unsplash.com/photo-1534067783941-51c9c23ecefd", // Mountains night
    "https://images.unsplash.com/photo-1502134249126-9f3755a50d78", // Nebula
    "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae", // Studio mood dark

    // Minimalist / Sonic
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4", // Microphone close up
    "https://images.unsplash.com/photo-1470225620780-dba8ba36b745", // DJ deck
    "https://images.unsplash.com/photo-1493225255756-d9584f8606e9", // Acoustic guitar
    "https://images.unsplash.com/photo-1507838595010-3841120056", // Headphones minimalist
];

const ARTIST_PHOTOS = [
    "https://images.unsplash.com/photo-1520859325812-70659392e27b",
    "https://images.unsplash.com/photo-1508919880461-127395a12330",
    "https://images.unsplash.com/photo-1504173010664-32509ac1fd20",
    "https://images.unsplash.com/photo-1499996860823-521a8ca41ff4",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d",
    "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce",
];

async function main() {
    console.log('🔄 Executing Premium Aesthetic Sync...');

    // Update Tracks with unique themes
    const tracks = await prisma.track.findMany();
    for (let i = 0; i < tracks.length; i++) {
        const title = tracks[i].title.toLowerCase();
        let selectedUrl = "";

        // Intelligent thematic matching
        if (title.includes('rain') || title.includes('static')) {
            selectedUrl = THEMED_PHOTOS[i % 4]; // Rain section
        } else if (title.includes('cyber') || title.includes('neon') || title.includes('pulse')) {
            selectedUrl = THEMED_PHOTOS[4 + (i % 4)]; // Cyber section
        } else if (title.includes('eternal') || title.includes('deep') || title.includes('memory') || title.includes('ocean')) {
            selectedUrl = THEMED_PHOTOS[8 + (i % 4)]; // Eternal section
        } else {
            selectedUrl = THEMED_PHOTOS[12 + (i % 4)]; // Minimalist section
        }

        await prisma.track.update({
            where: { id: tracks[i].id },
            data: {
                coverUrl: `${selectedUrl}?w=1000&q=90&fit=crop&auto=format`
            }
        });
    }
    console.log(`✅ Synchronized ${tracks.length} track covers with premium aesthetics.`);

    // Update Artists
    const artists = await prisma.artist.findMany();
    for (let i = 0; i < artists.length; i++) {
        await prisma.artist.update({
            where: { id: artists[i].id },
            data: {
                imageUrl: `${ARTIST_PHOTOS[i % ARTIST_PHOTOS.length]}?w=600&q=80&fit=crop&auto=format`
            }
        });
    }
    console.log(`✅ Updated ${artists.length} artist profiles.`);

    // Update Playlists
    const playlists = await prisma.playlist.findMany();
    for (let i = 0; i < playlists.length; i++) {
        await prisma.playlist.update({
            where: { id: playlists[i].id },
            data: {
                coverUrl: `${THEMED_PHOTOS[i % THEMED_PHOTOS.length]}?w=1000&q=90&fit=crop&auto=format`
            }
        });
    }
    console.log(`✅ Refined ${playlists.length} playlist covers.`);

    console.log('🚀 Visual Archive Update Complete!');
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
