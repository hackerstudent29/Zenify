import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const badAlbums = await prisma.album.findMany({
        where: {
            artist: {
                name: 'Atlxs'
            }
        }
    });
    
    console.log("Albums by Atlxs:");
    badAlbums.forEach(a => console.log(`- [${a.id}] ${a.title}`));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
