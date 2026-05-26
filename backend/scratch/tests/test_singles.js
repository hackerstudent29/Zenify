const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const singles = await prisma.track.findMany({
        where: { albumId: null, deletedAt: null },
        include: { artist: true }
    });

    console.log(`There are ${singles.length} singles (no albumId, not deleted).`);

    // Check if any singles belong to 'Coolie' or 'Devara' intuitively
    const keywords = ['coolie', 'devara'];
    const matchingSingles = singles.filter(s =>
        keywords.some(k => s.title.toLowerCase().includes(k))
    );

    console.log(`Matching singles to "Coolie" or "Devara":`, matchingSingles.length);
    if (matchingSingles.length > 0) {
        console.dir(matchingSingles, { depth: null });
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
