import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Cleaning DB tracks & related...');
    // Delete tracks first to avoid foreign key errors for related things
    await prisma.track.deleteMany();
    // Delete albums
    await prisma.album.deleteMany();
    // Delete artists
    await prisma.artist.deleteMany();
    // Delete playlists
    await prisma.playlist.deleteMany();

    console.log('Database cleaned successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
