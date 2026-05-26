import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const genres = ['Tamil Folk', 'Hip-Hop', 'Melody', 'Mass', 'Chill', 'Phonk'];
    
    console.log("Genre Track Counts:");
    for (const genre of genres) {
        const count = await prisma.track.count({
            where: {
                genre: { equals: genre, mode: 'insensitive' },
                deletedAt: null
            }
        });
        console.log(`${genre}: ${count}`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
