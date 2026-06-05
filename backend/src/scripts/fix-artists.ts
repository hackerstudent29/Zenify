import { PrismaClient } from '@prisma/client';
import { AIArtistService } from '../services/ai-artist.service';
import { normalizeArtistName } from '../utils/artist';
import { config } from 'dotenv';
config(); // Load .env

const prisma = new PrismaClient();

async function fixArtists() {
    console.log('[Script] Starting Artist Fix & Backfill...');

    // 1. Fix Artists with ui-avatars.com
    const brokenArtists = await prisma.artist.findMany({
        where: {
            imageUrl: { contains: 'ui-avatars.com' }
        }
    });

    console.log(`[Script] Found ${brokenArtists.length} artists with broken ui-avatars.com images.`);

    for (const artist of brokenArtists) {
        console.log(`[Script] Re-enriching: ${artist.name}`);
        const enriched = await AIArtistService.enrichArtistProfile(artist.name);
        
        await prisma.artist.update({
            where: { id: artist.id },
            data: {
                imageUrl: enriched.imageUrl || null,
                coverUrl: enriched.coverUrl || null,
                birthDate: enriched.dob || null,
                role: enriched.genre || null,
                bio: enriched.bio || artist.bio
            }
        });
        
        // Sleep to avoid rate limits
        await new Promise(r => setTimeout(r, 1000));
    }

    // 2. Extract featured artists from Tracks and create missing profiles
    console.log(`[Script] Scanning tracks for missing featured artists...`);
    const tracks = await prisma.track.findMany({
        where: { featuredArtists: { not: null } },
        select: { id: true, title: true, featuredArtists: true }
    });

    const missingArtists = new Set<string>();

    for (const track of tracks) {
        if (!track.featuredArtists) continue;
        const features = track.featuredArtists.split(',').map(s => s.trim()).filter(Boolean);
        for (const f of features) {
            missingArtists.add(f);
        }
    }

    console.log(`[Script] Found ${missingArtists.size} unique featured artist names.`);

    let createdCount = 0;
    for (const featuredName of missingArtists) {
        const normName = normalizeArtistName(featuredName);
        const existing = await prisma.artist.findUnique({ where: { name: normName } });
        
        if (!existing) {
            console.log(`[Script] Creating missing profile for: ${normName}`);
            const enriched = await AIArtistService.enrichArtistProfile(normName);
            await prisma.artist.create({
                data: {
                    name: normName,
                    bio: enriched.bio || `Featured artist`,
                    imageUrl: enriched.imageUrl || null,
                    coverUrl: enriched.coverUrl || null,
                    birthDate: enriched.dob || null,
                    role: enriched.genre || null
                }
            });
            createdCount++;
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    console.log(`[Script] Created ${createdCount} missing artist profiles.`);
    console.log('[Script] Done.');
    process.exit(0);
}

fixArtists().catch(e => {
    console.error(e);
    process.exit(1);
});
