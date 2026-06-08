import { PrismaClient } from '@prisma/client';
import { PaletteService } from '../services/palette.service';

const prisma = new PrismaClient();

async function main() {
    console.log("Forcing re-extraction of all palettes using node-vibrant...");
    
    // Clear all palettes to force backfill
    await prisma.track.updateMany({ data: { palette: null as any } });
    await prisma.album.updateMany({ data: { palette: null as any } });
    
    console.log("All palettes cleared. Running backfill...");
    
    // We'll run in a loop to ensure everything is backfilled if there are thousands
    let pending = await PaletteService.getPendingCount();
    while (pending.tracks > 0 || pending.albums > 0) {
        console.log(`Pending: ${pending.tracks} tracks, ${pending.albums} albums`);
        await PaletteService.backfillAll(500);
        pending = await PaletteService.getPendingCount();
    }
    
    console.log("Force backfill complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
