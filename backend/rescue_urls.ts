
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('🚀 Running URL Rescue Script...');

    const tracks = await prisma.track.findMany({
        where: { coverUrl: { contains: 'unsplash.com' } }
    });

    for (const track of tracks) {
        // Clean up the URL. Keep only the base and add standardized params.
        // Example: https://images.unsplash.com/photo-1514525253361-b83f859b73c0?auto=format&fit=crop&q=80&w=800
        const match = track.coverUrl?.match(/photo-([a-zA-Z0-9-]+)/);
        if (match) {
            const id = match[1];
            const newUrl = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=800`;
            await prisma.track.update({
                where: { id: track.id },
                data: { coverUrl: newUrl }
            });
            console.log(`✅ Fixed Track: ${track.title}`);
        }
    }

    const albums = await prisma.album.findMany({
        where: { coverUrl: { contains: 'unsplash.com' } }
    });

    for (const album of albums) {
        const match = album.coverUrl?.match(/photo-([a-zA-Z0-9-]+)/);
        if (match) {
            const id = match[1];
            const newUrl = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=800`;
            await prisma.album.update({
                where: { id: album.id },
                data: { coverUrl: newUrl }
            });
            console.log(`✅ Fixed Album: ${album.title}`);
        }
    }

    const playlists = await prisma.playlist.findMany({
        where: { coverUrl: { contains: 'unsplash.com' } }
    });

    for (const playlist of playlists) {
        const match = playlist.coverUrl?.match(/photo-([a-zA-Z0-9-]+)/);
        if (match) {
            const id = match[1];
            const newUrl = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=800`;
            await prisma.playlist.update({
                where: { id: playlist.id },
                data: { coverUrl: newUrl }
            });
            console.log(`✅ Fixed Playlist: ${playlist.name}`);
        }
    }

    // Fix Artists
    const artists = await prisma.artist.findMany({
        where: { imageUrl: { contains: 'unsplash.com' } }
    });

    for (const artist of artists) {
        const match = artist.imageUrl?.match(/photo-([a-zA-Z0-9-]+)/);
        if (match) {
            const id = match[1];
            const newUrl = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=800`;
            await prisma.artist.update({
                where: { id: artist.id },
                data: { imageUrl: newUrl }
            });
            console.log(`✅ Fixed Artist: ${artist.name}`);
        }
    }

    console.log('✨ Rescue Mission Complete.');
    await prisma.$disconnect();
}

main();
