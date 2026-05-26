import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const badAlbums = await prisma.album.findMany({
        where: {
            title: {
                contains: 'I',
                mode: 'insensitive'
            }
        },
        include: {
            artist: true
        }
    });
    
    console.log("Albums with 'I' in title:");
    badAlbums.forEach(a => console.log(`- [${a.id}] ${a.title} by ${a.artist?.name}`));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
