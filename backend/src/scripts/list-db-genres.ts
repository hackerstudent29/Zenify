import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const counts = await prisma.track.groupBy({
        by: ['genre'],
        _count: {
            genre: true
        }
    });
    
    console.log("Actual Genres in DB:");
    console.log(JSON.stringify(counts, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
