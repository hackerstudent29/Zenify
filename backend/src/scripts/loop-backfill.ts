import { PaletteService } from '../services/palette.service';
import { prisma } from '../utils/prisma';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function main() {
    console.log("Starting continuous script-based palette backfill...");
    
    let pending = await PaletteService.getPendingCount();
    let totalProcessed = 0;

    while (pending.tracks > 0 || pending.albums > 0) {
        console.log(`\nPending: ${pending.tracks} tracks, ${pending.albums} albums`);
        console.log("Processing next batch of 200...");
        
        // Smaller batch size to prevent Supabase connection exhaustion
        const result = await PaletteService.backfillAll(200);
        totalProcessed += result.tracks + result.albums;
        
        console.log(`Batch complete. Extracted: ${result.tracks} tracks, ${result.albums} albums.`);
        
        // Flush cache so the frontend can immediately see the new colors
        if (totalProcessed > 0) {
            console.log("Flushing Redis cache...");
            await redis.flushall();
        }

        // Small delay to let the database breathe
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        pending = await PaletteService.getPendingCount();
    }
    
    console.log(`\n✅ Backfill completely finished! Processed a total of ${totalProcessed} items.`);
}

main().catch(err => {
    console.error("Backfill failed:", err);
    process.exit(1);
}).finally(() => {
    prisma.$disconnect();
    redis.quit();
});
