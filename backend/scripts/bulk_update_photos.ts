import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const musicPhotos = [
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745',
    'https://images.unsplash.com/photo-1493225255756-d9584f8606e9',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
    'https://images.unsplash.com/photo-1514525253361-b83f859b73c0',
    'https://images.unsplash.com/photo-1459749411177-042180ce6a32',
    'https://images.unsplash.com/photo-1507838595010-768a41120056',
    'https://images.unsplash.com/photo-1477233534935-f5e6fe7c1159',
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d',
    'https://images.unsplash.com/photo-1510915361894-db8b60106cb1',
    'https://images.unsplash.com/photo-1420182223722-5bc36854b767',
    'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04',
    'https://images.unsplash.com/photo-1453090927415-5f45085b65c0',
    'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad',
    'https://images.unsplash.com/photo-1510750667821-d8282012105d',
    'https://images.unsplash.com/photo-1446064448874-883a25adead3',
    'https://images.unsplash.com/photo-1516280440614-37939bbacd81',
    'https://images.unsplash.com/photo-1535478044878-3ed83003c563',
    'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17',
    'https://images.unsplash.com/photo-1518609878373-06d740f60d8b',
    'https://images.unsplash.com/photo-1501612780327-4504349ed37f',
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d',
    'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745',
];

const artistPhotos = [
    'https://images.unsplash.com/photo-1520859325812-70659392e27b',
    'https://images.unsplash.com/photo-1508919880461-127395a12330',
    'https://images.unsplash.com/photo-1504173010664-32509ac1fd20',
    'https://images.unsplash.com/photo-1499996860823-521a8ca41ff4',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
    'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce',
];

async function main() {
    console.log('Starting bulk photo update...');

    // Update Tracks
    const tracks = await prisma.track.findMany();
    for (let i = 0; i < tracks.length; i++) {
        const photoUrl = musicPhotos[i % musicPhotos.length] + '?w=800&q=80';
        await prisma.track.update({
            where: { id: tracks[i].id },
            data: { coverUrl: photoUrl }
        });
    }
    console.log(`Updated ${tracks.length} tracks.`);

    // Update Artists
    const artists = await prisma.artist.findMany();
    for (let i = 0; i < artists.length; i++) {
        const photoUrl = artistPhotos[i % artistPhotos.length] + '?w=400&q=80';
        await prisma.artist.update({
            where: { id: artists[i].id },
            data: { imageUrl: photoUrl }
        });
    }
    console.log(`Updated ${artists.length} artists.`);

    // Update Playlists
    const playlists = await prisma.playlist.findMany();
    for (let i = 0; i < playlists.length; i++) {
        const photoUrl = musicPhotos[(i + 10) % musicPhotos.length] + '?w=800&q=80';
        await prisma.playlist.update({
            where: { id: playlists[i].id },
            data: { coverUrl: photoUrl }
        });
    }
    console.log(`Updated ${playlists.length} playlists.`);

    console.log('Bulk update complete!');
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
