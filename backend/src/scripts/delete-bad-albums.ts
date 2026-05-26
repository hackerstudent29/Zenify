import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const idsToDelete = [
        'b14851b0-648c-446d-bba3-9ea7ab1e8d29',
        'feab21e5-199c-4952-8d74-0cfa9cba7883',
        '65c736d3-e9e8-46ff-8a1b-1c884cd157f5'
    ];

    console.log("Deleting tracks associated with bad albums...");
    await prisma.track.deleteMany({
        where: {
            albumId: {
                in: idsToDelete
            }
        }
    });

    console.log("Deleting bad albums...");
    const result = await prisma.album.deleteMany({
        where: {
            id: {
                in: idsToDelete
            }
        }
    });
    
    console.log(`Deleted ${result.count} albums.`);

    // Clear caches in redis if needed, but the homepage service caches in memory.
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
