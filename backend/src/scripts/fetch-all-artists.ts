import { PrismaClient } from '@prisma/client';
import { AIArtistService } from '../services/ai-artist.service';

const prisma = new PrismaClient();

async function run() {
    console.log('[Script] Starting Artist Enrichment...');
    const artists = await prisma.artist.findMany();
    
    for (const artist of artists) {
        if (artist.name === 'Anirudh Ravichander' || artist.name === 'The Weeknd') {
            console.log(`[Script] Skipping ${artist.name} (keeping current images)`);
            continue;
        }
        
        console.log(`[Script] Fetching images for: ${artist.name}`);
        try {
            const enriched = await AIArtistService.enrichArtistProfile(artist.name);
            if (enriched.imageUrl || enriched.coverUrl) {
                await prisma.artist.update({
                    where: { id: artist.id },
                    data: {
                        imageUrl: enriched.imageUrl || artist.imageUrl,
                        coverUrl: enriched.coverUrl || artist.coverUrl
                    }
                });
                console.log(`[Script] Updated ${artist.name} successfully.`);
            } else {
                console.log(`[Script] No images found for ${artist.name}.`);
            }
        } catch (err) {
            console.error(`[Script] Failed for ${artist.name}:`, err);
        }
        
        // Sleep to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('[Script] Done.');
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
