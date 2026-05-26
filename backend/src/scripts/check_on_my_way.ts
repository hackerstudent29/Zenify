import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tracks = await prisma.track.findMany({
    where: {
      title: {
        contains: 'On My Way',
        mode: 'insensitive',
      },
    },
    include: {
      album: true,
      artist: true,
    },
  });

  console.log(`Found ${tracks.length} tracks matching "On My Way":`);
  for (const track of tracks) {
    console.log(`Track: ${track.title} (ID: ${track.id})`);
    console.log(`  Artist: ${track.artist?.name} (ID: ${track.artistId})`);
    console.log(`  Album: ${track.album?.title} (ID: ${track.albumId})`);
    console.log(`  Genre: ${track.genre}`);
    console.log(`  Cover URL: ${track.coverUrl}`);
  }

  const albums = await prisma.album.findMany({
    where: {
      title: {
        contains: 'On My Way',
        mode: 'insensitive',
      },
    },
    include: {
      artist: true,
      tracks: true,
    },
  });

  console.log(`\nFound ${albums.length} albums matching "On My Way":`);
  for (const album of albums) {
    console.log(`Album: ${album.title} (ID: ${album.id})`);
    console.log(`  Artist: ${album.artist?.name}`);
    console.log(`  Number of tracks: ${album.tracks.length}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
