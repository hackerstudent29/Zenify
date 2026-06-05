import { PaletteService } from '../services/palette.service';
import { prisma } from '../utils/prisma';

async function main() {
    console.log("Starting script-based palette backfill...");
    const counts = await PaletteService.getPendingCount();
    console.log(`Pending tracks: ${counts.tracks}, Pending albums: ${counts.albums}`);
    
    // Run backfill for a larger batch size (500)
    const result = await PaletteService.backfillAll(500);
    console.log("Backfill result:", result);
    
    await prisma.$disconnect();
}

main().catch(err => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
