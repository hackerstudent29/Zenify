import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Searching for albums for artist ID 4c2bc483-9e6f-4d8a-99ba-4f74b79bfb51...");
    
    const albums = await prisma.album.findMany({
        where: { artistId: "4c2bc483-9e6f-4d8a-99ba-4f74b79bfb51" }
    });

    console.log("Albums:", albums);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
