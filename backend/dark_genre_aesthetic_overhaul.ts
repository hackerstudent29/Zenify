
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const VERIFIED_AESTHETICS = [
    "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17", // Cyber city
    "https://images.unsplash.com/photo-1493225255756-d9584f8606e9", // Mixer
    "https://images.unsplash.com/photo-1470225620353-fb4b183b523e", // DJ
    "https://images.unsplash.com/photo-1514525253361-b83f859b73c0", // Concert
    "https://images.unsplash.com/photo-1557672172-298e090bd0f1", // Abstract 1
    "https://images.unsplash.com/photo-1541701494587-cb58502866ab", // Abstract 2
    "https://images.unsplash.com/photo-1549490349-8643362247b5", // Studio
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4", // Mic
    "https://images.unsplash.com/photo-1510915361894-db8b60106cb1", // DJ Hands
    "https://images.unsplash.com/photo-1516280440623-05b9938eb570", // Neon
    "https://images.unsplash.com/photo-1453090927415-5f45085b65c0", // Minimal gear
    "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04", // Piano
    "https://images.unsplash.com/photo-1508733213583-4359000a4023", // Dark vibes
    "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0", // Purple abstract
    "https://images.unsplash.com/photo-1574169208507-84376144848b"  // High tech
];

async function main() {
    console.log('🚀 FORCING SYNC WITH VERIFIED WORKING IMAGES...');

    const tracks = await prisma.track.findMany();
    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track.coverUrl?.includes('/public/music/')) continue;

        const url = VERIFIED_AESTHETICS[i % VERIFIED_AESTHETICS.length];
        await prisma.track.update({
            where: { id: track.id },
            data: { coverUrl: `${url}?auto=format&fit=crop&q=100&w=800` }
        });
    }

    const albums = await prisma.album.findMany();
    for (let i = 0; i < albums.length; i++) {
        const url = VERIFIED_AESTHETICS[(i + 5) % VERIFIED_AESTHETICS.length];
        await prisma.album.update({
            where: { id: albums[i].id },
            data: { coverUrl: `${url}?auto=format&fit=crop&q=100&w=800` }
        });
    }

    const playlists = await prisma.playlist.findMany();
    for (let i = 0; i < playlists.length; i++) {
        const url = VERIFIED_AESTHETICS[(i + 10) % VERIFIED_AESTHETICS.length];
        await prisma.playlist.update({
            where: { id: playlists[i].id },
            data: { coverUrl: `${url}?auto=format&fit=crop&q=100&w=1200` }
        });
    }

    const artists = await prisma.artist.findMany();
    for (let i = 0; i < artists.length; i++) {
        const url = VERIFIED_AESTHETICS[(i + 3) % VERIFIED_AESTHETICS.length];
        await prisma.artist.update({
            where: { id: artists[i].id },
            data: { imageUrl: `${url}?auto=format&fit=crop&q=100&w=400` }
        });
    }

    console.log('✅ SYNC COMPLETE. REFRESH NOW.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
