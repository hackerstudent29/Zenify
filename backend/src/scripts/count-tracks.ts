import { prisma } from '../utils/prisma.js';

async function main() {
    console.log('[TracksCount] Fetching track statistics from database...');
    try {
        const count = await prisma.track.count({
            where: { deletedAt: null }
        });
        const byStatus = await prisma.track.groupBy({
            by: ['releaseStatus'],
            _count: { _all: true }
        });
        
        console.log(`[TracksCount] Total published/active tracks (deletedAt: null): ${count}`);
        console.log('[TracksCount] Grouped by status:');
        byStatus.forEach(g => {
            console.log(`  - ${g.releaseStatus}: ${g._count._all}`);
        });
    } catch (e: any) {
        console.error('[TracksCount] Error querying database:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
